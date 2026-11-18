import * as pdfjsLib from 'pdfjs-dist';
import type {
  ExamKind,
  FileRecord,
  FileStatus,
  FileTypeCategory,
  FileVersionRecord,
  LanguageCode,
  MiddleSchoolLevel,
  SectionNode,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { computeBlobSha256, generateId } from './crypto';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  // Handled gracefully
}

export interface StorageStats {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isNearFull: boolean;
  persisted: boolean;
}

export interface PreparedUploadCandidate {
  tempId: string;
  originalFile: File;
  processedBlob: Blob;
  title: string;
  originalFileName: string;
  mimeType: string;
  extension: string;
  fileCategory: FileTypeCategory;
  size: number;
  hash: string;
  thumbnailBlob: Blob | null;
  pageCount: number | null;
  duplicates: FileRecord[];
  resolution: 'keep_both' | 'use_existing' | 'replace';
  replaceTargetId?: string;
}

export function detectFileCategory(
  mimeType: string,
  extension: string,
  externalUrl?: string
): FileTypeCategory {
  if (externalUrl) return 'video';
  const ext = (extension || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mime.includes('wordprocessingml')) return 'word';
  if (
    ['xlsx', 'xls', 'csv', 'ods'].includes(ext) ||
    mime.includes('spreadsheet') ||
    mime.includes('csv')
  ) {
    return 'excel';
  }
  if (
    ['ppt', 'pptx', 'odp'].includes(ext) ||
    mime.includes('presentationml') ||
    mime.includes('powerpoint')
  ) {
    return 'ppt';
  }
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) {
    return 'image';
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
    return 'audio';
  }
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return 'video';
  }
  return 'other';
}

export function getFileTitle(file: FileRecord): string {
  return file.title?.trim() || file.name;
}

export function getFileStatus(file: FileRecord): FileStatus {
  if (file.deletedAt) return 'trashed';
  return file.status ?? 'active';
}

export class FilesService {
  private onFileSavedListener?: (file: FileRecord) => void;

  constructor(private adapter: IDataAdapter) {}

  setOnFileSavedListener(listener: (file: FileRecord) => void): void {
    this.onFileSavedListener = listener;
  }

  private notifyFileSaved(file: FileRecord): void {
    if (this.onFileSavedListener && getFileStatus(file) === 'active') {
      this.onFileSavedListener(file);
    }
  }

  async listBySection(
    academicYearId: string,
    sectionId: string,
    options?: { includeArchived?: boolean }
  ): Promise<FileRecord[]> {
    const all = await this.adapter.queryByYear('files', academicYearId);
    return all
      .filter((f) => {
        if (f.sectionId !== sectionId) return false;
        const st = getFileStatus(f);
        if (st === 'trashed') return false;
        if (st === 'archived' && !options?.includeArchived) return false;
        return true;
      })
      .sort((a, b) => {
        if ((a.termNumber ?? 0) !== (b.termNumber ?? 0)) {
          return (a.termNumber ?? 0) - (b.termNumber ?? 0);
        }
        if (a.order !== b.order) return a.order - b.order;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  async listAllForYear(
    academicYearId: string,
    options?: { includeArchived?: boolean; includeTrashed?: boolean }
  ): Promise<FileRecord[]> {
    const all = await this.adapter.queryByYear('files', academicYearId);
    return all.filter((f) => {
      const st = getFileStatus(f);
      if (st === 'trashed' && !options?.includeTrashed) return false;
      if (st === 'archived' && !options?.includeArchived) return false;
      return true;
    });
  }

  async listFavorites(academicYearId: string): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return all.filter((f) => f.isFavorite);
  }

  async listPinned(academicYearId: string): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return all.filter((f) => Boolean(f.pinned));
  }

  async listRecentlyAdded(academicYearId: string, limit = 12): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  }

