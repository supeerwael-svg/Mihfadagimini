import type { ExamKind, FileRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export interface StorageStats {
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isNearFull: boolean;
  persisted: boolean;
}

export class FilesService {
  constructor(private adapter: IDataAdapter) {}

  async listBySection(academicYearId: string, sectionId: string): Promise<FileRecord[]> {
    const all = await this.adapter.queryByYear('files', academicYearId);
    return all
      .filter((f) => f.sectionId === sectionId)
      .sort((a, b) => {
        if ((a.termNumber ?? 0) !== (b.termNumber ?? 0)) {
          return (a.termNumber ?? 0) - (b.termNumber ?? 0);
        }
        if (a.order !== b.order) return a.order - b.order;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  async listAllForYear(academicYearId: string): Promise<FileRecord[]> {
    return this.adapter.queryByYear('files', academicYearId);
  }

  async listFavorites(academicYearId: string): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return all.filter((f) => f.isFavorite);
  }

  async listRecentlyOpened(academicYearId: string, limit = 12): Promise<FileRecord[]> {
    const all = await this.listAllForYear(academicYearId);
    return all
      .filter((f) => Boolean(f.lastOpenedAt))
      .sort((a, b) => (b.lastOpenedAt ?? '').localeCompare(a.lastOpenedAt ?? ''))
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

  /**
   * Automatic client-side image compression for large photos/scans.
   */
  private async compressImageIfNeeded(file: File): Promise<Blob> {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.size < 320 * 1024) {
      return file;
    }
    return new Promise<Blob>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
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
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        canvas.toBlob(
          (compressed) => {
            if (compressed && compressed.size < file.size) {
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          outType,
          0.82
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  async uploadFiles(
    ctx: ServiceContext,
    sectionId: string,
    files: File[],
    options?: {
      tags?: string[];
      termNumber?: 1 | 2 | 3;
      examKind?: ExamKind;
      compressImages?: boolean;
      onProgress?: (percent: number, currentFileName: string) => void;
    }
  ): Promise<FileRecord[]> {
    const existing = await this.listBySection(ctx.academicYearId, sectionId);
    let maxOrder = existing.reduce((m, f) => Math.max(m, f.order), 0);
    const saved: FileRecord[] = [];
    const total = files.length || 1;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      options?.onProgress?.(Math.round((i / total) * 100), file.name);
      const blob =
        options?.compressImages !== false ? await this.compressImageIfNeeded(file) : file;
      const ext = file.name.includes('.')
        ? file.name.split('.').pop()?.toLowerCase() ?? ''
        : '';
      const now = new Date().toISOString();
      maxOrder += 1;

      const record: FileRecord = {
        id: generateId(),
        sectionId,
        name: file.name,
        mimeType: blob.type || file.type || 'application/octet-stream',
        size: blob.size,
        extension: ext,
        blob,
        tags: options?.tags ?? [],
        isFavorite: false,
        order: maxOrder,
        termNumber: options?.termNumber,
        examKind: options?.examKind,
        linkedSolutionFileId: null,
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
      saved.push(record);
    }

    options?.onProgress?.(100, '');
    return saved;
  }

  async addExternalLink(
    ctx: ServiceContext,
    sectionId: string,
    params: { name: string; url: string; tags?: string[] }
  ): Promise<FileRecord> {
    const existing = await this.listBySection(ctx.academicYearId, sectionId);
    const maxOrder = existing.reduce((m, f) => Math.max(m, f.order), 0);
    const now = new Date().toISOString();
    const record: FileRecord = {
      id: generateId(),
      sectionId,
      name: params.name.trim(),
      mimeType: 'text/uri-list',
      size: 0,
      extension: 'url',
      externalUrl: params.url.trim(),
      tags: params.tags ?? [],
      isFavorite: false,
      order: maxOrder + 1,
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
    return record;
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      name: newName.trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  async moveFile(fileId: string, targetSectionId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      sectionId: targetSectionId,
      updatedAt: new Date().toISOString(),
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

  async updateTags(fileId: string, tags: string[]): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      tags: Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))),
      updatedAt: new Date().toISOString(),
    });
  }

  async markOpened(fileId: string): Promise<void> {
    const f = await this.adapter.getById('files', fileId);
    if (!f) return;
    await this.adapter.put('files', {
      ...f,
      lastOpenedAt: new Date().toISOString(),
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

  async deleteFile(fileId: string): Promise<void> {
    await this.adapter.softDelete('files', fileId);
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
    const percentUsed = quotaBytes > 0 ? Math.min(100, Math.round((usageBytes / quotaBytes) * 100)) : 0;
    return {
      usageBytes,
      quotaBytes,
      percentUsed,
      isNearFull: percentUsed >= 80,
      persisted,
    };
  }
}
