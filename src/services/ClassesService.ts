import type { ClassRoomRecord, FileRecord, MiddleSchoolLevel } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class ClassesService {
  constructor(private adapter: IDataAdapter) {}

  async listByYear(academicYearId: string, levelCode?: MiddleSchoolLevel): Promise<ClassRoomRecord[]> {
    const all = await this.adapter.queryByYear('classRooms', academicYearId);
    return all
      .filter((c) => !levelCode || c.levelCode === levelCode)
      .sort((a, b) => a.order - b.order);
  }

  async addClass(
    ctx: ServiceContext,
    levelCode: MiddleSchoolLevel,
    name: string
  ): Promise<ClassRoomRecord> {
    const existing = await this.listByYear(ctx.academicYearId, levelCode);
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), 0);
    const now = new Date().toISOString();
    const cleanName = name.trim();
    const id = generateId();
    const record: ClassRoomRecord = {
      id,
      levelCode,
      name: cleanName,
      order: maxOrder + 1,
      termSectionIds: {
        1: `${ctx.academicYearId}__cls_${id}_t1`,
        2: `${ctx.academicYearId}__cls_${id}_t2`,
        3: `${ctx.academicYearId}__cls_${id}_t3`,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('classRooms', record);
    return record;
  }

  async renameClass(classId: string, newName: string): Promise<void> {
    const existing = await this.adapter.getById('classRooms', classId);
    if (!existing) return;
    await this.adapter.put('classRooms', {
      ...existing,
      name: newName.trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  async reorderClasses(orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const updates: ClassRoomRecord[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const c = await this.adapter.getById('classRooms', orderedIds[i]);
      if (c) updates.push({ ...c, order: i + 1, updatedAt: now });
    }
    await this.adapter.bulkPut('classRooms', updates);
  }

  async deleteClass(classId: string, academicYearId: string): Promise<void> {
    const cls = await this.adapter.getById('classRooms', classId);
    if (!cls) return;
    const termIds = new Set(Object.values(cls.termSectionIds));
    const files = await this.adapter.queryByYear('files', academicYearId);
    for (const f of files) {
      if (termIds.has(f.sectionId)) {
        await this.adapter.softDelete('files', f.id);
      }
    }
    await this.adapter.softDelete('classRooms', classId);
  }

  async copyTermFiles(
    ctx: ServiceContext,
    classRoom: ClassRoomRecord,
    fromTerm: 1 | 2 | 3,
    toTerm: 1 | 2 | 3
  ): Promise<number> {
    const fromSec = classRoom.termSectionIds[fromTerm];
    const toSec = classRoom.termSectionIds[toTerm];
    const allFiles = await this.adapter.queryByYear('files', ctx.academicYearId);
    const sourceFiles = allFiles.filter((f) => f.sectionId === fromSec);
    const now = new Date().toISOString();
    const copies: FileRecord[] = sourceFiles.map((f) => ({
      ...f,
      id: generateId(),
      sectionId: toSec,
      termNumber: toTerm,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      syncStatus: 'local',
    }));
    await this.adapter.bulkPut('files', copies);
    return copies.length;
  }
}
