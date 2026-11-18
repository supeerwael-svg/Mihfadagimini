import type { ClassRoomRecord, StudentRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId, normalizeSearchText } from './crypto';

export class StudentsService {
  constructor(private adapter: IDataAdapter) {}

  async listByClass(academicYearId: string, classRoomId: string): Promise<StudentRecord[]> {
    const all = await this.adapter.queryByYear('students', academicYearId);
    return all
      .filter((s) => s.classRoomId === classRoomId)
      .sort((a, b) => a.order - b.order);
  }

  async addStudent(
    ctx: ServiceContext,
    classRoomId: string,
    params: { lastName: string; firstName: string }
  ): Promise<StudentRecord> {
    const existing = await this.listByClass(ctx.academicYearId, classRoomId);
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.order), 0);
    const now = new Date().toISOString();
    const rec: StudentRecord = {
      id: generateId(),
      classRoomId,
      lastName: params.lastName.trim(),
      firstName: params.firstName.trim(),
      order: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('students', rec);
    return rec;
  }

  async updateStudent(
    studentId: string,
    patch: { lastName: string; firstName: string }
  ): Promise<void> {
    const existing = await this.adapter.getById('students', studentId);
    if (!existing) return;
    await this.adapter.put('students', {
      ...existing,
      lastName: patch.lastName.trim(),
      firstName: patch.firstName.trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteStudent(studentId: string, academicYearId: string): Promise<void> {
    const grades = await this.adapter.queryByYear('grades', academicYearId);
    for (const g of grades) {
      if (g.studentId === studentId) {
        await this.adapter.softDelete('grades', g.id);
      }
    }
    await this.adapter.softDelete('students', studentId);
  }

  async pasteNames(
    ctx: ServiceContext,
    classRoomId: string,
    rawText: string
  ): Promise<{ added: number; skippedDuplicates: number }> {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const existing = await this.listByClass(ctx.academicYearId, classRoomId);
    const seen = new Set(
      existing.map((s) => `${normalizeSearchText(s.lastName)}|${normalizeSearchText(s.firstName)}`)
    );

    let maxOrder = existing.reduce((m, s) => Math.max(m, s.order), 0);
    const now = new Date().toISOString();
    const toCreate: StudentRecord[] = [];
    let skippedDuplicates = 0;

    for (const line of lines) {
      let lastName = '';
      let firstName = '';
      if (line.includes('\t')) {
        const parts = line.split('\t').map((p) => p.trim());
        lastName = parts[0] || '';
        firstName = parts.slice(1).join(' ').trim();
      } else if (line.includes(',') || line.includes(';')) {
        const parts = line.split(/[;,]/).map((p) => p.trim());
        lastName = parts[0] || '';
        firstName = parts.slice(1).join(' ').trim();
      } else {
        const parts = line.split(/\s+/);
        lastName = parts[0] || '';
        firstName = parts.slice(1).join(' ').trim();
      }
      if (!lastName && !firstName) continue;
      if (!firstName) {
        firstName = lastName;
        lastName = '';
      }
      const key = `${normalizeSearchText(lastName)}|${normalizeSearchText(firstName)}`;
      if (seen.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seen.add(key);
      maxOrder += 1;
      toCreate.push({
        id: generateId(),
        classRoomId,
        lastName,
        firstName,
        order: maxOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: ctx.ownerId,
        schoolId: ctx.schoolId,
        academicYearId: ctx.academicYearId,
      });
    }

    await this.adapter.bulkPut('students', toCreate);
    return { added: toCreate.length, skippedDuplicates };
  }

  async copyRosterFromClass(
    ctx: ServiceContext,
    sourceClassId: string,
    targetClassId: string
  ): Promise<number> {
    if (sourceClassId === targetClassId) return 0;
    const [source, target] = await Promise.all([
      this.listByClass(ctx.academicYearId, sourceClassId),
      this.listByClass(ctx.academicYearId, targetClassId),
    ]);
    const seen = new Set(
      target.map((s) => `${normalizeSearchText(s.lastName)}|${normalizeSearchText(s.firstName)}`)
    );
    let maxOrder = target.reduce((m, s) => Math.max(m, s.order), 0);
    const now = new Date().toISOString();
    const toCreate: StudentRecord[] = [];
    for (const st of source) {
      const key = `${normalizeSearchText(st.lastName)}|${normalizeSearchText(st.firstName)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      maxOrder += 1;
      toCreate.push({
        id: generateId(),
        classRoomId: targetClassId,
        lastName: st.lastName,
        firstName: st.firstName,
        order: maxOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: ctx.ownerId,
        schoolId: ctx.schoolId,
        academicYearId: ctx.academicYearId,
      });
    }
    await this.adapter.bulkPut('students', toCreate);
    return toCreate.length;
  }

  async listAllClasses(academicYearId: string): Promise<ClassRoomRecord[]> {
    return this.adapter.queryByYear('classRooms', academicYearId);
  }
}
