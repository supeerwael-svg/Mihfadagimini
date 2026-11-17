import { buildDefaultSectionsForYear } from '@/src/db/seedDefaults';
import type {
  AcademicYearRecord,
  ClassRoomRecord,
  FileRecord,
  SectionNode,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

const VIEWING_YEAR_META = 'active_viewing_year_id';

export class AcademicYearService {
  constructor(private adapter: IDataAdapter) {}

  async listYears(schoolId: string): Promise<AcademicYearRecord[]> {
    const all = await this.adapter.getAll('academicYears');
    return all
      .filter((y) => y.schoolId === schoolId)
      .sort((a, b) => b.label.localeCompare(a.label));
  }

  async getCurrentViewingYear(schoolId: string): Promise<AcademicYearRecord | null> {
    const years = await this.listYears(schoolId);
    if (years.length === 0) return null;
    const savedId = await this.adapter.getMeta(VIEWING_YEAR_META);
    if (savedId) {
      const found = years.find((y) => y.id === savedId);
      if (found) return found;
    }
    const active = years.find((y) => y.isActive) ?? years[0];
    await this.adapter.setMeta(VIEWING_YEAR_META, active.id);
    return active;
  }

  async setViewingYear(yearId: string): Promise<void> {
    await this.adapter.setMeta(VIEWING_YEAR_META, yearId);
  }

  /**
   * Opens a new Academic-Year Gateway (e.g. 2026/2027 -> 2027/2028).
   * Archives the previous active year as read-only and copies either:
   * - 'structure_only': section hierarchy (preserving custom names/order) & classes
   * - 'structure_with_files': section hierarchy + selected files (including Blobs)
   */
  async createNewGateway(
    ctx: ServiceContext,
    params: {
      label: string;
      startDate: string;
      endDate: string;
      sourceYearId: string;
      copyMode: 'structure_only' | 'structure_with_files';
      selectedFileIds?: string[];
    }
  ): Promise<AcademicYearRecord> {
    const now = new Date().toISOString();
    const newYearId = `yr_${generateId().slice(0, 8)}`;

    // 1. Archive existing active years
    const existingYears = await this.listYears(ctx.schoolId);
    for (const yr of existingYears) {
      if (yr.isActive || !yr.isArchived) {
        await this.adapter.put('academicYears', {
          ...yr,
          isActive: false,
          isArchived: true,
          updatedAt: now,
        });
      }
    }

    // 2. Create new active year
    const newYear: AcademicYearRecord = {
      id: newYearId,
      label: params.label.trim(),
      startDate: params.startDate,
      endDate: params.endDate,
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: newYearId,
    };
    await this.adapter.put('academicYears', newYear);

    // 3. Copy section structure from source year (preserving user customizations)
    const sourceSections = await this.adapter.queryByYear('sections', params.sourceYearId);
    const idMap = new Map<string, string>();
    const mapId = (oldId: string): string => {
      if (!idMap.has(oldId)) {
        const suffix = oldId.includes('__') ? oldId.split('__').slice(1).join('__') : generateId();
        idMap.set(oldId, `${newYearId}__${suffix}`);
      }
      return idMap.get(oldId)!;
    };

    sourceSections.forEach((s) => mapId(s.id));

    let copiedSections: SectionNode[];
    if (sourceSections.length > 0) {
      copiedSections = sourceSections.map((s) => ({
        ...s,
        id: mapId(s.id),
        parentId: s.parentId ? mapId(s.parentId) : null,
        academicYearId: newYearId,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
      }));
    } else {
      copiedSections = buildDefaultSectionsForYear(ctx.ownerId, ctx.schoolId, newYearId);
    }
    await this.adapter.bulkPut('sections', copiedSections);

    // 4. Copy classroom definitions (without student Excel files unless selected)
    const sourceClasses = await this.adapter.queryByYear('classRooms', params.sourceYearId);
    const copiedClasses: ClassRoomRecord[] = sourceClasses.map((c) => ({
      ...c,
      id: generateId(),
      academicYearId: newYearId,
      termSectionIds: {
        1: `${newYearId}__cls_${c.name}_t1`,
        2: `${newYearId}__cls_${c.name}_t2`,
        3: `${newYearId}__cls_${c.name}_t3`,
      },
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    }));
    await this.adapter.bulkPut('classRooms', copiedClasses);

    // 5. Optionally copy selected files
    if (params.copyMode === 'structure_with_files' && params.selectedFileIds?.length) {
      const sourceFiles = await this.adapter.queryByYear('files', params.sourceYearId);
      const selectedSet = new Set(params.selectedFileIds);
      const copiedFiles: FileRecord[] = [];
      for (const f of sourceFiles) {
        if (!selectedSet.has(f.id)) continue;
        copiedFiles.push({
          ...f,
          id: generateId(),
          sectionId: mapId(f.sectionId),
          academicYearId: newYearId,
          linkedSolutionFileId: null,
          lastOpenedAt: null,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'local',
        });
      }
      await this.adapter.bulkPut('files', copiedFiles);
    }

    await this.setViewingYear(newYearId);
    return newYear;
  }
}
