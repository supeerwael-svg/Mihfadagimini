import JSZip from 'jszip';
import type {
  AcademicYearRecord,
  FileRecord,
  LanguageCode,
  LibraryCollectionRecord,
  MiddleSchoolLevel,
  SmartCollectionConfig,
  TagRecord,
  UserRecord,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { AuthService } from './AuthService';
import { generateId, normalizeSearchText } from './crypto';
import { getFileStatus, getFileTitle } from './FilesService';

export type LibraryViewMode = 'grid' | 'detailed' | 'compact';
export type LibrarySortField =
  | 'createdAt'
  | 'updatedAt'
  | 'lastOpenedAt'
  | 'name'
  | 'size'
  | 'type'
  | 'openCount';

export interface TagWithStats {
  record?: TagRecord;
  name: string;
  color: string;
  parentName: string | null;
  count: number;
}

export interface DuplicateGroup {
  key: string;
  hash: string;
  files: FileRecord[];
  wastedBytes: number;
}

export const DEFAULT_SMART_COLLECTIONS: SmartCollectionConfig[] = [
  { ruleId: 'this_week', recentDays: 7 },
  { ruleId: 'not_opened_6m', inactiveDays: 180 },
  { ruleId: 'large_files', minSizeBytes: 2 * 1024 * 1024 },
  { ruleId: 'unclassified' },
  { ruleId: 'duplicates' },
  { ruleId: 'favorites_by_subject' },
];

export const TAG_COLOR_PALETTE = [
  '#1e40af',
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0369a1',
  '#15803d',
  '#475569',
];

export class LibraryService {
  constructor(
    private adapter: IDataAdapter,
    private authService: AuthService
  ) {}

  async getPreferredViewMode(userId: string): Promise<LibraryViewMode> {
    const val = await this.adapter.getMeta(`library_view_mode_${userId}`);
    if (val === 'grid' || val === 'detailed' || val === 'compact') return val;
    return 'grid';
  }

  async setPreferredViewMode(userId: string, mode: LibraryViewMode): Promise<void> {
    await this.adapter.setMeta(`library_view_mode_${userId}`, mode);
  }

  async getAccessibleFiles(params: {
    user: UserRecord;
    academicYearId?: string | 'all';
    includeArchived?: boolean;
  }): Promise<FileRecord[]> {
    const rawFiles =
      !params.academicYearId || params.academicYearId === 'all'
        ? await this.adapter.getAll('files')
        : await this.adapter.queryByYear('files', params.academicYearId);

    const years = await this.adapter.getAll('academicYears');
    const archivedYearIds = new Set(years.filter((y) => y.isArchived).map((y) => y.id));

    return rawFiles.filter((f) => {
      const status = getFileStatus(f);
      if (status === 'trashed') return false;
      const inArchivedYear = archivedYearIds.has(f.academicYearId);
      if (!params.includeArchived && (status === 'archived' || (params.academicYearId === 'all' && inArchivedYear))) {
        return false;
      }
      const perm = this.authService.getEffectivePermission(params.user, f.sectionId);
      return perm.view;
    });
  }

  sortFiles(
    files: FileRecord[],
    field: LibrarySortField,
    direction: 'asc' | 'desc',
    lang: LanguageCode = 'ar'
  ): FileRecord[] {
    const collator = new Intl.Collator(lang === 'ar' ? 'ar' : lang === 'fr' ? 'fr' : 'en', {
      sensitivity: 'base',
      numeric: true,
    });
    const factor = direction === 'asc' ? 1 : -1;
    return [...files].sort((a, b) => {
      // Pinned always float softly only when sorting by default updated/created? Keep explicit pure sort.
      let cmp = 0;
      if (field === 'name') {
        cmp = collator.compare(getFileTitle(a), getFileTitle(b));
      } else if (field === 'size') {
        cmp = a.size - b.size;
      } else if (field === 'openCount') {
        cmp = (a.openCount ?? 0) - (b.openCount ?? 0);
      } else if (field === 'type') {
        cmp = (a.fileCategory || a.extension).localeCompare(b.fileCategory || b.extension);
      } else if (field === 'lastOpenedAt') {
        cmp = (a.lastOpenedAt || '').localeCompare(b.lastOpenedAt || '');
      } else if (field === 'updatedAt') {
        cmp = a.updatedAt.localeCompare(b.updatedAt);
      } else {
        cmp = a.createdAt.localeCompare(b.createdAt);
      }
      return cmp * factor;
    });
  }

  async bulkUpdateMetadata(
    fileIds: string[],
    patch: {
      levelCode?: MiddleSchoolLevel | null;
      subjectId?: string | null;
      termNumber?: 1 | 2 | 3;
      addTags?: string[];
      isFavorite?: boolean;
      pinned?: boolean;
      sectionId?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    const updates: FileRecord[] = [];
    for (const id of fileIds) {
      const f = await this.adapter.getById('files', id);
      if (!f) continue;
      const mergedTags = patch.addTags
        ? Array.from(new Set([...f.tags, ...patch.addTags.map((t) => t.trim()).filter(Boolean)]))
        : f.tags;
      updates.push({
        ...f,
        ...(patch.levelCode !== undefined ? { levelCode: patch.levelCode } : {}),
        ...(patch.subjectId !== undefined ? { subjectId: patch.subjectId } : {}),
        ...(patch.termNumber !== undefined ? { termNumber: patch.termNumber } : {}),
        ...(patch.isFavorite !== undefined ? { isFavorite: patch.isFavorite } : {}),
        ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
        ...(patch.sectionId !== undefined ? { sectionId: patch.sectionId } : {}),
        tags: mergedTags,
        updatedAt: now,
        syncStatus: 'local',
      });
    }
    await this.adapter.bulkPut('files', updates);
  }

  async bulkArchive(fileIds: string[], archived = true): Promise<void> {
    const now = new Date().toISOString();
    const updates: FileRecord[] = [];
    for (const id of fileIds) {
      const f = await this.adapter.getById('files', id);
      if (!f) continue;
      updates.push({
        ...f,
        status: archived ? 'archived' : 'active',
        archivedAt: archived ? now : null,
        updatedAt: now,
        syncStatus: 'local',
      });
    }
    await this.adapter.bulkPut('files', updates);
  }

  async bulkTrash(fileIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const updates: FileRecord[] = [];
    for (const id of fileIds) {
      const f = await this.adapter.getById('files', id);
      if (!f) continue;
      updates.push({
        ...f,
        status: 'trashed',
        trashedAt: now,
        updatedAt: now,
        syncStatus: 'local',
      });
    }
    await this.adapter.bulkPut('files', updates);
  }

  async exportFilesZip(files: FileRecord[]): Promise<Blob> {
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const f of files) {
      if (!f.blob) continue;
      let candidateName = f.originalFileName || `${getFileTitle(f)}.${f.extension || 'bin'}`;
      while (usedNames.has(candidateName)) {
        candidateName = `${f.id.slice(0, 4)}_${candidateName}`;
      }
      usedNames.add(candidateName);
      zip.file(candidateName, f.blob);
    }
    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  // ==================== TAGS MANAGER ====================

  async listTags(academicYearId: string): Promise<TagWithStats[]> {
    const [tagRecords, files] = await Promise.all([
      this.adapter.queryByYear('tags', academicYearId),
      this.adapter.queryByYear('files', academicYearId),
    ]);
    const activeFiles = files.filter((f) => getFileStatus(f) !== 'trashed');

    const countMap = new Map<string, number>();
    for (const f of activeFiles) {
      for (const tg of f.tags) {
        const clean = tg.trim();
        if (!clean) continue;
        countMap.set(clean, (countMap.get(clean) ?? 0) + 1);
      }
    }

    const byName = new Map<string, TagWithStats>();
    for (const rec of tagRecords) {
      byName.set(rec.name, {
        record: rec,
        name: rec.name,
        color: rec.color,
        parentName: rec.parentName ?? null,
        count: countMap.get(rec.name) ?? 0,
      });
    }
    for (const [tagName, cnt] of countMap.entries()) {
      if (!byName.has(tagName)) {
        const parts = tagName.split('>').map((p) => p.trim());
        byName.set(tagName, {
          name: tagName,
          color: TAG_COLOR_PALETTE[byName.size % TAG_COLOR_PALETTE.length],
          parentName: parts.length > 1 ? parts.slice(0, -1).join(' > ') : null,
          count: cnt,
        });
      }
    }

    return Array.from(byName.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  async upsertTag(
    ctx: ServiceContext,
    params: { name: string; color?: string; parentName?: string | null }
  ): Promise<TagRecord> {
    const cleanName = params.parentName?.trim()
      ? `${params.parentName.trim()} > ${params.name.trim()}`
      : params.name.trim();
    const existingList = await this.adapter.queryByYear('tags', ctx.academicYearId);
    const existing = existingList.find((t) => t.name === cleanName);
    const now = new Date().toISOString();
    const rec: TagRecord = existing
      ? {
          ...existing,
          color: params.color ?? existing.color,
          parentName: params.parentName ?? existing.parentName,
          updatedAt: now,
          syncStatus: 'local',
        }
      : {
          id: generateId(),
          name: cleanName,
          parentName: params.parentName ?? null,
          color: params.color || TAG_COLOR_PALETTE[existingList.length % TAG_COLOR_PALETTE.length],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'local',
          ownerId: ctx.ownerId,
          schoolId: ctx.schoolId,
          academicYearId: ctx.academicYearId,
        };
    await this.adapter.put('tags', rec);
    return rec;
  }

  async renameTag(academicYearId: string, oldName: string, newName: string): Promise<void> {
    const target = newName.trim();
    if (!target || target === oldName) return;
    const now = new Date().toISOString();
    const [tagRecords, files] = await Promise.all([
      this.adapter.queryByYear('tags', academicYearId),
      this.adapter.queryByYear('files', academicYearId),
    ]);
    const rec = tagRecords.find((t) => t.name === oldName);
    if (rec) {
      await this.adapter.put('tags', { ...rec, name: target, updatedAt: now });
    }
    const updates: FileRecord[] = [];
    for (const f of files) {
      if (f.tags.includes(oldName)) {
        const nextTags = Array.from(new Set(f.tags.map((tg) => (tg === oldName ? target : tg))));
        updates.push({ ...f, tags: nextTags, updatedAt: now });
      }
    }
    await this.adapter.bulkPut('files', updates);
  }

  async mergeTags(academicYearId: string, sourceName: string, targetName: string): Promise<void> {
    if (!sourceName || !targetName || sourceName === targetName) return;
    const now = new Date().toISOString();
    const [tagRecords, files] = await Promise.all([
      this.adapter.queryByYear('tags', academicYearId),
      this.adapter.queryByYear('files', academicYearId),
    ]);
    const srcRec = tagRecords.find((t) => t.name === sourceName);
    if (srcRec) {
      await this.adapter.softDelete('tags', srcRec.id);
    }
    const updates: FileRecord[] = [];
    for (const f of files) {
      if (f.tags.includes(sourceName)) {
        const nextTags = Array.from(
          new Set(f.tags.map((tg) => (tg === sourceName ? targetName : tg)))
        );
        updates.push({ ...f, tags: nextTags, updatedAt: now });
      }
    }
    await this.adapter.bulkPut('files', updates);
  }

  async deleteTag(academicYearId: string, tagName: string): Promise<void> {
    const now = new Date().toISOString();
    const [tagRecords, files] = await Promise.all([
      this.adapter.queryByYear('tags', academicYearId),
      this.adapter.queryByYear('files', academicYearId),
    ]);
    const rec = tagRecords.find((t) => t.name === tagName);
    if (rec) await this.adapter.softDelete('tags', rec.id);
    const updates: FileRecord[] = [];
    for (const f of files) {
      if (f.tags.includes(tagName)) {
        updates.push({
          ...f,
          tags: f.tags.filter((tg) => tg !== tagName),
          updatedAt: now,
        });
      }
    }
    await this.adapter.bulkPut('files', updates);
  }

  suggestTagsForFileName(fileName: string, existingTags: TagWithStats[]): string[] {
    const base = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
    const normBase = normalizeSearchText(base);
    const matchesExisting = existingTags
      .filter((t) => normBase.includes(normalizeSearchText(t.name.split('>').pop() || t.name)))
      .map((t) => t.name);

    const words = base
      .split(/[\s._\-()]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w))
      .slice(0, 4);

    const popular = existingTags.slice(0, 5).map((t) => t.name);
    return Array.from(new Set([...matchesExisting, ...words, ...popular])).slice(0, 8);
  }

  // ==================== COLLECTIONS & SMART RULES ====================

  async listCollections(academicYearId: string): Promise<LibraryCollectionRecord[]> {
    const list = await this.adapter.queryByYear('collections', academicYearId);
    return list.sort((a, b) => a.order - b.order);
  }

  async createCollection(
    ctx: ServiceContext,
    params: {
      name: string;
      notes?: string;
      coverColor?: string;
      coverIcon?: string;
      fileIds?: string[];
    }
  ): Promise<LibraryCollectionRecord> {
    const existing = await this.listCollections(ctx.academicYearId);
    const now = new Date().toISOString();
    const rec: LibraryCollectionRecord = {
      id: generateId(),
      name: params.name.trim(),
      notes: params.notes?.trim() ?? '',
      coverColor: params.coverColor || '#1e40af',
      coverIcon: params.coverIcon || 'FolderHeart',
      fileIds: Array.from(new Set(params.fileIds ?? [])),
      order: existing.length + 1,
      isSmart: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('collections', rec);
    return rec;
  }

  async updateCollection(
    id: string,
    patch: Partial<Pick<LibraryCollectionRecord, 'name' | 'notes' | 'coverColor' | 'coverIcon' | 'fileIds' | 'order'>>
  ): Promise<LibraryCollectionRecord | undefined> {
    const existing = await this.adapter.getById('collections', id);
    if (!existing) return undefined;
    const updated: LibraryCollectionRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    };
    await this.adapter.put('collections', updated);
    return updated;
  }

  async deleteCollection(id: string): Promise<void> {
    await this.adapter.softDelete('collections', id);
  }

  async addFilesToCollection(collectionId: string, fileIds: string[]): Promise<void> {
    const col = await this.adapter.getById('collections', collectionId);
    if (!col) return;
    const merged = Array.from(new Set([...col.fileIds, ...fileIds]));
    await this.updateCollection(collectionId, { fileIds: merged });
  }

  async removeFileFromCollection(collectionId: string, fileId: string): Promise<void> {
    const col = await this.adapter.getById('collections', collectionId);
    if (!col) return;
    await this.updateCollection(collectionId, {
      fileIds: col.fileIds.filter((id) => id !== fileId),
    });
  }

  async reorderCollectionFiles(collectionId: string, orderedFileIds: string[]): Promise<void> {
    await this.updateCollection(collectionId, { fileIds: orderedFileIds });
  }

  async getSmartCollectionConfigs(academicYearId: string): Promise<SmartCollectionConfig[]> {
    const raw = await this.adapter.getMeta(`smart_collections_${academicYearId}`);
    if (!raw) return DEFAULT_SMART_COLLECTIONS;
    try {
      const parsed = JSON.parse(raw) as SmartCollectionConfig[];
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SMART_COLLECTIONS;
    } catch {
      return DEFAULT_SMART_COLLECTIONS;
    }
  }

  async saveSmartCollectionConfigs(
    academicYearId: string,
    configs: SmartCollectionConfig[]
  ): Promise<void> {
    await this.adapter.setMeta(`smart_collections_${academicYearId}`, JSON.stringify(configs));
  }

  evaluateSmartCollection(rule: SmartCollectionConfig, allFiles: FileRecord[]): FileRecord[] {
    const activeFiles = allFiles.filter((f) => getFileStatus(f) === 'active');
    const now = Date.now();
    switch (rule.ruleId) {
      case 'this_week': {
        const days = rule.recentDays ?? 7;
        const cutoff = now - days * 86400000;
        return activeFiles.filter((f) => Date.parse(f.createdAt) >= cutoff);
      }
      case 'not_opened_6m': {
        const days = rule.inactiveDays ?? 180;
        const cutoff = now - days * 86400000;
        return activeFiles.filter((f) => {
          const refDate = f.lastOpenedAt || f.createdAt;
          return Date.parse(refDate) < cutoff;
        });
      }
      case 'large_files': {
        const minBytes = rule.minSizeBytes ?? 2 * 1024 * 1024;
        return activeFiles
          .filter((f) => f.size >= minBytes)
          .sort((a, b) => b.size - a.size);
      }
      case 'unclassified':
        return activeFiles.filter(
          (f) => f.tags.length === 0 || (!f.levelCode && !f.subjectId)
        );
      case 'duplicates': {
        const counts = new Map<string, number>();
        for (const f of activeFiles) {
          if (!f.hash) continue;
          counts.set(f.hash, (counts.get(f.hash) ?? 0) + 1);
        }
        return activeFiles.filter((f) => f.hash && (counts.get(f.hash) ?? 0) > 1);
      }
      case 'favorites_by_subject':
        return activeFiles.filter(
          (f) => f.isFavorite && (!rule.subjectId || f.subjectId === rule.subjectId)
        );
      default:
        return [];
    }
  }

  // ==================== DUPLICATE DETECTION & MERGE ====================

  async listDuplicateGroups(academicYearId: string): Promise<DuplicateGroup[]> {
    const files = await this.adapter.queryByYear('files', academicYearId);
    const active = files.filter((f) => getFileStatus(f) !== 'trashed');
    const byHash = new Map<string, FileRecord[]>();

    for (const f of active) {
      const key = f.hash || `${f.originalFileName || f.name}__${f.size}`;
      const list = byHash.get(key) ?? [];
      list.push(f);
      byHash.set(key, list);
    }

    const groups: DuplicateGroup[] = [];
    for (const [key, list] of byHash.entries()) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const wastedBytes = sorted.slice(1).reduce((sum, f) => sum + f.size, 0);
      groups.push({
        key,
        hash: sorted[0].hash || '',
        files: sorted,
        wastedBytes,
      });
    }
    return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  }

  async mergeDuplicateGroup(keepFileId: string, duplicateIds: string[]): Promise<void> {
    const keepFile = await this.adapter.getById('files', keepFileId);
    if (!keepFile) return;

    const tagSet = new Set<string>(keepFile.tags);
    let fav = keepFile.isFavorite;
    let pin = Boolean(keepFile.pinned);
    let totalOpens = keepFile.openCount ?? 0;
    const now = new Date().toISOString();

    for (const dId of duplicateIds) {
      if (dId === keepFileId) continue;
      const dup = await this.adapter.getById('files', dId);
      if (!dup) continue;
      dup.tags.forEach((t) => tagSet.add(t));
      if (dup.isFavorite) fav = true;
      if (dup.pinned) pin = true;
      totalOpens += dup.openCount ?? 0;
    }

    await this.adapter.put('files', {
      ...keepFile,
      tags: Array.from(tagSet),
      isFavorite: fav,
      pinned: pin,
      openCount: totalOpens,
      updatedAt: now,
      syncStatus: 'local',
    });

    // Reassign collections from discarded duplicateIds to keepFileId cleanly
    const cols = await this.adapter.queryByYear('collections', keepFile.academicYearId);
    const dupSet = new Set(duplicateIds.filter((id) => id !== keepFileId));
    for (const col of cols) {
      if (col.fileIds.some((id) => dupSet.has(id))) {
        const nextIds = Array.from(
          new Set(col.fileIds.map((id) => (dupSet.has(id) ? keepFileId : id)))
        );
        await this.updateCollection(col.id, { fileIds: nextIds });
      }
    }

    await this.bulkTrash(Array.from(dupSet));
  }

  async listYears(): Promise<AcademicYearRecord[]> {
    return this.adapter.getAll('academicYears');
  }
}
