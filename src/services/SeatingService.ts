import type {
  BoardSide,
  ClassRoomRecord,
  DeskSlot,
  GradeSubjectKey,
  SeatingLayoutPreset,
  SeatingPlanRecord,
  StudentRecord,
  UserRecord,
  ViewOrientation,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';
import type { GradesService } from './GradesService';

export interface ReconciledSeatingSummary {
  desks: DeskSlot[];
  totalSeats: number;
  seatedCount: number;
  unseatedStudents: StudentRecord[];
  seatedStudentIds: Set<string>;
  removedGhostCount: number;
}

export class SeatingService {
  constructor(
    private adapter: IDataAdapter,
    private gradesService: GradesService
  ) {}

  /**
   * Privacy: only the owning teacher or primary_admin can view/edit seating charts.
   * Read-only collaborators (teacher_read) and banned users are strictly blocked.
   */
  canAccessSeating(user: UserRecord, classRoom?: ClassRoomRecord): boolean {
    if (user.role === 'banned' || user.role === 'teacher_read') return false;
    if (user.role === 'primary_admin') return true;
    if (!classRoom) return true;
    return (
      classRoom.ownerId === user.id || user.assignedClasses.includes(classRoom.name)
    );
  }

  async listPlans(
    academicYearId: string,
    classRoomId: string
  ): Promise<SeatingPlanRecord[]> {
    const all = await this.adapter.queryByYear('seatingPlans', academicYearId);
    return all
      .filter((p) => p.classRoomId === classRoomId)
      .sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }

  buildDeskGridFromPreset(
    preset: SeatingLayoutPreset,
    rows: number,
    cols: number,
    seatsPerDesk: 1 | 2 | 3
  ): DeskSlot[] {
    const desks: DeskSlot[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let isAisle = false;
        if (preset === 'u_shape') {
          const isTopEdge = r === 0;
          const isSideEdge = c === 0 || c === cols - 1;
          isAisle = !(isTopEdge || isSideEdge);
        } else if (preset === 'groups_4') {
          // Leave central corridor aisle if cols >= 3
          if (cols >= 3 && cols % 2 === 1 && c === Math.floor(cols / 2)) {
            isAisle = true;
          } else if (rows >= 4 && r === Math.floor(rows / 2)) {
            isAisle = true;
          }
        } else if (preset === 'workshop') {
          // Inner ring aisle around central table when grid >= 4x4
          if (rows >= 4 && cols >= 4 && r === 1 && (c === 1 || c === cols - 2)) {
            isAisle = true;
          }
        }
        desks.push({
          id: `d_${r}_${c}_${generateId().slice(0, 6)}`,
          row: r,
          col: c,
          isAisle,
          seatsPerDesk,
          studentIds: isAisle ? [] : Array.from({ length: seatsPerDesk }, () => null),
        });
      }
    }
    return desks;
  }

  async getOrCreateActivePlan(
    ctx: ServiceContext,
    classRoomId: string,
    studentCount: number,
    defaultName: string,
    termNumber?: 1 | 2 | 3,
    subjectId?: string
  ): Promise<SeatingPlanRecord> {
    const existing = await this.listPlans(ctx.academicYearId, classRoomId);
    const active = existing.find((p) => p.isActive) || existing[0];
    if (active) return active;

    // Size default grid comfortably for student count (2 seats per desk, 3 or 4 columns)
    const defaultSeatsPerDesk: 1 | 2 | 3 = 2;
    const cols = studentCount > 30 ? 4 : 3;
    const neededDesks = Math.max(12, Math.ceil(Math.max(studentCount, 24) / defaultSeatsPerDesk));
    const rows = Math.max(4, Math.ceil(neededDesks / cols));

    return this.createPlan(ctx, {
      classRoomId,
      name: defaultName,
      rows,
      cols,
      defaultSeatsPerDesk,
      preset: 'rows',
      termNumber,
      subjectId,
      setActive: true,
    });
  }

  async createPlan(
    ctx: ServiceContext,
    params: {
      classRoomId: string;
      name: string;
      rows: number;
      cols: number;
      defaultSeatsPerDesk?: 1 | 2 | 3;
      preset?: SeatingLayoutPreset;
      boardSide?: BoardSide;
      viewOrientation?: ViewOrientation;
      termNumber?: 1 | 2 | 3;
      subjectId?: string;
      setActive?: boolean;
      desks?: DeskSlot[];
    }
  ): Promise<SeatingPlanRecord> {
    const now = new Date().toISOString();
    const seatsPerDesk = params.defaultSeatsPerDesk ?? 2;
    const rows = Math.max(2, Math.min(10, params.rows));
    const cols = Math.max(2, Math.min(8, params.cols));
    const setActive = params.setActive ?? true;

    if (setActive) {
      const existing = await this.listPlans(ctx.academicYearId, params.classRoomId);
      for (const p of existing) {
        if (p.isActive) {
          await this.adapter.put('seatingPlans', { ...p, isActive: false, updatedAt: now });
        }
      }
    }

    const plan: SeatingPlanRecord = {
      id: generateId(),
      classRoomId: params.classRoomId,
      termNumber: params.termNumber,
      subjectId: params.subjectId,
      name: params.name.trim(),
      isActive: setActive,
      rows,
      cols,
      defaultSeatsPerDesk: seatsPerDesk,
      boardSide: params.boardSide ?? 'top',
      boardRotationDeg: 0,
      viewOrientation: params.viewOrientation ?? 'teacher_desk',
      desks:
        params.desks ??
        this.buildDeskGridFromPreset(params.preset ?? 'rows', rows, cols, seatsPerDesk),
      apartPairs: [],
      priorityStudentIds: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };

    await this.adapter.put('seatingPlans', plan);
    return plan;
  }

  async savePlan(plan: SeatingPlanRecord): Promise<SeatingPlanRecord> {
    const updated: SeatingPlanRecord = {
      ...plan,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    };
    await this.adapter.put('seatingPlans', updated);
    return updated;
  }

  async renamePlan(planId: string, name: string): Promise<void> {
    const existing = await this.adapter.getById('seatingPlans', planId);
    if (!existing || !name.trim()) return;
    await this.savePlan({ ...existing, name: name.trim() });
  }

  async duplicatePlan(
    ctx: ServiceContext,
    sourcePlanId: string,
    newName: string
  ): Promise<SeatingPlanRecord | null> {
    const source = await this.adapter.getById('seatingPlans', sourcePlanId);
    if (!source) return null;
    const clonedDesks: DeskSlot[] = source.desks.map((d) => ({
      ...d,
      id: `d_${d.row}_${d.col}_${generateId().slice(0, 6)}`,
      studentIds: [...d.studentIds],
    }));
    return this.createPlan(ctx, {
      classRoomId: source.classRoomId,
      name: newName,
      rows: source.rows,
      cols: source.cols,
      defaultSeatsPerDesk: source.defaultSeatsPerDesk,
      boardSide: source.boardSide,
      viewOrientation: source.viewOrientation,
      termNumber: source.termNumber,
      subjectId: source.subjectId,
      setActive: true,
      desks: clonedDesks,
    });
  }

  async setActivePlan(
    academicYearId: string,
    classRoomId: string,
    planId: string
  ): Promise<void> {
    const all = await this.listPlans(academicYearId, classRoomId);
    const now = new Date().toISOString();
    const updates = all.map((p) => ({
      ...p,
      isActive: p.id === planId,
      updatedAt: now,
    }));
    await this.adapter.bulkPut('seatingPlans', updates);
  }

  async deletePlan(academicYearId: string, classRoomId: string, planId: string): Promise<void> {
    await this.adapter.softDelete('seatingPlans', planId);
    const remaining = await this.listPlans(academicYearId, classRoomId);
    if (remaining.length > 0 && !remaining.some((p) => p.isActive)) {
      await this.setActivePlan(academicYearId, classRoomId, remaining[0].id);
    }
  }

  reconcilePlanWithRoster(
    plan: SeatingPlanRecord,
    students: StudentRecord[]
  ): ReconciledSeatingSummary {
    const validIds = new Set(students.map((s) => s.id));
    const seenSeated = new Set<string>();
    let totalSeats = 0;
    let removedGhostCount = 0;

    const desks = plan.desks.map((desk) => {
      if (desk.isAisle) {
        return { ...desk, studentIds: [] };
      }
      totalSeats += desk.seatsPerDesk;
      const normalized = Array.from({ length: desk.seatsPerDesk }, (_, idx) => {
        const sid = desk.studentIds[idx] ?? null;
        if (!sid) return null;
        if (!validIds.has(sid)) {
          removedGhostCount++;
          return null;
        }
        if (seenSeated.has(sid)) return null;
        seenSeated.add(sid);
        return sid;
      });
      return { ...desk, studentIds: normalized };
    });

    const unseatedStudents = students.filter((s) => !seenSeated.has(s.id));
    return {
      desks,
      totalSeats,
      seatedCount: seenSeated.size,
      unseatedStudents,
      seatedStudentIds: seenSeated,
      removedGhostCount,
    };
  }

  assignStudentToSeat(
    plan: SeatingPlanRecord,
    deskId: string,
    seatIndex: number,
    studentId: string | null
  ): SeatingPlanRecord {
    const desks = plan.desks.map((desk) => {
      const nextIds = [...desk.studentIds];
      // Clear student from any previous seat
      if (studentId) {
        for (let i = 0; i < nextIds.length; i++) {
          if (nextIds[i] === studentId) nextIds[i] = null;
        }
      }
      if (desk.id === deskId && !desk.isAisle && seatIndex >= 0 && seatIndex < desk.seatsPerDesk) {
        while (nextIds.length < desk.seatsPerDesk) nextIds.push(null);
        nextIds[seatIndex] = studentId;
      }
      return { ...desk, studentIds: nextIds };
    });
    return { ...plan, desks };
  }

  swapOrMoveSeats(
    plan: SeatingPlanRecord,
    from: { deskId: string; seatIndex: number },
    to: { deskId: string; seatIndex: number }
  ): SeatingPlanRecord {
    if (from.deskId === to.deskId && from.seatIndex === to.seatIndex) return plan;
    const fromDesk = plan.desks.find((d) => d.id === from.deskId);
    const toDesk = plan.desks.find((d) => d.id === to.deskId);
    if (!fromDesk || !toDesk || fromDesk.isAisle || toDesk.isAisle) return plan;

    const fromStudent = fromDesk.studentIds[from.seatIndex] ?? null;
    const toStudent = toDesk.studentIds[to.seatIndex] ?? null;

    const desks = plan.desks.map((desk) => {
      if (desk.id !== from.deskId && desk.id !== to.deskId) return desk;
      const nextIds = [...desk.studentIds];
      while (nextIds.length < desk.seatsPerDesk) nextIds.push(null);
      if (desk.id === from.deskId) nextIds[from.seatIndex] = toStudent;
      if (desk.id === to.deskId) nextIds[to.seatIndex] = fromStudent;
      return { ...desk, studentIds: nextIds };
    });

    return { ...plan, desks };
  }

  resizeGrid(
    plan: SeatingPlanRecord,
    newRows: number,
    newCols: number
  ): SeatingPlanRecord {
    const rows = Math.max(2, Math.min(10, newRows));
    const cols = Math.max(2, Math.min(8, newCols));
    const byPos = new Map<string, DeskSlot>();
    for (const d of plan.desks) {
      byPos.set(`${d.row}_${d.col}`, d);
    }
    const nextDesks: DeskSlot[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const existing = byPos.get(`${r}_${c}`);
        if (existing) {
          nextDesks.push(existing);
        } else {
          nextDesks.push({
            id: `d_${r}_${c}_${generateId().slice(0, 6)}`,
            row: r,
            col: c,
            isAisle: false,
            seatsPerDesk: plan.defaultSeatsPerDesk,
            studentIds: Array.from({ length: plan.defaultSeatsPerDesk }, () => null),
          });
        }
      }
    }
    return { ...plan, rows, cols, desks: nextDesks };
  }

  moveDeskToCell(
    plan: SeatingPlanRecord,
    sourceDeskId: string,
    targetRow: number,
    targetCol: number
  ): SeatingPlanRecord {
    const src = plan.desks.find((d) => d.id === sourceDeskId);
    const dst = plan.desks.find((d) => d.row === targetRow && d.col === targetCol);
    if (!src || !dst || src.id === dst.id) return plan;

    const desks = plan.desks.map((d) => {
      if (d.id === src.id) return { ...d, row: targetRow, col: targetCol };
      if (d.id === dst.id) return { ...d, row: src.row, col: src.col };
      return d;
    });
    return { ...plan, desks };
  }

  private getSeatPriorityDistance(
    desk: DeskSlot,
    rows: number,
    cols: number,
    boardSide: BoardSide
  ): number {
    if (boardSide === 'top') return desk.row;
    if (boardSide === 'bottom') return rows - 1 - desk.row;
    if (boardSide === 'left') return desk.col;
    return cols - 1 - desk.col;
  }

  async autoFillPlan(
    plan: SeatingPlanRecord,
    students: StudentRecord[],
    options: {
      strategy: 'alphabetical' | 'random' | 'by_last_grade';
      apartPairs: Array<[string, string]>;
      priorityStudentIds: string[];
      academicYearId: string;
      subjectKey: GradeSubjectKey;
    }
  ): Promise<SeatingPlanRecord> {
    if (students.length === 0) return plan;

    // 1. Order students according to strategy
    let ordered = [...students];
    if (options.strategy === 'alphabetical') {
      ordered.sort((a, b) => {
        const cmp = a.lastName.localeCompare(b.lastName);
        return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
      });
    } else if (options.strategy === 'random') {
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    } else if (options.strategy === 'by_last_grade') {
      const grades = await this.gradesService.getGradesForClassAllTerms(
        options.academicYearId,
        plan.classRoomId,
        options.subjectKey
      );
      const latestScoreByStudent = new Map<string, number>();
      // Prefer highest term number available for each student
      for (const g of grades.sort((a, b) => b.termNumber - a.termNumber)) {
        if (latestScoreByStudent.has(g.studentId)) continue;
        const vals = [g.exam.score, g.assignment.score, g.continuous.score].filter(
          (v): v is number => typeof v === 'number'
        );
        if (vals.length > 0) {
          latestScoreByStudent.set(
            g.studentId,
            vals.reduce((acc, v) => acc + v, 0) / vals.length
          );
        }
      }
      const sortedByGrade = [...students].sort(
        (a, b) => (latestScoreByStudent.get(b.id) ?? 10) - (latestScoreByStudent.get(a.id) ?? 10)
      );
      // Interleave strong and weak so adjacent seats mix levels
      const mixed: StudentRecord[] = [];
      let l = 0;
      let r = sortedByGrade.length - 1;
      while (l <= r) {
        mixed.push(sortedByGrade[l++]);
        if (l <= r) mixed.push(sortedByGrade[r--]);
      }
      ordered = mixed;
    }

    // Move front-row priority students to the head of the queue
    const prioritySet = new Set(options.priorityStudentIds);
    const priorityList = ordered.filter((s) => prioritySet.has(s.id));
    const regularList = ordered.filter((s) => !prioritySet.has(s.id));
    const queue = [...priorityList, ...regularList];

    // 2. Build ordered list of seat coordinates closest to boardSide first
    const activeDesks = plan.desks
      .filter((d) => !d.isAisle)
      .sort((a, b) => {
        const distA = this.getSeatPriorityDistance(a, plan.rows, plan.cols, plan.boardSide);
        const distB = this.getSeatPriorityDistance(b, plan.rows, plan.cols, plan.boardSide);
        if (distA !== distB) return distA - distB;
        if (a.row !== b.row) return a.row - b.row;
        return a.col - b.col;
      });

    const apartMap = new Map<string, Set<string>>();
    for (const [a, b] of options.apartPairs) {
      if (!apartMap.has(a)) apartMap.set(a, new Set());
      if (!apartMap.has(b)) apartMap.set(b, new Set());
      apartMap.get(a)!.add(b);
      apartMap.get(b)!.add(a);
    }

    // Clear all seats first
    const clearedDesks: DeskSlot[] = plan.desks.map((d) => ({
      ...d,
      studentIds: d.isAisle ? [] : Array.from({ length: d.seatsPerDesk }, () => null),
    }));
    const deskById = new Map(clearedDesks.map((d) => [d.id, d]));

    const conflictsWithDeskNeighbors = (studentId: string, desk: DeskSlot): boolean => {
      const banned = apartMap.get(studentId);
      if (!banned || banned.size === 0) return false;
      // Check same desk
      for (const occ of desk.studentIds) {
        if (occ && banned.has(occ)) return true;
      }
      // Check orthogonal neighbor desks
      for (const other of clearedDesks) {
        if (
          !other.isAisle &&
          Math.abs(other.row - desk.row) + Math.abs(other.col - desk.col) === 1
        ) {
          for (const occ of other.studentIds) {
            if (occ && banned.has(occ)) return true;
          }
        }
      }
      return false;
    };

    const seatSlots: Array<{ desk: DeskSlot; seatIdx: number }> = [];
    for (const dRef of activeDesks) {
      const d = deskById.get(dRef.id)!;
      for (let i = 0; i < d.seatsPerDesk; i++) {
        seatSlots.push({ desk: d, seatIdx: i });
      }
    }

    const remaining = [...queue];
    for (const slot of seatSlots) {
      if (remaining.length === 0) break;
      // Pick first remaining student that satisfies apartPairs constraint, else fallback to head
      let pickIdx = remaining.findIndex((s) => !conflictsWithDeskNeighbors(s.id, slot.desk));
      if (pickIdx === -1) pickIdx = 0;
      const [chosen] = remaining.splice(pickIdx, 1);
      slot.desk.studentIds[slot.seatIdx] = chosen.id;
    }

    return {
      ...plan,
      desks: clearedDesks,
      apartPairs: options.apartPairs,
      priorityStudentIds: options.priorityStudentIds,
    };
  }
}
