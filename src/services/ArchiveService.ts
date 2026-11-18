import type {
  AcademicYearRecord,
  FileRecord,
  FileTypeCategory,
  SectionNode,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { BackupService } from './BackupService';
import { computeBlobSha256, generateId } from './crypto';
import { detectFileCategory, FilesService, getFileStatus } from './FilesService';

export interface YearArchiveSummary {
  year: AcademicYearRecord;
  fileCount: number;
  totalBytes: number;
  sectionsCount: number;
  collectionsCount: number;
}

export interface StorageBreakdown {
  totalBytes: number;
  byCategory: Array<{ category: FileTypeCategory; count: number; bytes: number }>;
  bySection: Array<{ sectionId: string; section: SectionNode | undefined; count: number; bytes: number }>;
  byYear: Array<{ year: AcademicYearRecord; count: number; bytes: number }>;
  largestFiles: FileRecord[];
  duplicateGroupsCount: number;
  duplicateReclaimableBytes: number;
  compressibleImagesCount: number;
  compressibleImagesBytes: number;
}

const TRASH_RETENTION_DAYS = 30;

export class ArchiveService {
  constructor(
    private adapter: IDataAdapter,
    private filesService: FilesService,
    private backupService: BackupService
  ) {}

  // ==================== FILE & FOLDER ARCHIVING ====================

  async archiveFile(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    const now = new Date().toISOString();
    await this.adapter.put('files', {
      ...f,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  }

  async restoreArchivedFile(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    const now = new Date().toISOString();
    await this.adapter.put('files', {
      ...f,
      status: 'active',
      archivedAt: null,
      updatedAt: now,
      syncStatus: 'local',
    });
  }

  async archiveFolder(academicYearId: string, sectionId: string): Promise<number> {
    const sec = await this.adapter.getById('sections', sectionId);
    const now = new Date().toISOString();
    if (sec) {
      await this.adapter.put('sections', { ...sec, isHidden: true, updatedAt: now });
    }
    const files = await this.adapter.queryByYear('files', academicYearId);
    const updates: FileRecord[] = [];
    for (const f of files) {
      if (f.sectionId === sectionId && getFileStatus(f) === 'active') {
        updates.push({ ...f, status: 'archived', archivedAt: now, updatedAt: now });
      }
    }
    await this.adapter.bulkPut('files', updates);
    return updates.length;
  }

  async restoreFolder(academicYearId: string, sectionId: string): Promise<number> {
    const sec = await this.adapter.getById('sections', sectionId);
    const now = new Date().toISOString();
    if (sec) {
      await this.adapter.put('sections', { ...sec, isHidden: false, updatedAt: now });
    }
    const files = await this.adapter.queryByYear('files', academicYearId);
    const updates: FileRecord[] = [];
    for (const f of files) {
      if (f.sectionId === sectionId && getFileStatus(f) === 'archived') {
        updates.push({ ...f, status: 'active', archivedAt: null, updatedAt: now });
      }
    }
    await this.adapter.bulkPut('files', updates);
    return updates.length;
  }

  async listArchivedFiles(academicYearId: string): Promise<FileRecord[]> {
    const files = await this.adapter.queryByYear('files', academicYearId);
    return files
      .filter((f) => getFileStatus(f) === 'archived')
      .sort((a, b) => (b.archivedAt || b.updatedAt).localeCompare(a.archivedAt || a.updatedAt));
  }

  // ==================== 30-DAY TRASH ====================

  async listTrashedFiles(academicYearId: string): Promise<FileRecord[]> {
    const files = await this.adapter.queryByYear('files', academicYearId);
    const cutoff = Date.now() - TRASH_RETENTION_DAYS * 86400000;
    const valid: FileRecord[] = [];
    for (const f of files) {
      if (getFileStatus(f) !== 'trashed') continue;
      const tTime = Date.parse(f.trashedAt || f.updatedAt);
      if (tTime < cutoff) {
        await this.purgeFileForever(f.id);
      } else {
        valid.push(f);
      }
    }
    return valid.sort((a, b) => (b.trashedAt || b.updatedAt).localeCompare(a.trashedAt || a.updatedAt));
  }

  async restoreFromTrash(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    const now = new Date().toISOString();
    await this.adapter.put('files', {
      ...f,
      status: 'active',
      trashedAt: null,
      deletedAt: null,
      updatedAt: now,
      syncStatus: 'local',
    });
  }

  async purgeFileForever(fileId: string): Promise<void> {
    await this.adapter.hardDelete('files', fileId);
    await this.adapter.hardDelete('searchIndex', fileId);
    const versions = await this.adapter.getAll('fileVersions', true);
    for (const v of versions) {
      if (v.fileId === fileId) {
        await this.adapter.hardDelete('fileVersions', v.id);
      }
    }
  }

  async emptyTrash(academicYearId: string): Promise<number> {
    const trashed = await this.listTrashedFiles(academicYearId);
    for (const f of trashed) {
      await this.purgeFileForever(f.id);
    }
    return trashed.length;
  }

  // ==================== ACADEMIC-YEAR ARCHIVING ====================

  async getYearArchiveSummary(yearId: string): Promise<YearArchiveSummary | null> {
    const year = await this.adapter.getById('academicYears', yearId);
    if (!year) return null;
    const [files, sections, collections] = await Promise.all([
      this.adapter.queryByYear('files', yearId),
      this.adapter.queryByYear('sections', yearId),
      this.adapter.queryByYear('collections', yearId),
    ]);
    const nonTrashed = files.filter((f) => getFileStatus(f) !== 'trashed');
    const totalBytes = nonTrashed.reduce((s, f) => s + f.size, 0);
    return {
      year,
      fileCount: nonTrashed.length,
      totalBytes,
      sectionsCount: sections.length,
      collectionsCount: collections.length,
    };
  }

  async archiveAcademicYear(yearId: string): Promise<YearArchiveSummary | null> {
    const year = await this.adapter.getById('academicYears', yearId);
    if (!year) return null;
    await this.adapter.put('academicYears', {
      ...year,
      isActive: false,
      isArchived: true,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    });
    return this.getYearArchiveSummary(yearId);
  }

  async restoreYearFilesToCurrent(
    ctx: ServiceContext,
    fileIds: string[],
    targetYearId: string
  ): Promise<number> {
    const now = new Date().toISOString();
    const targetSections = await this.adapter.queryByYear('sections', targetYearId);
    const targetSecIdSet = new Set(targetSections.map((s) => s.id));
    const fallbackSecId = targetSections[0]?.id || `${targetYearId}__sec_01`;
    let copied = 0;

    for (const id of fileIds) {
      const f = await this.adapter.getById('files', id);
      if (!f) continue;
      const suffix = f.sectionId.includes('__') ? f.sectionId.split('__').slice(1).join('__') : '';
      const mappedSectionId =
        suffix && targetSecIdSet.has(`${targetYearId}__${suffix}`)
          ? `${targetYearId}__${suffix}`
          : fallbackSecId;

      const clone: FileRecord = {
        ...f,
        id: generateId(),
        sectionId: mappedSectionId,
        academicYearId: targetYearId,
        status: 'active',
        archivedAt: null,
        trashedAt: null,
        linkedSolutionFileId: null,
        lastOpenedAt: null,
        openCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: ctx.ownerId,
      };
      await this.adapter.put('files', clone);
      copied++;
    }
    return copied;
  }

  async exportYearZip(yearId: string): Promise<Blob | null> {
    const year = await this.adapter.getById('academicYears', yearId);
    if (!year) return null;
    return this.backupService.exportYearZip(yearId, year.label);
  }

  // ==================== AUTO-ARCHIVE SUGGESTIONS ====================

  async getAutoArchiveSuggestions(
    academicYearId: string,
    inactiveDays = 180
  ): Promise<FileRecord[]> {
    const files = await this.filesService.listAllForYear(academicYearId);
    const cutoff = Date.now() - inactiveDays * 86400000;
    return files
      .filter((f) => {
        if (f.pinned || f.isFavorite) return false;
        const ref = f.lastOpenedAt || f.createdAt;
        return Date.parse(ref) < cutoff;
      })
      .sort((a, b) => (a.lastOpenedAt || a.createdAt).localeCompare(b.lastOpenedAt || b.createdAt));
  }

  // ==================== STORAGE MANAGER & FREE SPACE ====================

  async getStorageBreakdown(schoolId: string): Promise<StorageBreakdown> {
    const [allYears, allFiles, allSections] = await Promise.all([
      this.adapter.getAll('academicYears'),
      this.adapter.getAll('files'),
      this.adapter.getAll('sections'),
    ]);
    const schoolYears = allYears.filter((y) => y.schoolId === schoolId);
    const yearIds = new Set(schoolYears.map((y) => y.id));
    const files = allFiles.filter(
      (f) => yearIds.has(f.academicYearId) && getFileStatus(f) !== 'trashed'
    );
    const sectionMap = new Map(allSections.map((s) => [s.id, s]));

    let totalBytes = 0;
    const catStats = new Map<FileTypeCategory, { count: number; bytes: number }>();
    const secStats = new Map<string, { count: number; bytes: number }>();
    const yearStats = new Map<string, { count: number; bytes: number }>();
    const hashMap = new Map<string, FileRecord[]>();
    let compressibleImagesCount = 0;
    let compressibleImagesBytes = 0;

    for (const f of files) {
      totalBytes += f.size;
      const cat = f.fileCategory || detectFileCategory(f.mimeType, f.extension, f.externalUrl);
      const cs = catStats.get(cat) ?? { count: 0, bytes: 0 };
      cs.count++;
      cs.bytes += f.size;
      catStats.set(cat, cs);

      const ss = secStats.get(f.sectionId) ?? { count: 0, bytes: 0 };
      ss.count++;
      ss.bytes += f.size;
      secStats.set(f.sectionId, ss);

      const ys = yearStats.get(f.academicYearId) ?? { count: 0, bytes: 0 };
      ys.count++;
      ys.bytes += f.size;
      yearStats.set(f.academicYearId, ys);

      if (f.hash) {
        const list = hashMap.get(f.hash) ?? [];
        list.push(f);
        hashMap.set(f.hash, list);
      }

      if (cat === 'image' && f.size > 350 * 1024 && f.mimeType !== 'image/svg+xml') {
        compressibleImagesCount++;
        compressibleImagesBytes += f.size;
      }
    }

    let duplicateGroupsCount = 0;
    let duplicateReclaimableBytes = 0;
    for (const list of hashMap.values()) {
      if (list.length > 1) {
        duplicateGroupsCount++;
        duplicateReclaimableBytes += list.slice(1).reduce((s, f) => s + f.size, 0);
      }
    }

    return {
      totalBytes,
      byCategory: Array.from(catStats.entries())
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.bytes - a.bytes),
      bySection: Array.from(secStats.entries())
        .map(([sectionId, v]) => ({ sectionId, section: sectionMap.get(sectionId), ...v }))
        .sort((a, b) => b.bytes - a.bytes),
      byYear: schoolYears.map((y) => {
        const st = yearStats.get(y.id) ?? { count: 0, bytes: 0 };
        return { year: y, ...st };
      }),
      largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 20),
      duplicateGroupsCount,
      duplicateReclaimableBytes,
      compressibleImagesCount,
      compressibleImagesBytes,
    };
  }

  async compressLargeImagesToFreeSpace(
    academicYearId: string
  ): Promise<{ compressedCount: number; savedBytes: number }> {
    const files = await this.adapter.queryByYear('files', academicYearId);
    let compressedCount = 0;
    let savedBytes = 0;
    const now = new Date().toISOString();

    for (const f of files) {
      if (getFileStatus(f) === 'trashed' || !f.blob) continue;
      if (!f.mimeType.startsWith('image/') || f.mimeType === 'image/svg+xml' || f.size <= 350 * 1024) {
        continue;
      }
      const nextBlob = await this.filesService.compressImageBlob(f.blob, f.mimeType, true);
      if (nextBlob.size < f.size) {
        savedBytes += f.size - nextBlob.size;
        compressedCount++;
        const nextHash = await computeBlobSha256(nextBlob);
        await this.adapter.put('files', {
          ...f,
          blob: nextBlob,
          mimeType: nextBlob.type || f.mimeType,
          size: nextBlob.size,
          hash: nextHash,
          updatedAt: now,
          syncStatus: 'local',
        });
      }
    }
    return { compressedCount, savedBytes };
  }

  async purgeYearFilesAfterExport(academicYearId: string): Promise<number> {
    const files = await this.adapter.queryByYear('files', academicYearId, true);
    for (const f of files) {
      await this.purgeFileForever(f.id);
    }
    return files.length;
  }
}
