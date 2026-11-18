import { MIDDLE_SCHOOL_LEVELS, SCHOOL_TERMS } from '@/src/db/seedDefaults';
import { ar } from '@/src/i18n/ar';
import { en } from '@/src/i18n/en';
import { fr } from '@/src/i18n/fr';
import type {
  GradeRecord,
  LocalizedText,
  MiddleSchoolLevel,
  SectionFeatureType,
  SectionNode,
  SubjectRecord,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export type PresetSubjectKey = keyof typeof ar.subjects.presets;

export interface SubjectPresetSpec {
  key: PresetSubjectKey;
  color: string;
  icon: string;
}

export const PRESET_SUBJECT_SPECS: SubjectPresetSpec[] = [
  { key: 'hg', color: '#f59e0b', icon: 'Landmark' },
  { key: 'civic', color: '#0d9488', icon: 'Scale' },
  { key: 'pe', color: '#16a34a', icon: 'Activity' },
  { key: 'arabic', color: '#1e40af', icon: 'BookOpen' },
  { key: 'french', color: '#4f46e5', icon: 'Languages' },
  { key: 'english', color: '#0ea5e9', icon: 'Globe' },
  { key: 'math', color: '#7c3aed', icon: 'Calculator' },
  { key: 'physics', color: '#0284c7', icon: 'Atom' },
  { key: 'sciences', color: '#15803d', icon: 'Dna' },
  { key: 'islamic', color: '#0f766e', icon: 'MoonStar' },
  { key: 'cs', color: '#334155', icon: 'Monitor' },
  { key: 'arts', color: '#e11d48', icon: 'Palette' },
];

export const SUBJECT_COLOR_PALETTE = [
  '#f59e0b',
  '#0d9488',
  '#1e40af',
  '#4f46e5',
  '#0ea5e9',
  '#16a34a',
  '#7c3aed',
  '#e11d48',
  '#0284c7',
  '#334155',
  '#b45309',
  '#0f766e',
];

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function buildPresetLocalizedNames(key: PresetSubjectKey): LocalizedText {
  return {
    ar: ar.subjects.presets[key],
    en: en.subjects.presets[key],
    fr: fr.subjects.presets[key],
  };
}

export interface SubjectDependencies {
  filesCount: number;
  gradesCount: number;
  classesCount: number;
  examsCount: number;
  sectionIds: string[];
}

export class SubjectsService {
  constructor(private adapter: IDataAdapter) {}

  private onboardingMetaKey(academicYearId: string, ownerId: string): string {
    return `subjects_onboarded__${academicYearId}__${ownerId}`;
  }

  async hasCompletedOnboarding(academicYearId: string, ownerId: string): Promise<boolean> {
    const val = await this.adapter.getMeta(this.onboardingMetaKey(academicYearId, ownerId));
    return val === '1';
  }

  async markOnboardingCompleted(academicYearId: string, ownerId: string): Promise<void> {
    await this.adapter.setMeta(this.onboardingMetaKey(academicYearId, ownerId), '1');
  }

  async listForTeacher(
    academicYearId: string,
    ownerId: string,
    includeArchived = false
  ): Promise<SubjectRecord[]> {
    const all = await this.adapter.queryByYear('subjects', academicYearId);
    return all
      .filter((s) => s.ownerId === ownerId && (includeArchived || s.isActive))
      .sort((a, b) => a.order - b.order);
  }

  async listTrashed(academicYearId: string, ownerId: string): Promise<SubjectRecord[]> {
    const all = await this.adapter.queryByYear('subjects', academicYearId, true);
    const nowMs = Date.now();
    const valid: SubjectRecord[] = [];
    for (const s of all) {
      if (s.ownerId !== ownerId || !s.deletedAt) continue;
      const deletedMs = Date.parse(s.deletedAt);
      if (!Number.isNaN(deletedMs) && nowMs - deletedMs >= TRASH_RETENTION_MS) {
        await this.purgeSubjectForever(academicYearId, s.id);
      } else {
        valid.push(s);
      }
    }
    return valid.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  }

  async addSubject(
    ctx: ServiceContext,
    input: {
      id?: string;
      names: LocalizedText;
      color: string;
      icon: string;
      isActive?: boolean;
      archivedNeedsDeleteReview?: boolean;
    }
  ): Promise<SubjectRecord> {
    const existing = await this.listForTeacher(ctx.academicYearId, ctx.ownerId, true);
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.order), 0);
    const now = new Date().toISOString();
    const subject: SubjectRecord = {
      id: input.id || `subj_${generateId().slice(0, 10)}`,
      names: {
        ar: input.names.ar.trim() || input.names.en.trim() || input.names.fr.trim(),
        en: input.names.en.trim() || input.names.ar.trim() || input.names.fr.trim(),
        fr: input.names.fr.trim() || input.names.en.trim() || input.names.ar.trim(),
      },
      color: input.color || '#1e40af',
      icon: input.icon || 'BookOpen',
      order: maxOrder + 1,
      isActive: input.isActive ?? true,
      archivedNeedsDeleteReview: input.archivedNeedsDeleteReview ?? false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };

    await this.adapter.put('subjects', subject);
    await this.syncSubjectFolders(ctx, subject);
    await this.markOnboardingCompleted(ctx.academicYearId, ctx.ownerId);
    return subject;
  }

  async updateSubject(
    ctx: ServiceContext,
    subjectId: string,
    patch: {
      names?: LocalizedText;
      color?: string;
      icon?: string;
      isActive?: boolean;
      archivedNeedsDeleteReview?: boolean;
    }
  ): Promise<SubjectRecord | null> {
    const existing = await this.adapter.getById('subjects', subjectId);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: SubjectRecord = {
      ...existing,
      ...patch,
      names: patch.names
        ? {
            ar: patch.names.ar.trim() || existing.names.ar,
            en: patch.names.en.trim() || patch.names.ar.trim() || existing.names.en,
            fr: patch.names.fr.trim() || patch.names.en.trim() || existing.names.fr,
          }
        : existing.names,
      updatedAt: now,
    };
    await this.adapter.put('subjects', updated);

    // Update linked section nodes in place without changing SectionNode.id so file links never break
    const allSections = await this.adapter.queryByYear('sections', ctx.academicYearId);
    const updatedNodes: SectionNode[] = [];
    for (const sec of allSections) {
      if (sec.subjectId !== subjectId) continue;
      const isRootSubjectNode = sec.kind === 'subject';
      updatedNodes.push({
        ...sec,
        names: isRootSubjectNode ? { ...updated.names } : sec.names,
        defaultNames: isRootSubjectNode ? { ...updated.names } : sec.defaultNames,
        icon: isRootSubjectNode ? updated.icon : sec.icon,
        accentColor: updated.color,
        isHidden: !updated.isActive,
        updatedAt: now,
      });
    }
    if (updatedNodes.length > 0) {
      await this.adapter.bulkPut('sections', updatedNodes);
    }

    return updated;
  }

  async reorderSubjects(ctx: ServiceContext, orderedIds: string[]): Promise<void> {
    const now = new Date().toISOString();
    const subjectsToUpdate: SubjectRecord[] = [];
    const orderBySubjectId = new Map<string, number>();

    for (let i = 0; i < orderedIds.length; i++) {
      const sub = await this.adapter.getById('subjects', orderedIds[i]);
      if (sub) {
        orderBySubjectId.set(sub.id, i + 1);
        subjectsToUpdate.push({ ...sub, order: i + 1, updatedAt: now });
      }
    }
    await this.adapter.bulkPut('subjects', subjectsToUpdate);

    const allSections = await this.adapter.queryByYear('sections', ctx.academicYearId);
    const sectionUpdates: SectionNode[] = [];
    for (const sec of allSections) {
      if (sec.kind === 'subject' && sec.subjectId && orderBySubjectId.has(sec.subjectId)) {
        const baseOrder = orderBySubjectId.get(sec.subjectId)!;
        const isStaticPrefixContainer =
          sec.parentId?.endsWith('__sec_06') || sec.parentId?.endsWith('__sec_10');
        sectionUpdates.push({
          ...sec,
          order: isStaticPrefixContainer ? 10 + baseOrder : baseOrder,
          updatedAt: now,
        });
      }
    }
    await this.adapter.bulkPut('sections', sectionUpdates);
  }

  /**
   * Idempotently ensures every active section group (Sections 1, 3, 5, 6, 10)
   * has folders anchored on `subject.id`. Renaming updates nodes in place.
   */
  async syncSubjectFolders(ctx: ServiceContext, subject: SubjectRecord): Promise<void> {
    const allSections = await this.adapter.queryByYear('sections', ctx.academicYearId, true);
    const existingById = new Map(allSections.map((s) => [s.id, s]));
    const now = new Date().toISOString();
    const sid = (slug: string) => `${ctx.academicYearId}__${slug}`;
    const toPut: SectionNode[] = [];

    const ensureNode = (params: {
      id: string;
      parentId: string;
      kind: SectionNode['kind'];
      featureType?: SectionFeatureType;
      names: LocalizedText;
      icon: string;
      order: number;
      levelCode?: MiddleSchoolLevel;
      termNumber?: 1 | 2 | 3;
    }) => {
      if (!existingById.has(params.parentId)) return;
      const existing = existingById.get(params.id);
      if (existing && !existing.deletedAt) {
        toPut.push({
          ...existing,
          names: params.kind === 'subject' ? { ...subject.names } : existing.names,
          defaultNames: params.kind === 'subject' ? { ...subject.names } : existing.defaultNames,
          icon: params.kind === 'subject' ? subject.icon : existing.icon,
          accentColor: subject.color,
          isHidden: !subject.isActive,
          order: params.order,
          subjectId: subject.id,
          updatedAt: now,
        });
        return;
      }
      toPut.push({
        id: params.id,
        parentId: params.parentId,
        kind: params.kind,
        featureType: params.featureType ?? 'standard',
        names: { ...params.names },
        defaultNames: { ...params.names },
        icon: params.icon,
        accentColor: subject.color,
        order: params.order,
        isHidden: !subject.isActive,
        isPinned: false,
        isDefault: true,
        isCustomized: false,
        levelCode: params.levelCode,
        termNumber: params.termNumber,
        subjectId: subject.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: ctx.ownerId,
        schoolId: ctx.schoolId,
        academicYearId: ctx.academicYearId,
      });
    };

    // Section 1: Notes and lessons by level -> lessons / notes -> subject
    for (const lvl of MIDDLE_SCHOOL_LEVELS) {
      for (const bucket of ['lessons', 'notes'] as const) {
        ensureNode({
          id: sid(`sec_01_${lvl.code}_${bucket}__subj_${subject.id}`),
          parentId: sid(`sec_01_${lvl.code}_${bucket}`),
          kind: 'subject',
          featureType: 'standard',
          names: subject.names,
          icon: subject.icon,
          order: subject.order,
          levelCode: lvl.code,
        });
      }
    }

    // Section 3: Diagnostic, Assignments (+terms), Term Exams (+terms), BEM (+sessions), Remedial
    for (const lvl of MIDDLE_SCHOOL_LEVELS) {
      ensureNode({
        id: sid(`sec_03_diag_${lvl.code}__subj_${subject.id}`),
        parentId: sid(`sec_03_diag_${lvl.code}`),
        kind: 'subject',
        featureType: 'assignments_exams',
        names: subject.names,
        icon: subject.icon,
        order: subject.order,
        levelCode: lvl.code,
      });

      const assignSubjId = sid(`sec_03_assign_${lvl.code}__subj_${subject.id}`);
      ensureNode({
        id: assignSubjId,
        parentId: sid(`sec_03_assign_${lvl.code}`),
        kind: 'subject',
        featureType: 'assignments_exams',
        names: subject.names,
        icon: subject.icon,
        order: subject.order,
        levelCode: lvl.code,
      });
      for (const t of SCHOOL_TERMS) {
        ensureNode({
          id: sid(`sec_03_assign_${lvl.code}__subj_${subject.id}_t${t.num}`),
          parentId: assignSubjId,
          kind: 'term',
          featureType: 'assignments_exams',
          names: t.names,
          icon: 'CalendarRange',
          order: t.num,
          levelCode: lvl.code,
          termNumber: t.num,
        });
      }

      const examsSubjId = sid(`sec_03_exams_${lvl.code}__subj_${subject.id}`);
      ensureNode({
        id: examsSubjId,
        parentId: sid(`sec_03_exams_${lvl.code}`),
        kind: 'subject',
        featureType: 'assignments_exams',
        names: subject.names,
        icon: subject.icon,
        order: subject.order,
        levelCode: lvl.code,
      });
      for (const t of SCHOOL_TERMS) {
        ensureNode({
          id: sid(`sec_03_exams_${lvl.code}__subj_${subject.id}_t${t.num}`),
          parentId: examsSubjId,
          kind: 'term',
          featureType: 'assignments_exams',
          names: t.names,
          icon: 'CalendarRange',
          order: t.num,
          levelCode: lvl.code,
          termNumber: t.num,
        });
      }
    }

    const bemSubjId = sid(`sec_03_bem__subj_${subject.id}`);
    ensureNode({
      id: bemSubjId,
      parentId: sid('sec_03_bem'),
      kind: 'subject',
      featureType: 'assignments_exams',
      names: subject.names,
      icon: subject.icon,
      order: subject.order,
    });
    ['2024', '2025', '2026'].forEach((yr, yi) => {
      ensureNode({
        id: sid(`sec_03_bem__subj_${subject.id}_${yr}`),
        parentId: bemSubjId,
        kind: 'subsection',
        featureType: 'assignments_exams',
        names: { ar: `دورة ${yr}`, en: `Session ${yr}`, fr: `Session ${yr}` },
        icon: 'Calendar',
        order: yi + 1,
      });
    });

    ensureNode({
      id: sid(`sec_03_remedial__subj_${subject.id}`),
      parentId: sid('sec_03_remedial'),
      kind: 'subject',
      featureType: 'assignments_exams',
      names: subject.names,
      icon: subject.icon,
      order: subject.order,
    });

    // Section 5: Supporting books -> subject -> 1M..4M
    const sec5SubjId = sid(`sec_05__subj_${subject.id}`);
    ensureNode({
      id: sec5SubjId,
      parentId: sid('sec_05'),
      kind: 'subject',
      featureType: 'standard',
      names: subject.names,
      icon: subject.icon,
      order: subject.order,
    });
    MIDDLE_SCHOOL_LEVELS.forEach((lvl, li) => {
      ensureNode({
        id: sid(`sec_05__subj_${subject.id}_${lvl.code}`),
        parentId: sec5SubjId,
        kind: 'level',
        featureType: 'standard',
        names: lvl.names,
        icon: 'Book',
        order: li + 1,
        levelCode: lvl.code,
      });
    });

    // Section 6: Teaching aids -> subject -> 1M..4M
    const sec6SubjId = sid(`sec_06__subj_${subject.id}`);
    ensureNode({
      id: sec6SubjId,
      parentId: sid('sec_06'),
      kind: 'subject',
      featureType: 'standard',
      names: subject.names,
      icon: subject.icon,
      order: 10 + subject.order,
    });
    MIDDLE_SCHOOL_LEVELS.forEach((lvl, li) => {
      ensureNode({
        id: sid(`sec_06__subj_${subject.id}_${lvl.code}`),
        parentId: sec6SubjId,
        kind: 'level',
        featureType: 'standard',
        names: lvl.names,
        icon: 'Folder',
        order: li + 1,
        levelCode: lvl.code,
      });
    });

    // Section 10: Audio-visual -> subject -> 1M..4M
    const sec10SubjId = sid(`sec_10__subj_${subject.id}`);
    ensureNode({
      id: sec10SubjId,
      parentId: sid('sec_10'),
      kind: 'subject',
      featureType: 'audiovisual',
      names: subject.names,
      icon: subject.icon,
      order: 10 + subject.order,
    });
    MIDDLE_SCHOOL_LEVELS.forEach((lvl, li) => {
      ensureNode({
        id: sid(`sec_10__subj_${subject.id}_${lvl.code}`),
        parentId: sec10SubjId,
        kind: 'level',
        featureType: 'audiovisual',
        names: lvl.names,
        icon: 'Film',
        order: li + 1,
        levelCode: lvl.code,
      });
    });

    if (toPut.length > 0) {
      await this.adapter.bulkPut('sections', toPut);
    }
  }

  async getDependencies(academicYearId: string, subjectId: string): Promise<SubjectDependencies> {
    const [sections, files, grades, classRooms] = await Promise.all([
      this.adapter.queryByYear('sections', academicYearId),
      this.adapter.queryByYear('files', academicYearId),
      this.adapter.queryByYear('grades', academicYearId),
      this.adapter.queryByYear('classRooms', academicYearId),
    ]);

    const subjectSectionSet = new Set<string>(
      sections.filter((s) => s.subjectId === subjectId).map((s) => s.id)
    );
    // Include any custom child subfolders added inside a subject section
    let added = true;
    while (added) {
      added = false;
      for (const s of sections) {
        if (s.parentId && subjectSectionSet.has(s.parentId) && !subjectSectionSet.has(s.id)) {
          subjectSectionSet.add(s.id);
          added = true;
        }
      }
    }

    const linkedFiles = files.filter((f) => subjectSectionSet.has(f.sectionId));
    const examFiles = linkedFiles.filter(
      (f) => f.examKind || f.sectionId.includes('__sec_03_')
    );
    const subjectGrades = grades.filter((g) => g.subjectKey === subjectId);

    const classIdSet = new Set<string>();
    for (const c of classRooms) {
      if (c.subjectIds?.includes(subjectId)) classIdSet.add(c.id);
    }
    for (const g of subjectGrades) {
      classIdSet.add(g.classRoomId);
    }

    return {
      filesCount: linkedFiles.length,
      gradesCount: subjectGrades.length,
      classesCount: classIdSet.size,
      examsCount: examFiles.length,
      sectionIds: Array.from(subjectSectionSet),
    };
  }

  async archiveSubject(ctx: ServiceContext, subjectId: string): Promise<void> {
    await this.updateSubject(ctx, subjectId, {
      isActive: false,
      archivedNeedsDeleteReview: false,
    });
  }

  async unarchiveSubject(ctx: ServiceContext, subjectId: string): Promise<void> {
    await this.updateSubject(ctx, subjectId, {
      isActive: true,
      archivedNeedsDeleteReview: false,
    });
  }

  async dismissDeleteReview(subjectId: string): Promise<void> {
    const existing = await this.adapter.getById('subjects', subjectId);
    if (!existing) return;
    await this.adapter.put('subjects', {
      ...existing,
      archivedNeedsDeleteReview: false,
      updatedAt: new Date().toISOString(),
    });
  }

  async moveSubjectContent(
    ctx: ServiceContext,
    fromSubjectId: string,
    toSubjectId: string
  ): Promise<void> {
    if (fromSubjectId === toSubjectId) return;
    const targetSubject = await this.adapter.getById('subjects', toSubjectId);
    if (!targetSubject) return;
    await this.syncSubjectFolders(ctx, targetSubject);

    const now = new Date().toISOString();
    const [sections, files, grades, history, classes] = await Promise.all([
      this.adapter.queryByYear('sections', ctx.academicYearId),
      this.adapter.queryByYear('files', ctx.academicYearId),
      this.adapter.queryByYear('grades', ctx.academicYearId),
      this.adapter.queryByYear('gradeHistory', ctx.academicYearId),
      this.adapter.queryByYear('classRooms', ctx.academicYearId),
    ]);

    const fromSections = sections.filter((s) => s.subjectId === fromSubjectId);
    const toSections = sections.filter((s) => s.subjectId === toSubjectId);

    // Map each source section ID to the closest structural match under targetSubject
    const normalizeContainerKey = (sec: SectionNode, subjId: string) => {
      const slug = sec.id.includes('__') ? sec.id.slice(sec.id.indexOf('__') + 2) : sec.id;
      return slug.replace(`__subj_${subjId}`, '__TARGET').replace(`_${subjId}`, '_TARGET');
    };

    const toByContainerKey = new Map<string, string>();
    for (const s of toSections) {
      toByContainerKey.set(normalizeContainerKey(s, toSubjectId), s.id);
    }
    const fallbackTargetSectionId = toSections[0]?.id || `${ctx.academicYearId}__sec_12`;

    const fromSectionMap = new Map<string, string>();
    for (const s of fromSections) {
      const key = normalizeContainerKey(s, fromSubjectId);
      fromSectionMap.set(s.id, toByContainerKey.get(key) || fallbackTargetSectionId);
    }

    // Also resolve any nested custom subfolders under fromSections
    const fromIdSet = new Set(fromSections.map((s) => s.id));
    for (const s of sections) {
      if (s.parentId && fromIdSet.has(s.parentId) && !fromSectionMap.has(s.id)) {
        fromSectionMap.set(s.id, fromSectionMap.get(s.parentId) || fallbackTargetSectionId);
        fromIdSet.add(s.id);
      }
    }

    const updatedFiles = files
      .filter((f) => fromIdSet.has(f.sectionId))
      .map((f) => ({
        ...f,
        sectionId: fromSectionMap.get(f.sectionId) || fallbackTargetSectionId,
        updatedAt: now,
      }));
    await this.adapter.bulkPut('files', updatedFiles);

    // Transfer grades safely (avoid duplicates if target subject already has grades for same student+class+term)
    const targetGradeKeys = new Map<string, GradeRecord>();
    for (const g of grades) {
      if (g.subjectKey === toSubjectId) {
        targetGradeKeys.set(`${g.studentId}|${g.classRoomId}|${g.termNumber}`, g);
      }
    }
    const gradesToPut: GradeRecord[] = [];
    for (const g of grades) {
      if (g.subjectKey !== fromSubjectId) continue;
      const k = `${g.studentId}|${g.classRoomId}|${g.termNumber}`;
      const existingTarget = targetGradeKeys.get(k);
      if (existingTarget) {
        gradesToPut.push({
          ...existingTarget,
          continuous:
            existingTarget.continuous.score !== null || existingTarget.continuous.mark
              ? existingTarget.continuous
              : g.continuous,
          assignment:
            existingTarget.assignment.score !== null || existingTarget.assignment.mark
              ? existingTarget.assignment
              : g.assignment,
          exam:
            existingTarget.exam.score !== null || existingTarget.exam.mark
              ? existingTarget.exam
              : g.exam,
          updatedAt: now,
        });
        await this.adapter.softDelete('grades', g.id);
      } else {
        gradesToPut.push({ ...g, subjectKey: toSubjectId, updatedAt: now });
      }
    }
    await this.adapter.bulkPut('grades', gradesToPut);

    const updatedHistory = history
      .filter((h) => h.subjectKey === fromSubjectId)
      .map((h) => ({ ...h, subjectKey: toSubjectId, updatedAt: now }));
    await this.adapter.bulkPut('gradeHistory', updatedHistory);

    const updatedClasses = classes
      .filter((c) => c.subjectIds?.includes(fromSubjectId))
      .map((c) => ({
        ...c,
        subjectIds: Array.from(
          new Set(c.subjectIds!.map((id) => (id === fromSubjectId ? toSubjectId : id)))
        ),
        updatedAt: now,
      }));
    await this.adapter.bulkPut('classRooms', updatedClasses);

    // Soft-delete emptied source subject & its section nodes
    for (const sId of fromIdSet) {
      await this.adapter.softDelete('sections', sId);
    }
    const subj = await this.adapter.getById('subjects', fromSubjectId);
    if (subj) {
      await this.adapter.put('subjects', {
        ...subj,
        isActive: false,
        archivedNeedsDeleteReview: false,
        deletedAt: now,
        updatedAt: now,
      });
    }
  }

  async deleteSubjectToTrash(ctx: ServiceContext, subjectId: string): Promise<void> {
    const deps = await this.getDependencies(ctx.academicYearId, subjectId);
    const secSet = new Set(deps.sectionIds);
    const now = new Date().toISOString();

    const [files, grades, classes] = await Promise.all([
      this.adapter.queryByYear('files', ctx.academicYearId),
      this.adapter.queryByYear('grades', ctx.academicYearId),
      this.adapter.queryByYear('classRooms', ctx.academicYearId),
    ]);

    for (const f of files) {
      if (secSet.has(f.sectionId)) {
        await this.adapter.softDelete('files', f.id);
      }
    }
    for (const g of grades) {
      if (g.subjectKey === subjectId) {
        await this.adapter.softDelete('grades', g.id);
      }
    }
    for (const sId of secSet) {
      await this.adapter.softDelete('sections', sId);
    }
    for (const c of classes) {
      if (c.subjectIds?.includes(subjectId)) {
        await this.adapter.put('classRooms', {
          ...c,
          subjectIds: c.subjectIds.filter((id) => id !== subjectId),
          updatedAt: now,
        });
      }
    }

    const subj = await this.adapter.getById('subjects', subjectId);
    if (subj) {
      await this.adapter.put('subjects', {
        ...subj,
        isActive: false,
        archivedNeedsDeleteReview: false,
        deletedAt: now,
        updatedAt: now,
      });
    }
  }

  async restoreFromTrash(ctx: ServiceContext, subjectId: string): Promise<void> {
    const allSubjects = await this.adapter.queryByYear('subjects', ctx.academicYearId, true);
    const subj = allSubjects.find((s) => s.id === subjectId);
    if (!subj) return;

    const now = new Date().toISOString();
    const restored: SubjectRecord = {
      ...subj,
      isActive: true,
      archivedNeedsDeleteReview: false,
      deletedAt: null,
      updatedAt: now,
    };
    await this.adapter.put('subjects', restored);

    const [sections, files, grades] = await Promise.all([
      this.adapter.queryByYear('sections', ctx.academicYearId, true),
      this.adapter.queryByYear('files', ctx.academicYearId, true),
      this.adapter.queryByYear('grades', ctx.academicYearId, true),
    ]);

    const secSet = new Set<string>(
      sections.filter((s) => s.subjectId === subjectId).map((s) => s.id)
    );
    let added = true;
    while (added) {
      added = false;
      for (const s of sections) {
        if (s.parentId && secSet.has(s.parentId) && !secSet.has(s.id)) {
          secSet.add(s.id);
          added = true;
        }
      }
    }

    const secRestores: SectionNode[] = sections
      .filter((s) => secSet.has(s.id))
      .map((s) => ({
        ...s,
        deletedAt: null,
        isHidden: false,
        updatedAt: now,
      }));
    await this.adapter.bulkPut('sections', secRestores);

    const fileRestores = files
      .filter((f) => secSet.has(f.sectionId) && f.deletedAt)
      .map((f) => ({ ...f, deletedAt: null, updatedAt: now }));
    await this.adapter.bulkPut('files', fileRestores);

    const gradeRestores = grades
      .filter((g) => g.subjectKey === subjectId && g.deletedAt)
      .map((g) => ({ ...g, deletedAt: null, updatedAt: now }));
    await this.adapter.bulkPut('grades', gradeRestores);

    await this.syncSubjectFolders(ctx, restored);
  }

  async purgeSubjectForever(academicYearId: string, subjectId: string): Promise<void> {
    const [sections, files, grades, history, classes] = await Promise.all([
      this.adapter.queryByYear('sections', academicYearId, true),
      this.adapter.queryByYear('files', academicYearId, true),
      this.adapter.queryByYear('grades', academicYearId, true),
      this.adapter.queryByYear('gradeHistory', academicYearId, true),
      this.adapter.queryByYear('classRooms', academicYearId, true),
    ]);

    const secSet = new Set<string>(
      sections.filter((s) => s.subjectId === subjectId).map((s) => s.id)
    );
    let added = true;
    while (added) {
      added = false;
      for (const s of sections) {
        if (s.parentId && secSet.has(s.parentId) && !secSet.has(s.id)) {
          secSet.add(s.id);
          added = true;
        }
      }
    }

    for (const f of files) {
      if (secSet.has(f.sectionId)) await this.adapter.hardDelete('files', f.id);
    }
    for (const g of grades) {
      if (g.subjectKey === subjectId) await this.adapter.hardDelete('grades', g.id);
    }
    for (const h of history) {
      if (h.subjectKey === subjectId) await this.adapter.hardDelete('gradeHistory', h.id);
    }
    for (const sId of secSet) {
      await this.adapter.hardDelete('sections', sId);
    }
    for (const c of classes) {
      if (c.subjectIds?.includes(subjectId)) {
        await this.adapter.put('classRooms', {
          ...c,
          subjectIds: c.subjectIds.filter((id) => id !== subjectId),
          updatedAt: new Date().toISOString(),
        });
      }
    }
    await this.adapter.hardDelete('subjects', subjectId);
  }
}