  async listRecentlyOpened(academicYearId: string, limit = 12): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return all
      .filter((f) => Boolean(f.lastOpenedAt))
      .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
      .slice(0, limit);
  }

  async listContinueReading(academicYearId: string, limit = 10): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return all
      .filter(
        (f) =>
          (f.fileCategory === 'pdf' || f.extension.toLowerCase() === 'pdf') &&
          (f.lastReadPage ?? 0) > 1 &&
          (f.pageCount ? (f.lastReadPage ?? 0) <= f.pageCount : true)
      )
      .sort((a, b) => (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt))
      .slice(0, limit);
  }

  async getById(id: string): Promise<FileRecord | undefined> {
    return this.adapter.getById('files', id);
  }

  async getFolderStats(
    academicYearId: string,
    sectionIds: string[]
  ): Promise<{ count: number; totalBytes: number; lastUpdated: string | null }> {
    const idSet = new Set(sectionIds);
    const all = await this.listAllForYear(academicYearId);
    let count = 0;
    let totalBytes = 0;
    let lastUpdated: string | null = null;
    for (const f of all) {
      if (!idSet.has(f.sectionId)) continue;
      count++;
      totalBytes += f.size;
      if (!lastUpdated || f.updatedAt > lastUpdated) {
        lastUpdated = f.updatedAt;
      }
    }
    return { count, totalBytes, lastUpdated };
  }

  async inferSectionDefaults(
    academicYearId: string,
    sectionId: string
  ): Promise<{
    levelCode: MiddleSchoolLevel | null;
    subjectId: string | null;
    termNumber?: 1 | 2 | 3;
    subsectionId: string | null;
  }> {
    const allSections = await this.adapter.queryByYear('sections', academicYearId);
    const byId = new Map<string, SectionNode>(allSections.map((s) => [s.id, s]));
    let curr = byId.get(sectionId);
    let levelCode: MiddleSchoolLevel | null = null;
    let subjectId: string | null = null;
    let termNumber: 1 | 2 | 3 | undefined;
    const subsectionId = curr && curr.parentId ? curr.id : null;

    while (curr) {
      if (!levelCode && curr.levelCode) levelCode = curr.levelCode;
      if (!subjectId && curr.subjectId) subjectId = curr.subjectId;
      if (!termNumber && curr.termNumber) termNumber = curr.termNumber;
      curr = curr.parentId ? byId.get(curr.parentId) : undefined;
    }

    return { levelCode, subjectId, termNumber, subsectionId };
  }

  async findDuplicatesByHash(academicYearId: string, hash: string): Promise<FileRecord[]> {
    if (!hash) return [];
    const all = await this.listAllForYear(academicYearId, { includeArchived: true });
    return all.filter((f) => f.hash === hash);
  }

  /**
   * Automatic client-side image compression for large photos/scans.
   */
  async compressImageBlob(blob: Blob, mimeType: string, force = false): Promise<Blob> {
    if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') return blob;
    if (!force && blob.size < 320 * 1024) return blob;
    return new Promise<Blob>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(blob);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outType = mimeType === 'image/png' && !force ? 'image/png' : 'image/jpeg';
        canvas.toBlob(
          (compressed) => {
            if (compressed && compressed.size < blob.size) {
              resolve(compressed);
            } else {
              resolve(blob);
            }
          },
          outType,
          0.8
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      img.src = url;
    });
  }

  async generateThumbnailAndPages(
    blob: Blob,
    category: FileTypeCategory
  ): Promise<{ thumbnailBlob: Blob | null; pageCount: number | null }> {
    if (category === 'image' && blob.type !== 'image/svg+xml') {
      const thumb = await new Promise<Blob | null>((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(url);
          const maxDim = 280;
          const ratio = Math.min(maxDim / img.width, maxDim / img.height, 1);
          const w = Math.max(1, Math.round(img.width * ratio));
          const h = Math.max(1, Math.round(img.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((res) => resolve(res), 'image/jpeg', 0.72);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      });
      return { thumbnailBlob: thumb, pageCount: 1 };
    }

    if (category === 'pdf') {
      try {
        const buf = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const pageCount = doc.numPages || 1;
        const page = await doc.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 240;
        const scale = Math.max(0.25, Math.min(1.2, targetWidth / Math.max(baseViewport.width, 1)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(viewport.width));
        canvas.height = Math.max(1, Math.round(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) return { thumbnailBlob: null, pageCount };
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const thumb = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((res) => resolve(res), 'image/jpeg', 0.72)
        );
        return { thumbnailBlob: thumb, pageCount };
      } catch {
        return { thumbnailBlob: null, pageCount: null };
      }
    }

    return { thumbnailBlob: null, pageCount: null };
  }

  async prepareUploadCandidates(
    ctx: ServiceContext,
    files: File[],
    options?: {
      compressImages?: boolean;
      onProgress?: (percent: number, currentFileName: string) => void;
    }
  ): Promise<PreparedUploadCandidate[]> {
    const candidates: PreparedUploadCandidate[] = [];
    const total = files.length || 1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      options?.onProgress?.(Math.round((i / total) * 100), file.name);
      const ext = file.name.includes('.')
        ? file.name.split('.').pop()?.toLowerCase() ?? ''
        : '';
      const mime = file.type || 'application/octet-stream';
      const category = detectFileCategory(mime, ext);
      const processedBlob =
        options?.compressImages !== false ? await this.compressImageBlob(file, mime) : file;
      const hash = await computeBlobSha256(processedBlob);
      const duplicates = await this.findDuplicatesByHash(ctx.academicYearId, hash);
      const { thumbnailBlob, pageCount } = await this.generateThumbnailAndPages(
        processedBlob,
        category
      );

      const baseTitle = file.name.includes('.')
        ? file.name.slice(0, file.name.lastIndexOf('.'))
        : file.name;

      candidates.push({
        tempId: generateId(),
        originalFile: file,
        processedBlob,
        title: baseTitle || file.name,
        originalFileName: file.name,
        mimeType: processedBlob.type || mime,
        extension: ext,
        fileCategory: category,
        size: processedBlob.size,
        hash,
        thumbnailBlob,
        pageCount,
        duplicates,
        resolution: 'keep_both',
        replaceTargetId: duplicates[0]?.id,
      });
    }

    options?.onProgress?.(100, '');
    return candidates;
  }

  async commitPreparedUploads(
    ctx: ServiceContext,
    sectionId: string,
    candidates: PreparedUploadCandidate[],
    metadata: {
      levelCode?: MiddleSchoolLevel | null;
      subjectId?: string | null;
      termNumber?: 1 | 2 | 3;
      tags?: string[];
      description?: string;
      authorSource?: string;
      language?: LanguageCode;
      examKind?: ExamKind;
      hasQrMap?: boolean;
    }
  ): Promise<FileRecord[]> {
    const existing = await this.listBySection(ctx.academicYearId, sectionId);
    let maxOrder = existing.reduce((m, f) => Math.max(m, f.order), 0);
    const defaults = await this.inferSectionDefaults(ctx.academicYearId, sectionId);
    const saved: FileRecord[] = [];
    const now = new Date().toISOString();

    for (const c of candidates) {
      if (c.resolution === 'use_existing' && c.duplicates[0]) {
        saved.push(c.duplicates[0]);
        continue;
      }

      if (c.resolution === 'replace' && (c.replaceTargetId || c.duplicates[0]?.id)) {
        const targetId = c.replaceTargetId || c.duplicates[0].id;
        const updated = await this.replaceFileWithBlob(ctx, targetId, {
          blob: c.processedBlob,
          fileName: c.originalFileName,
          mimeType: c.mimeType,
          extension: c.extension,
          hash: c.hash,
          thumbnailBlob: c.thumbnailBlob,
          pageCount: c.pageCount,
          note: metadata.description || 'Updated copy',
        });
        if (updated) saved.push(updated);
        continue;
      }

      maxOrder += 1;
      const cleanTitle = c.title.trim() || c.originalFileName;
      const record: FileRecord = {
        id: generateId(),
        sectionId,
        subsectionId: defaults.subsectionId,
        name: cleanTitle,
        title: cleanTitle,
        originalFileName: c.originalFileName,
        mimeType: c.mimeType,
        fileCategory: c.fileCategory,
        size: c.size,
        extension: c.extension,
        hash: c.hash,
        blob: c.processedBlob,
        thumbnailBlob: c.thumbnailBlob,
        levelCode: metadata.levelCode ?? defaults.levelCode,
        subjectId: metadata.subjectId ?? defaults.subjectId,
        tags: Array.from(new Set((metadata.tags ?? []).map((t) => t.trim()).filter(Boolean))),
        description: metadata.description?.trim() ?? '',
        authorSource: metadata.authorSource?.trim() ?? '',
        language: metadata.language ?? 'ar',
        pageCount: c.pageCount,
        lastReadPage: c.fileCategory === 'pdf' ? 1 : null,
        isFavorite: false,
        pinned: false,
        status: 'active',
        archivedAt: null,
        trashedAt: null,
        order: maxOrder,
        termNumber: metadata.termNumber ?? defaults.termNumber,
        examKind: metadata.examKind,
        linkedSolutionFileId: null,
        hasQrMap: Boolean(metadata.hasQrMap),
        qrPayload: null,
        versionCount: 1,
        openCount: 0,
        lastOpenedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: ctx.ownerId,
        schoolId: ctx.schoolId,
        academicYearId: ctx.academicYearId,
      };
      await this.adapter.put('files', record);
      this.notifyFileSaved(record);
      saved.push(record);
    }

    return saved;
  }

  async uploadFiles(
    ctx: ServiceContext,
    sectionId: string,
    files: File[],
    options?: {
      tags?: string[];
      termNumber?: 1 | 2 | 3;
      examKind?: ExamKind;
      levelCode?: MiddleSchoolLevel | null;
      subjectId?: string | null;
      description?: string;
      authorSource?: string;
      compressImages?: boolean;
      onProgress?: (percent: number, currentFileName: string) => void;
    }
  ): Promise<FileRecord[]> {
    const candidates = await this.prepareUploadCandidates(ctx, files, {
      compressImages: options?.compressImages,
      onProgress: options?.onProgress,
    });
    return this.commitPreparedUploads(ctx, sectionId, candidates, {
      tags: options?.tags,
      termNumber: options?.termNumber,
      examKind: options?.examKind,
      levelCode: options?.levelCode,
      subjectId: options?.subjectId,
      description: options?.description,
      authorSource: options?.authorSource,
    });
  }

  async addExternalLink(
    ctx: ServiceContext,
    sectionId: string,
    params: {
      name: string;
      url: string;
      tags?: string[];
      description?: string;
      levelCode?: MiddleSchoolLevel | null;
      subjectId?: string | null;
      termNumber?: 1 | 2 | 3;
    }
  ): Promise<FileRecord> {
    const existing = await this.listBySection(ctx.academicYearId, sectionId);
    const maxOrder = existing.reduce((m, f) => Math.max(m, f.order), 0);
    const defaults = await this.inferSectionDefaults(ctx.academicYearId, sectionId);
    const now = new Date().toISOString();
    const record: FileRecord = {
      id: generateId(),
      sectionId,
      subsectionId: defaults.subsectionId,
      name: params.name.trim(),
      title: params.name.trim(),
      originalFileName: params.url.trim(),
      mimeType: 'text/uri-list',
      fileCategory: 'video',
      size: 0,
      extension: 'url',
      externalUrl: params.url.trim(),
      levelCode: params.levelCode ?? defaults.levelCode,
      subjectId: params.subjectId ?? defaults.subjectId,
      tags: params.tags ?? [],
      description: params.description?.trim() ?? '',
      isFavorite: false,
      pinned: false,
      status: 'active',
      archivedAt: null,
      trashedAt: null,
      order: maxOrder + 1,
      termNumber: params.termNumber ?? defaults.termNumber,
      lastOpenedAt: null,
      openCount: 0,
      versionCount: 1,
      hasQrMap: true,
      qrPayload: params.url.trim(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('files', record);
    this.notifyFileSaved(record);
    return record;
  }

  async updateMetadata(
    fileId: string,
    patch: Partial<
      Pick<
        FileRecord,
        | 'name'
        | 'title'
        | 'description'
        | 'authorSource'
        | 'language'
        | 'levelCode'
        | 'subjectId'
        | 'termNumber'
        | 'tags'
        | 'hasQrMap'
        | 'qrPayload'
        | 'sectionId'
        | 'isFavorite'
        | 'pinned'
      >
    >
  ): Promise<FileRecord | undefined> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return undefined;
    const nextTitle = patch.title !== undefined ? patch.title.trim() : patch.name?.trim();
    const updated: FileRecord = {
      ...f,
      ...patch,
      title: nextTitle !== undefined ? nextTitle : f.title ?? f.name,
      name: nextTitle !== undefined ? nextTitle : f.name,
      tags:
        patch.tags !== undefined
          ? Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean)))
          : f.tags,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    };
    await this.adapter.put('files', updated);
    return updated;
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    await this.updateMetadata(fileId, { title: newName.trim(), name: newName.trim() });
  }

  async moveFile(fileId: string, targetSectionId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    const defaults = await this.inferSectionDefaults(f.academicYearId, targetSectionId);
    await this.adapter.put('files', {
      ...f,
      sectionId: targetSectionId,
      subsectionId: defaults.subsectionId,
      levelCode: defaults.levelCode ?? f.levelCode,
      subjectId: defaults.subjectId ?? f.subjectId,
      termNumber: defaults.termNumber ?? f.termNumber,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    });
  }

  async toggleFavorite(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      isFavorite: !f.isFavorite,
      updatedAt: new Date().toISOString(),
    });
  }

  async togglePin(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      pinned: !f.pinned,
      updatedAt: new Date().toISOString(),
    });
  }

  async updateTags(fileId: string, tags: string[]): Promise<void> {
    await this.updateMetadata(fileId, { tags });
  }

  async markOpened(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      lastOpenedAt: new Date().toISOString(),
      openCount: (f.openCount ?? 0) + 1,
    });
  }

  async updateLastReadPage(fileId: string, page: number): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    if (f.lastReadPage === page) return;
    await this.adapter.put('files', {
      ...f,
      lastReadPage: page,
    });
  }

  async linkSolution(examFileId: string, solutionFileId: string | null): Promise<void> {
    const f = await this.adapter.getById('files', examFileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      linkedSolutionFileId: solutionFileId,
      updatedAt: new Date().toISOString(),
    });
  }

  async reorderFiles(orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const updates: FileRecord[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const f = await this.adapter.getById('files', orderedIds[i]);
      if (f) updates.push({ ...f, order: i + 1, updatedAt: now });
    }
    await this.adapter.bulkPut('files', updates);
  }

  async replaceFileWithBlob(
    ctx: ServiceContext,
    fileId: string,
    next: {
      blob: Blob;
      fileName: string;
      mimeType: string;
      extension: string;
      hash: string;
      thumbnailBlob?: Blob | null;
      pageCount?: number | null;
      note: string;
    }
  ): Promise<FileRecord | undefined> {
    const existing = await this.adapter.getById('files', fileId);
    if (!existing) return undefined;
    const now = new Date().toISOString();
    const currentVersionNum = existing.versionCount ?? 1;

    // Archive current blob into fileVersions table
    const verRecord: FileVersionRecord = {
      id: generateId(),
      fileId: existing.id,
      versionNumber: currentVersionNum,
      fileName: existing.originalFileName || existing.name,
      mimeType: existing.mimeType,
      size: existing.size,
      hash: existing.hash || '',
      note: next.note || `v${currentVersionNum}`,
      blob: existing.blob,
      createdAt: existing.updatedAt || existing.createdAt,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: existing.academicYearId,
    };
    await this.adapter.put('fileVersions', verRecord);

    const updated: FileRecord = {
      ...existing,
      originalFileName: next.fileName,
      mimeType: next.mimeType,
      extension: next.extension,
      fileCategory: detectFileCategory(next.mimeType, next.extension),
      size: next.blob.size,
      hash: next.hash,
      blob: next.blob,
      thumbnailBlob: next.thumbnailBlob ?? existing.thumbnailBlob,
      pageCount: next.pageCount ?? existing.pageCount,
      versionCount: currentVersionNum + 1,
      updatedAt: now,
      syncStatus: 'local',
    };
    await this.adapter.put('files', updated);
    this.notifyFileSaved(updated);
    return updated;
  }

  async replaceFileWithUpload(
    ctx: ServiceContext,
    fileId: string,
    newFile: File,
    note: string
  ): Promise<FileRecord | undefined> {
    const ext = newFile.name.includes('.')
      ? newFile.name.split('.').pop()?.toLowerCase() ?? ''
      : '';
    const mime = newFile.type || 'application/octet-stream';
    const cat = detectFileCategory(mime, ext);
    const processedBlob = await this.compressImageBlob(newFile, mime);
    const hash = await computeBlobSha256(processedBlob);
    const { thumbnailBlob, pageCount } = await this.generateThumbnailAndPages(processedBlob, cat);
    return this.replaceFileWithBlob(ctx, fileId, {
      blob: processedBlob,
      fileName: newFile.name,
      mimeType: processedBlob.type || mime,
      extension: ext,
      hash,
      thumbnailBlob,
      pageCount,
      note,
    });
  }

  async listVersions(academicYearId: string, fileId: string): Promise<FileVersionRecord[]> {
    const all = await this.adapter.queryByYear('fileVersions', academicYearId);
    return all
      .filter((v) => v.fileId === fileId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  async restoreVersion(
    ctx: ServiceContext,
    fileId: string,
    versionId: string
  ): Promise<FileRecord | undefined> {
    const ver = await this.adapter.getById('fileVersions', versionId);
    if (!ver || ver.fileId !== fileId || !ver.blob) return undefined;
    const ext = ver.fileName.includes('.')
      ? ver.fileName.split('.').pop()?.toLowerCase() ?? ''
      : '';
    const cat = detectFileCategory(ver.mimeType, ext);
    const { thumbnailBlob, pageCount } = await this.generateThumbnailAndPages(ver.blob, cat);
    return this.replaceFileWithBlob(ctx, fileId, {
      blob: ver.blob,
      fileName: ver.fileName,
      mimeType: ver.mimeType,
      extension: ext,
      hash: ver.hash,
      thumbnailBlob,
      pageCount,
      note: `Restored v${ver.versionNumber}`,
    });
  }

  /**
   * Moves file to 30-day Trash cleanly (status='trashed').
   */
  async deleteFile(fileId: string): Promise<void> {
    const existing = await this.adapter.getById('files', fileId);
    if (!existing) return;
    const now = new Date().toISOString();
    await this.adapter.put('files', {
      ...existing,
      status: 'trashed',
      trashedAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  }

  async getStorageStats(): Promise<StorageStats> {
    let usageBytes = 0;
    let quotaBytes = 500 * 1024 * 1024;
    let persisted = false;
    if (typeof navigator !== 'undefined' && navigator.storage) {
      try {
        if (navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          usageBytes = est.usage ?? 0;
          quotaBytes = est.quota ?? quotaBytes;
        }
        if (navigator.storage.persisted) {
          persisted = await navigator.storage.persisted();
        }
      } catch {
        // Ignore browser storage API errors
      }
    }
    const percentUsed =
      quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 100)) : 0;
    return {
      usageBytes,
      quotaBytes,
      percentUsed,
      isNearFull: percentUsed >= 80,
      persisted,
    };
  }
}
