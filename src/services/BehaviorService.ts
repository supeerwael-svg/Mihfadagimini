import type {
  BehaviorConfigRecord,
  BehaviorCriterionRecord,
  BehaviorCriterionSign,
  BehaviorEventRecord,
  BehaviorGradingRule,
  ClassRoomRecord,
  GradeSubjectKey,
  LocalizedText,
  StudentRecord,
  UserRecord,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export const DEFAULT_BEHAVIOR_RULE: BehaviorGradingRule = {
  key: 'default',
  startingGrade: 10,
  minGrade: 0,
  maxGrade: 20,
  pointsPerStep: 0.5,
};

export const DEFAULT_BEHAVIOR_CRITERIA_SPECS: Array<{
  names: LocalizedText;
  sign: BehaviorCriterionSign;
  step: number;
  minPoints: number;
  maxPoints: number;
  weight: number;
}> = [
  {
    names: {
      ar: 'الغياب والتأخر',
      en: 'Absences & lateness',
      fr: 'Absences et retards',
    },
    sign: 'negative',
    step: 1,
    minPoints: -10,
    maxPoints: 0,
    weight: 1,
  },
  {
    names: {
      ar: 'إحضار الأدوات',
      en: 'Bringing tools',
      fr: 'Matériel apporté',
    },
    sign: 'both',
    step: 1,
    minPoints: -5,
    maxPoints: 5,
    weight: 1,
  },
  {
    names: {
      ar: 'تنظيم الكراس',
      en: 'Notebook organization',
      fr: 'Tenue du cahier',
    },
    sign: 'both',
    step: 1,
    minPoints: -5,
    maxPoints: 5,
    weight: 1,
  },
  {
    names: {
      ar: 'العمل داخل القسم',
      en: 'In-class work',
      fr: 'Travail en classe',
    },
    sign: 'both',
    step: 1,
    minPoints: -10,
    maxPoints: 10,
    weight: 1,
  },
  {
    names: {
      ar: 'العمل خارج القسم',
      en: 'Out-of-class work',
      fr: 'Travail hors classe',
    },
    sign: 'both',
    step: 1,
    minPoints: -5,
    maxPoints: 5,
    weight: 1,
  },
  {
    names: {
      ar: 'إنجاز الواجبات',
      en: 'Homework completion',
      fr: 'Devoirs faits',
    },
    sign: 'both',
    step: 1,
    minPoints: -5,
    maxPoints: 5,
    weight: 1,
  },
];

export interface StudentCriterionTally {
  criterionId: string;
  positiveCount: number;
  negativeCount: number;
  rawNet: number;
  clampedNet: number;
}

export interface StudentBehaviorSummary {
  studentId: string;
  suggestedGrade: number;
  totalNetPoints: number;
  positiveTotal: number;
  negativeTotal: number;
  todayCount: number;
  todayNet: number;
  byCriterion: Record<string, StudentCriterionTally>;
}

export class BehaviorService {
  constructor(private adapter: IDataAdapter) {}

  /**
   * Privacy: classroom behavior events & criteria stay strictly private to the teacher.
   * Read-only collaborators (teacher_read) and banned users cannot access behavior data.
   */
  canAccessBehavior(user: UserRecord, classRoom?: ClassRoomRecord): boolean {
    if (user.role === 'banned' || user.role === 'teacher_read') return false;
    if (user.role === 'primary_admin') return true;
    if (!classRoom) return true;
    return (
      classRoom.ownerId === user.id || user.assignedClasses.includes(classRoom.name)
    );
  }

  async listCriteria(
    ctx: ServiceContext,
    activeOnly = true
  ): Promise<BehaviorCriterionRecord[]> {
    const all = await this.adapter.queryByYear('behaviorCriteria', ctx.academicYearId);
    const mine = all.filter((c) => c.ownerId === ctx.ownerId || !c.ownerId);
    if (mine.length === 0) {
      return this.seedDefaultCriteria(ctx);
    }
    return mine
      .filter((c) => (activeOnly ? c.isActive : true))
      .sort((a, b) => a.order - b.order);
  }

  private async seedDefaultCriteria(ctx: ServiceContext): Promise<BehaviorCriterionRecord[]> {
    const now = new Date().toISOString();
    const seeded: BehaviorCriterionRecord[] = DEFAULT_BEHAVIOR_CRITERIA_SPECS.map((spec, idx) => ({
      id: generateId(),
      names: spec.names,
      sign: spec.sign,
      step: spec.step,
      minPoints: spec.minPoints,
      maxPoints: spec.maxPoints,
      weight: spec.weight,
      order: idx + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    }));
    await this.adapter.bulkPut('behaviorCriteria', seeded);
    return seeded;
  }

  async resetToDefaultCriteria(ctx: ServiceContext): Promise<BehaviorCriterionRecord[]> {
    const existing = await this.adapter.queryByYear('behaviorCriteria', ctx.academicYearId);
    for (const c of existing.filter((x) => x.ownerId === ctx.ownerId)) {
      await this.adapter.softDelete('behaviorCriteria', c.id);
    }
    return this.seedDefaultCriteria(ctx);
  }

  async addCriterion(
    ctx: ServiceContext,
    params: {
      names: LocalizedText;
      sign: BehaviorCriterionSign;
      step: number;
      minPoints: number;
      maxPoints: number;
      weight: number;
    }
  ): Promise<BehaviorCriterionRecord> {
    const existing = await this.listCriteria(ctx, false);
    const maxOrder = existing.reduce((m, c) => Math.max(m, c.order), 0);
    const now = new Date().toISOString();
    const rec: BehaviorCriterionRecord = {
      id: generateId(),
      names: params.names,
      sign: params.sign,
      step: Math.max(0.25, params.step),
      minPoints: Math.min(0, params.minPoints),
      maxPoints: Math.max(0, params.maxPoints),
      weight: Math.max(0, params.weight),
      order: maxOrder + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('behaviorCriteria', rec);
    return rec;
  }

  async updateCriterion(
    id: string,
    patch: Partial<Omit<BehaviorCriterionRecord, 'id' | 'createdAt' | 'ownerId' | 'schoolId' | 'academicYearId'>>
  ): Promise<void> {
    const existing = await this.adapter.getById('behaviorCriteria', id);
    if (!existing) return;
    await this.adapter.put('behaviorCriteria', {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async reorderCriteria(orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      const existing = await this.adapter.getById('behaviorCriteria', orderedIds[i]);
      if (existing) {
        await this.adapter.put('behaviorCriteria', {
          ...existing,
          order: i + 1,
          updatedAt: now,
        });
      }
    }
  }

  async deleteCriterion(id: string): Promise<void> {
    await this.adapter.softDelete('behaviorCriteria', id);
  }

  async getConfig(ctx: ServiceContext): Promise<BehaviorConfigRecord> {
    const all = await this.adapter.queryByYear('behaviorConfigs', ctx.academicYearId);
    const existing = all.find((c) => c.ownerId === ctx.ownerId) || all[0];
    if (existing) return existing;

    const now = new Date().toISOString();
    const fresh: BehaviorConfigRecord = {
      id: generateId(),
      rules: { default: { ...DEFAULT_BEHAVIOR_RULE } },
      termResetAt: {},
      showColorFeedback: false,
      hideNamesMode: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('behaviorConfigs', fresh);
    return fresh;
  }

  async saveConfig(config: BehaviorConfigRecord): Promise<BehaviorConfigRecord> {
    const updated: BehaviorConfigRecord = {
      ...config,
      updatedAt: new Date().toISOString(),
      syncStatus: 'local',
    };
    await this.adapter.put('behaviorConfigs', updated);
    return updated;
  }

  resolveRule(
    config: BehaviorConfigRecord | null,
    termNumber: 1 | 2 | 3,
    subjectKey: GradeSubjectKey
  ): BehaviorGradingRule {
    if (!config) return DEFAULT_BEHAVIOR_RULE;
    const termSubjectKey = `${termNumber}__${subjectKey}`;
    return (
      config.rules[termSubjectKey] ||
      config.rules[subjectKey] ||
      config.rules.default ||
      DEFAULT_BEHAVIOR_RULE
    );
  }

  termResetScopeKey(
    classRoomId: string,
    termNumber: 1 | 2 | 3,
    subjectKey: GradeSubjectKey
  ): string {
    return `${classRoomId}__${termNumber}__${subjectKey}`;
  }

  async resetTermScoresKeepHistory(
    config: BehaviorConfigRecord,
    classRoomId: string,
    termNumber: 1 | 2 | 3,
    subjectKey: GradeSubjectKey
  ): Promise<BehaviorConfigRecord> {
    const key = this.termResetScopeKey(classRoomId, termNumber, subjectKey);
    return this.saveConfig({
      ...config,
      termResetAt: {
        ...(config.termResetAt ?? {}),
        [key]: new Date().toISOString(),
      },
    });
  }

  async logEvent(
    ctx: ServiceContext,
    params: {
      classRoomId: string;
      studentId: string;
      termNumber: 1 | 2 | 3;
      subjectKey: GradeSubjectKey;
      criterionId: string;
      criterionNameSnapshot: string;
      delta: number;
      note?: string;
      occurredAt?: string;
    }
  ): Promise<BehaviorEventRecord> {
    const now = new Date().toISOString();
    const rec: BehaviorEventRecord = {
      id: generateId(),
      classRoomId: params.classRoomId,
      studentId: params.studentId,
      termNumber: params.termNumber,
      subjectKey: params.subjectKey,
      criterionId: params.criterionId,
      criterionNameSnapshot: params.criterionNameSnapshot,
      delta: params.delta,
      note: params.note?.trim() || undefined,
      occurredAt: params.occurredAt || now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('behaviorEvents', rec);
    return rec;
  }

  async logBatchEvents(
    ctx: ServiceContext,
    items: Array<{
      classRoomId: string;
      studentId: string;
      termNumber: 1 | 2 | 3;
      subjectKey: GradeSubjectKey;
      criterionId: string;
      criterionNameSnapshot: string;
      delta: number;
      note?: string;
    }>
  ): Promise<BehaviorEventRecord[]> {
    const now = new Date().toISOString();
    const recs: BehaviorEventRecord[] = items.map((params) => ({
      id: generateId(),
      classRoomId: params.classRoomId,
      studentId: params.studentId,
      termNumber: params.termNumber,
      subjectKey: params.subjectKey,
      criterionId: params.criterionId,
      criterionNameSnapshot: params.criterionNameSnapshot,
      delta: params.delta,
      note: params.note?.trim() || undefined,
      occurredAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    }));
    await this.adapter.bulkPut('behaviorEvents', recs);
    return recs;
  }

  async updateEvent(
    eventId: string,
    patch: { delta?: number; note?: string; occurredAt?: string }
  ): Promise<void> {
    const existing = await this.adapter.getById('behaviorEvents', eventId);
    if (!existing) return;
    await this.adapter.put('behaviorEvents', {
      ...existing,
      delta: patch.delta ?? existing.delta,
      note: patch.note !== undefined ? patch.note.trim() || undefined : existing.note,
      occurredAt: patch.occurredAt ?? existing.occurredAt,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.adapter.softDelete('behaviorEvents', eventId);
  }

  async listEventsForClass(
    academicYearId: string,
    classRoomId: string,
    termNumber?: 1 | 2 | 3,
    subjectKey?: GradeSubjectKey
  ): Promise<BehaviorEventRecord[]> {
    const all = await this.adapter.queryByYear('behaviorEvents', academicYearId);
    return all
      .filter((e) => {
        if (e.classRoomId !== classRoomId) return false;
        if (termNumber !== undefined && e.termNumber !== termNumber) return false;
        if (subjectKey && e.subjectKey !== subjectKey) return false;
        return true;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async listEventsForStudent(
    academicYearId: string,
    studentId: string,
    termNumber?: 1 | 2 | 3,
    subjectKey?: GradeSubjectKey
  ): Promise<BehaviorEventRecord[]> {
    const all = await this.adapter.queryByYear('behaviorEvents', academicYearId);
    return all
      .filter((e) => {
        if (e.studentId !== studentId) return false;
        if (termNumber !== undefined && e.termNumber !== termNumber) return false;
        if (subjectKey && e.subjectKey !== subjectKey) return false;
        return true;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  computeClassSummaries(params: {
    students: StudentRecord[];
    criteria: BehaviorCriterionRecord[];
    events: BehaviorEventRecord[];
    config: BehaviorConfigRecord | null;
    classRoomId: string;
    termNumber: 1 | 2 | 3;
    subjectKey: GradeSubjectKey;
  }): Map<string, StudentBehaviorSummary> {
    const rule = this.resolveRule(params.config, params.termNumber, params.subjectKey);
    const resetScopeKey = this.termResetScopeKey(
      params.classRoomId,
      params.termNumber,
      params.subjectKey
    );
    const resetAt = params.config?.termResetAt?.[resetScopeKey] ?? null;
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const criteriaById = new Map(params.criteria.map((c) => [c.id, c]));

    const result = new Map<string, StudentBehaviorSummary>();
    const eventsByStudent = new Map<string, BehaviorEventRecord[]>();
    for (const ev of params.events) {
      if (ev.classRoomId !== params.classRoomId) continue;
      if (ev.termNumber !== params.termNumber) continue;
      if (params.subjectKey && ev.subjectKey !== params.subjectKey) continue;
      if (resetAt && ev.occurredAt < resetAt) continue;
      const list = eventsByStudent.get(ev.studentId) ?? [];
      list.push(ev);
      eventsByStudent.set(ev.studentId, list);
    }

    for (const st of params.students) {
      const stEvents = eventsByStudent.get(st.id) ?? [];
      const byCriterion: Record<string, StudentCriterionTally> = {};
      for (const c of params.criteria) {
        byCriterion[c.id] = {
          criterionId: c.id,
          positiveCount: 0,
          negativeCount: 0,
          rawNet: 0,
          clampedNet: 0,
        };
      }

      let todayCount = 0;
      let todayNet = 0;
      let positiveTotal = 0;
      let negativeTotal = 0;

      for (const ev of stEvents) {
        if (ev.occurredAt.startsWith(todayPrefix)) {
          todayCount++;
          todayNet += ev.delta;
        }
        if (ev.delta > 0) positiveTotal += ev.delta;
        if (ev.delta < 0) negativeTotal += Math.abs(ev.delta);

        const tally =
          byCriterion[ev.criterionId] ??
          (byCriterion[ev.criterionId] = {
            criterionId: ev.criterionId,
            positiveCount: 0,
            negativeCount: 0,
            rawNet: 0,
            clampedNet: 0,
          });
        if (ev.delta > 0) tally.positiveCount += 1;
        else if (ev.delta < 0) tally.negativeCount += 1;
        tally.rawNet += ev.delta;
      }

      let weightedOffset = 0;
      let totalNetPoints = 0;
      for (const tally of Object.values(byCriterion)) {
        const crit = criteriaById.get(tally.criterionId);
        const minPts = crit?.minPoints ?? -10;
        const maxPts = crit?.maxPoints ?? 10;
        const weight = crit?.weight ?? 1;
        tally.clampedNet = Math.max(minPts, Math.min(maxPts, tally.rawNet));
        weightedOffset += tally.clampedNet * weight * rule.pointsPerStep;
        totalNetPoints += tally.clampedNet;
      }

      const rawGrade = rule.startingGrade + weightedOffset;
      const clampedGrade = Math.max(rule.minGrade, Math.min(rule.maxGrade, rawGrade));
      const suggestedGrade = Math.round(clampedGrade * 100) / 100;

      result.set(st.id, {
        studentId: st.id,
        suggestedGrade,
        totalNetPoints: Math.round(totalNetPoints * 100) / 100,
        positiveTotal: Math.round(positiveTotal * 100) / 100,
        negativeTotal: Math.round(negativeTotal * 100) / 100,
        todayCount,
        todayNet: Math.round(todayNet * 100) / 100,
        byCriterion,
      });
    }

    return result;
  }
}
