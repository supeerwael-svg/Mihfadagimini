import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Check,
  ClipboardPaste,
  Copy,
  Delete as BackspaceIcon,
  Download,
  Edit2,
  FileSpreadsheet,
  History,
  Lock,
  Plus,
  Printer,
  Redo2,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Undo2,
  UserPlus,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { StudentBehaviorSummary } from '@/src/services/BehaviorService';
import { normalizeSearchText } from '@/src/services/crypto';
import { EMPTY_CELL, markLabel, type TermAverageResult } from '@/src/services/GradesService';
import type {
  BehaviorConfigRecord,
  BehaviorCriterionRecord,
  BehaviorEventRecord,
  ClassRoomRecord,
  GradeCellValue,
  GradeHistoryRecord,
  GradeRecord,
  GradeSubjectKey,
  GradingConfigRecord,
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';
import { EmptyState } from '@/src/components/common/EmptyState';
import { EvaluationBottomSheet } from '@/src/components/seating/EvaluationBottomSheet';
import { SubjectManagerModal } from '@/src/components/subjects/SubjectManagerPanel';
import { ExcelImportWizardModal } from './ExcelImportWizardModal';

interface GradesTableWorkspaceProps {
  ctx: ServiceContext;
  user: UserRecord;
  schoolName: string;
  classRoom: ClassRoomRecord;
  allClasses: ClassRoomRecord[];
  subjects: SubjectRecord[];
  isArchiveYear: boolean;
  termTab: 1 | 2 | 3 | 'year';
  onChangeTermTab: (t: 1 | 2 | 3 | 'year') => void;
  subjectKey: GradeSubjectKey;
  onChangeSubject: (s: GradeSubjectKey) => void;
  crossLinkButton?: { label: string; onClick: () => void };
  onDataChanged?: () => void;
  onSubjectsChanged?: () => Promise<void>;
}

type GradeField = 'continuous' | 'assignment' | 'exam';
type SortKey = 'order' | 'lastName' | 'firstName' | 'continuous' | 'assignment' | 'exam' | 'average';

interface UndoEntry {
  studentId: string;
  studentName: string;
  field: GradeField;
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  prevValue: GradeCellValue;
  nextValue: GradeCellValue;
}

export const GradesTableWorkspace: React.FC<GradesTableWorkspaceProps> = ({
  ctx,
  user,
  schoolName,
  classRoom,
  allClasses,
  subjects,
  isArchiveYear,
  termTab,
  onChangeTermTab,
  subjectKey,
  onChangeSubject,
  crossLinkButton,
  onDataChanged,
  onSubjectsChanged,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [allTermsGrades, setAllTermsGrades] = useState<GradeRecord[]>([]);
  const [gradingConfig, setGradingConfig] = useState<GradingConfigRecord | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'below10' | 'above10' | 'missing'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortAsc, setSortAsc] = useState(true);
  const [showRank, setShowRank] = useState(false);

  // Keypad / inline edit state
  const [activeCell, setActiveCell] = useState<{ studentId: string; field: GradeField } | null>(null);
  const [keypadBuffer, setKeypadBuffer] = useState('');
  const [keypadError, setKeypadError] = useState('');
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  // Modals
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newLastName, setNewLastName] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [editStudent, setEditStudent] = useState<StudentRecord | null>(null);
  const [deleteStudentTarget, setDeleteStudentTarget] = useState<StudentRecord | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showCopyRoster, setShowCopyRoster] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<GradeHistoryRecord[]>([]);
  const [showPrintSheet, setShowPrintSheet] = useState(false);
  const [importBlob, setImportBlob] = useState<{ blob: Blob; name: string } | null>(null);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [editSubjectTargetId, setEditSubjectTargetId] = useState<string | null>(null);
  const updateExcelRef = useRef<HTMLInputElement | null>(null);

  // Seating behavior link state
  const [behaviorCriteria, setBehaviorCriteria] = useState<BehaviorCriterionRecord[]>([]);
  const [behaviorConfig, setBehaviorConfig] = useState<BehaviorConfigRecord | null>(null);
  const [behaviorEvents, setBehaviorEvents] = useState<BehaviorEventRecord[]>([]);
  const [evalStudentTarget, setEvalStudentTarget] = useState<StudentRecord | null>(null);
  const [confirmApplyOne, setConfirmApplyOne] = useState<{
    student: StudentRecord;
    score: number;
  } | null>(null);
  const [confirmApplyAll, setConfirmApplyAll] = useState(false);

  const visibleSubjects = useMemo(() => {
    if (classRoom.subjectIds && classRoom.subjectIds.length > 0) {
      const linked = subjects.filter((s) => classRoom.subjectIds!.includes(s.id));
      if (linked.length > 0) return linked;
    }
    return subjects;
  }, [subjects, classRoom.subjectIds]);

  const effectiveSubjectKey = useMemo(() => {
    if (visibleSubjects.some((s) => s.id === subjectKey)) return subjectKey;
    return visibleSubjects[0]?.id || '';
  }, [visibleSubjects, subjectKey]);

  useEffect(() => {
    if (effectiveSubjectKey && effectiveSubjectKey !== subjectKey) {
      onChangeSubject(effectiveSubjectKey);
    }
  }, [effectiveSubjectKey, subjectKey]);

  const canAccessBehavior = services.behavior.canAccessBehavior(user, classRoom);

  const loadWorkspaceData = async () => {
    const [cfg, stList, termAll] = await Promise.all([
      services.grades.getGradingConfig(ctx),
      services.students.listByClass(ctx.academicYearId, classRoom.id),
      effectiveSubjectKey
        ? services.grades.getGradesForClassAllTerms(
            ctx.academicYearId,
            classRoom.id,
            effectiveSubjectKey
          )
        : Promise.resolve([]),
    ]);
    setGradingConfig(cfg);
    setStudents(stList);
    setAllTermsGrades(termAll);
    if (termTab !== 'year') {
      setGrades(termAll.filter((g) => g.termNumber === termTab));
    }

    if (canAccessBehavior && termTab !== 'year') {
      const [crit, bCfg, evs] = await Promise.all([
        services.behavior.listCriteria(ctx, true),
        services.behavior.getConfig(ctx),
        services.behavior.listEventsForClass(
          ctx.academicYearId,
          classRoom.id,
          termTab,
          effectiveSubjectKey
        ),
      ]);
      setBehaviorCriteria(crit);
      setBehaviorConfig(bCfg);
      setBehaviorEvents(evs);
    } else {
      setBehaviorEvents([]);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
    setActiveCell(null);
  }, [ctx.academicYearId, classRoom.id, termTab, effectiveSubjectKey, canAccessBehavior]);

  const behaviorSummaries: Map<string, StudentBehaviorSummary> = useMemo(() => {
    if (!canAccessBehavior || termTab === 'year' || !behaviorConfig) {
      return new Map();
    }
    return services.behavior.computeClassSummaries({
      students,
      criteria: behaviorCriteria,
      events: behaviorEvents,
      config: behaviorConfig,
      classRoomId: classRoom.id,
      termNumber: termTab,
      subjectKey: effectiveSubjectKey,
    });
  }, [
    canAccessBehavior,
    termTab,
    behaviorConfig,
    students,
    behaviorCriteria,
    behaviorEvents,
    classRoom.id,
    effectiveSubjectKey,
  ]);

  const canView = services.grades.canUserViewGrades(user, gradingConfig, classRoom);
  const canEdit = services.grades.canUserEditGrades(user, isArchiveYear);
  const formula = services.grades.resolveFormula(
    gradingConfig,
    classRoom.levelCode,
    effectiveSubjectKey
  );

  const gradeByStudent = useMemo(
    () => new Map(grades.map((g) => [g.studentId, g])),
    [grades]
  );

  const termGradeMaps = useMemo(() => {
    const m1 = new Map<string, GradeRecord>();
    const m2 = new Map<string, GradeRecord>();
    const m3 = new Map<string, GradeRecord>();
    for (const g of allTermsGrades) {
      if (g.termNumber === 1) m1.set(g.studentId, g);
      else if (g.termNumber === 2) m2.set(g.studentId, g);
      else if (g.termNumber === 3) m3.set(g.studentId, g);
    }
    return { 1: m1, 2: m2, 3: m3 };
  }, [allTermsGrades]);

  const computedRows = useMemo(() => {
    const rows = students.map((st) => {
      if (termTab === 'year') {
        const a1 = services.grades.calculateTermAverage(termGradeMaps[1].get(st.id), formula);
        const a2 = services.grades.calculateTermAverage(termGradeMaps[2].get(st.id), formula);
        const a3 = services.grades.calculateTermAverage(termGradeMaps[3].get(st.id), formula);
        const annual = services.grades.calculateAnnualAverage(a1, a2, a3, formula);
        return {
          student: st,
          grade: undefined as GradeRecord | undefined,
          t1Avg: a1,
          t2Avg: a2,
          t3Avg: a3,
          avg: annual,
        };
      }
      const g = gradeByStudent.get(st.id);
      const avg = services.grades.calculateTermAverage(g, formula);
      return {
        student: st,
        grade: g,
        t1Avg: avg,
        t2Avg: avg,
        t3Avg: avg,
        avg,
      };
    });

    // Compute rank among complete averages
    const completeSorted = [...rows]
      .filter((r) => r.avg.value !== null)
      .sort((a, b) => (b.avg.value ?? 0) - (a.avg.value ?? 0));
    const rankMap = new Map<string, number>();
    completeSorted.forEach((r, idx) => {
      if (idx > 0 && completeSorted[idx - 1].avg.value === r.avg.value) {
        rankMap.set(r.student.id, rankMap.get(completeSorted[idx - 1].student.id)!);
      } else {
        rankMap.set(r.student.id, idx + 1);
      }
    });

    return rows.map((r) => ({ ...r, rank: rankMap.get(r.student.id) ?? null }));
  }, [students, gradeByStudent, termGradeMaps, termTab, formula]);

  const stats = useMemo(() => {
    const vals = computedRows
      .map((r) => r.avg.value)
      .filter((v): v is number => v !== null);
    const total = computedRows.length;
    const graded = vals.length;
    const classAvg =
      graded > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / graded) * 100) / 100 : null;
    const highest = graded > 0 ? Math.max(...vals) : null;
    const lowest = graded > 0 ? Math.min(...vals) : null;
    const passCount = vals.filter((v) => v >= formula.maxGrade / 2).length;
    const passRate = graded > 0 ? Math.round((passCount / graded) * 100) : 0;
    const buckets = [0, 0, 0, 0];
    for (const v of vals) {
      if (v < 5) buckets[0]++;
      else if (v < 10) buckets[1]++;
      else if (v < 15) buckets[2]++;
      else buckets[3]++;
    }
    return { total, graded, classAvg, highest, lowest, passRate, buckets };
  }, [computedRows, formula.maxGrade]);

  const visibleRows = useMemo(() => {
    const q = normalizeSearchText(searchQuery);
    const filtered = computedRows.filter((r) => {
      if (q) {
        const full = normalizeSearchText(`${r.student.lastName} ${r.student.firstName}`);
        if (!full.includes(q)) return false;
      }
      if (filterMode === 'below10') return r.avg.value !== null && r.avg.value < 10;
      if (filterMode === 'above10') return r.avg.value !== null && r.avg.value >= 10;
      if (filterMode === 'missing') return r.avg.status === 'incomplete';
      return true;
    });

    return [...filtered].sort((a, b) => {
      const dirMul = sortAsc ? 1 : -1;
      if (sortKey === 'order') return (a.student.order - b.student.order) * dirMul;
      if (sortKey === 'lastName') return a.student.lastName.localeCompare(b.student.lastName) * dirMul;
      if (sortKey === 'firstName') return a.student.firstName.localeCompare(b.student.firstName) * dirMul;
      if (sortKey === 'average') {
        return ((a.avg.value ?? -1) - (b.avg.value ?? -1)) * dirMul;
      }
      const va = a.grade?.[sortKey]?.score ?? -1;
      const vb = b.grade?.[sortKey]?.score ?? -1;
      return (va - vb) * dirMul;
    });
  }, [computedRows, searchQuery, filterMode, sortKey, sortAsc]);

  if (!canView) {
    return (
      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-[var(--color-text-muted)] mx-auto" />
        <p className="text-sm font-bold text-[var(--color-text)]">{t.grades.noAccessPrivacy}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{t.grades.privacyNotice}</p>
      </div>
    );
  }

  const activeSubject = visibleSubjects.find((s) => s.id === effectiveSubjectKey) || null;
  const subjectLabel = activeSubject ? pickLocalized(activeSubject.names) : '—';

  const termLabel =
    termTab === 1
      ? t.sections.term1
      : termTab === 2
      ? t.sections.term2
      : termTab === 3
      ? t.sections.term3
      : t.grades.yearTab;

  const commitCellValue = async (
    studentId: string,
    field: GradeField,
    nextValue: GradeCellValue,
    recordUndo = true
  ) => {
    if (termTab === 'year' || !canEdit) return;
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    const prevGrade = gradeByStudent.get(studentId);
    const prevValue: GradeCellValue = prevGrade ? prevGrade[field] : { ...EMPTY_CELL };

    await services.grades.upsertGradeCell(ctx, {
      studentId,
      studentName: `${student.lastName} ${student.firstName}`.trim(),
      classRoomId: classRoom.id,
      termNumber: termTab,
      subjectKey: effectiveSubjectKey,
      field,
      value: nextValue,
      actorId: user.id,
      actorName: user.displayName,
    });

    if (recordUndo) {
      setUndoStack((prev) => [
        ...prev.slice(-29),
        {
          studentId,
          studentName: `${student.lastName} ${student.firstName}`.trim(),
          field,
          termNumber: termTab,
          subjectKey: effectiveSubjectKey,
          prevValue,
          nextValue,
        },
      ]);
      setRedoStack([]);
    }
    await loadWorkspaceData();
    onDataChanged?.();
  };

  const handleOpenCell = (studentId: string, field: GradeField) => {
    if (!canEdit || termTab === 'year') return;
    const existing = gradeByStudent.get(studentId)?.[field];
    setActiveCell({ studentId, field });
    setKeypadBuffer(existing?.score !== null && existing?.score !== undefined ? String(existing.score) : '');
    setKeypadError('');
  };

  const handleCommitBufferAndMoveNext = async (moveNext: boolean) => {
    if (!activeCell) return;
    const trimmed = keypadBuffer.trim();
    if (trimmed !== '') {
      const parsed = services.grades.parseGradeInput(trimmed, formula.maxGrade);
      if (!parsed) {
        setKeypadError(`0 – ${formula.maxGrade}`);
        return;
      }
      await commitCellValue(activeCell.studentId, activeCell.field, parsed);
    } else {
      const existing = gradeByStudent.get(activeCell.studentId)?.[activeCell.field];
      if (existing && existing.score !== null) {
        await commitCellValue(activeCell.studentId, activeCell.field, { ...EMPTY_CELL });
      }
    }

    if (moveNext) {
      const idx = visibleRows.findIndex((r) => r.student.id === activeCell.studentId);
      if (idx >= 0 && idx + 1 < visibleRows.length) {
        const nextSt = visibleRows[idx + 1].student;
        handleOpenCell(nextSt.id, activeCell.field);
        return;
      }
    }
    setActiveCell(null);
  };

  const handleKeypadChar = async (ch: string) => {
    if (!activeCell) return;
    setKeypadError('');
    const nextBuf = keypadBuffer + ch;
    const normalized = nextBuf.replace(',', '.');
    if (normalized === '.' || /^\d+(\.\d{0,2})?$/.test(normalized)) {
      const num = Number(normalized);
      if (!Number.isNaN(num) && num > formula.maxGrade) {
        setKeypadError(`0 – ${formula.maxGrade}`);
        return;
      }
      setKeypadBuffer(nextBuf);
      // Instant autosave when valid number (and not ending in trailing dot)
      if (!normalized.endsWith('.') && normalized !== '') {
        const parsed = services.grades.parseGradeInput(nextBuf, formula.maxGrade);
        if (parsed) {
          await commitCellValue(activeCell.studentId, activeCell.field, parsed);
        }
      }
    }
  };

  const handleUndo = async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, last]);
    await services.grades.upsertGradeCell(ctx, {
      studentId: last.studentId,
      studentName: last.studentName,
      classRoomId: classRoom.id,
      termNumber: last.termNumber,
      subjectKey: last.subjectKey,
      field: last.field,
      value: last.prevValue,
      actorId: user.id,
      actorName: user.displayName,
    });
    await loadWorkspaceData();
  };

  const handleRedo = async () => {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, last]);
    await services.grades.upsertGradeCell(ctx, {
      studentId: last.studentId,
      studentName: last.studentName,
      classRoomId: classRoom.id,
      termNumber: last.termNumber,
      subjectKey: last.subjectKey,
      field: last.field,
      value: last.nextValue,
      actorId: user.id,
      actorName: user.displayName,
    });
    await loadWorkspaceData();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'order' || key === 'lastName' || key === 'firstName');
    }
  };

  const getScoreColorClass = (score: number | null) => {
    if (score === null) return 'text-[var(--color-text)]';
    if (score < 10) return 'text-[var(--color-warning)] font-extrabold';
    if (score >= 15) return 'text-[var(--color-success)] font-extrabold';
    return 'text-[var(--color-text)] font-bold';
  };

  const renderAvgBadge = (res: TermAverageResult) => {
    if (res.status === 'incomplete') {
      return <span className="text-xs text-[var(--color-text-muted)]">{t.grades.incomplete}</span>;
    }
    if (res.status === 'exempt') {
      return <span className="text-xs text-[var(--color-text-muted)]">{t.grades.exempt}</span>;
    }
    return (
      <span className={`text-sm tabular-nums ${getScoreColorClass(res.value)}`}>
        {res.value?.toFixed(2)}
      </span>
    );
  };

  const handleExportExcel = () => {
    const headers =
      termTab === 'year'
        ? ['#', t.grades.lastName, t.grades.firstName, t.sections.term1, t.sections.term2, t.sections.term3, t.grades.annualAverage]
        : ['#', t.grades.lastName, t.grades.firstName, t.grades.continuous, t.grades.assignment, t.grades.exam, t.grades.average];

    const rows = visibleRows.map((r, idx) =>
      termTab === 'year'
        ? [
            idx + 1,
            r.student.lastName,
            r.student.firstName,
            r.t1Avg.value ?? t.grades.incomplete,
            r.t2Avg.value ?? t.grades.incomplete,
            r.t3Avg.value ?? t.grades.incomplete,
            r.avg.value ?? t.grades.incomplete,
          ]
        : [
            idx + 1,
            r.student.lastName,
            r.student.firstName,
            services.grades.formatCellDisplay(r.grade?.continuous) || '',
            services.grades.formatCellDisplay(r.grade?.assignment) || '',
            services.grades.formatCellDisplay(r.grade?.exam) || '',
            r.avg.value ?? t.grades.incomplete,
          ]
    );

    services.grades.exportGradesWorkbook({
      schoolName,
      className: classRoom.name,
      termLabel,
      subjectLabel,
      teacherName: user.displayName,
      headers,
      rows,
      fileName: `${classRoom.name}_${effectiveSubjectKey}_${termTab}.xlsx`,
    });
  };

  const handleShareSummary = async () => {
    const summaryText = `${schoolName}\n${classRoom.name} — ${subjectLabel} — ${termLabel}\n${t.grades.statsClassAvg}: ${stats.classAvg ?? '—'} | ${t.grades.statsPassRate}: ${stats.passRate}%`;
    if (navigator.share) {
      await navigator.share({ title: `${classRoom.name} ${termLabel}`, text: summaryText }).catch(() => {});
    }
  };

  const activeStudent = activeCell ? students.find((s) => s.id === activeCell.studentId) : null;

  return (
    <div className="space-y-3.5">
      {/* Subject & Term Selectors */}
      {visibleSubjects.length === 0 && (
        <div className="rounded-3xl bg-[var(--color-surface)] border-2 border-dashed border-[var(--color-border)] p-5 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-bold text-[var(--color-text-muted)]">
            {t.subjects.emptyNotice}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setEditSubjectTargetId(null);
                setShowSubjectModal(true);
              }}
              className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.subjects.goAddSubjects}</span>
            </button>
          )}
        </div>
      )}

      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Hide subject tabs if teacher has only 1 active subject; show compact manage chips */}
          {visibleSubjects.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {visibleSubjects.map((sub) => {
                const isSelected = effectiveSubjectKey === sub.id;
                return (
                  <div
                    key={sub.id}
                    className={`inline-flex items-center rounded-xl transition-colors ${
                      isSelected
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                        : 'bg-[var(--color-background)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onChangeSubject(sub.id)}
                      className="min-h-[40px] ps-3 pe-2 text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: isSelected ? '#ffffff' : sub.color }}
                      />
                      <DynamicIcon name={sub.icon} className="w-3.5 h-3.5 shrink-0" />
                      <span>{pickLocalized(sub.names)}</span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditSubjectTargetId(sub.id);
                          setShowSubjectModal(true);
                        }}
                        title={t.subjects.editSubject}
                        className={`min-h-[40px] px-2 flex items-center justify-center rounded-e-xl ${
                          isSelected
                            ? 'text-white/85 hover:text-white'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditSubjectTargetId(null);
                    setShowSubjectModal(true);
                  }}
                  title={t.subjects.addSubject}
                  className="min-h-[40px] px-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] text-xs font-extrabold text-[var(--color-primary)] inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.subjects.addShortcut}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {activeSubject && (
                <span className="min-h-[36px] px-3 rounded-xl bg-[var(--color-background)] text-xs font-extrabold inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: activeSubject.color }}
                  />
                  <span>{subjectLabel}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditSubjectTargetId(activeSubject.id);
                        setShowSubjectModal(true);
                      }}
                      title={t.subjects.editSubject}
                      className="ms-1 text-[var(--color-primary)]"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setEditSubjectTargetId(null);
                    setShowSubjectModal(true);
                  }}
                  title={t.subjects.addSubject}
                  className="min-h-[36px] px-2.5 rounded-xl border border-dashed border-[var(--color-border)] text-xs font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t.subjects.addShortcut}</span>
                </button>
              )}
            </div>
          )}

          {crossLinkButton && (
            <button
              type="button"
              onClick={crossLinkButton.onClick}
              className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold"
            >
              {crossLinkButton.label}
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[var(--color-background)]">
          {([
            { id: 1, label: t.sections.term1 },
            { id: 2, label: t.sections.term2 },
            { id: 3, label: t.sections.term3 },
            { id: 'year', label: t.grades.yearTab },
          ] as const).map((tb) => (
            <button
              key={String(tb.id)}
              type="button"
              onClick={() => onChangeTermTab(tb.id)}
              className={`min-h-[40px] rounded-xl text-xs font-bold transition-colors ${
                termTab === tb.id
                  ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)] tabular-nums">
          <span>
            {t.grades.formulaInUse}{' '}
            <strong className="text-[var(--color-text)]">
              ({t.grades.continuous}×{formula.continuousWeight} + {t.grades.assignment}×{formula.assignmentWeight} + {t.grades.exam}×{formula.examWeight}) ÷{' '}
              {formula.continuousWeight + formula.assignmentWeight + formula.examWeight} · /{formula.maxGrade}
            </strong>
          </span>
          <span>{t.grades.privacyNotice}</span>
        </div>
      </div>

      {/* Statistics Bar & Distribution Chart */}
      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          <div className="rounded-2xl bg-[var(--color-background)] p-2.5">
            <div className="text-[11px] text-[var(--color-text-muted)]">{t.grades.statsClassAvg}</div>
            <div className="text-base font-extrabold tabular-nums mt-0.5">
              {stats.classAvg !== null ? stats.classAvg.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--color-background)] p-2.5">
            <div className="text-[11px] text-[var(--color-text-muted)]">{t.grades.statsHighest}</div>
            <div className="text-base font-extrabold tabular-nums mt-0.5 text-[var(--color-success)]">
              {stats.highest !== null ? stats.highest.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--color-background)] p-2.5">
            <div className="text-[11px] text-[var(--color-text-muted)]">{t.grades.statsLowest}</div>
            <div className="text-base font-extrabold tabular-nums mt-0.5 text-[var(--color-warning)]">
              {stats.lowest !== null ? stats.lowest.toFixed(2) : '—'}
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--color-background)] p-2.5">
            <div className="text-[11px] text-[var(--color-text-muted)]">{t.grades.statsPassRate}</div>
            <div className="text-base font-extrabold tabular-nums mt-0.5">{stats.passRate}%</div>
          </div>
          <div className="rounded-2xl bg-[var(--color-background)] p-2.5 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-[var(--color-text-muted)]">{t.grades.statsGraded}</div>
            <div className="text-base font-extrabold tabular-nums mt-0.5">
              {stats.graded}/{stats.total}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-[var(--color-text-muted)]">{t.grades.distribution}</div>
          <div className="grid grid-cols-4 gap-2 items-end h-14">
            {(['0–5', '5–10', '10–15', '15–20'] as const).map((label, idx) => {
              const count = stats.buckets[idx];
              const pct = stats.graded > 0 ? Math.round((count / stats.graded) * 100) : 0;
              return (
                <div key={label} className="flex flex-col items-center gap-1 h-full justify-end">
                  <div className="w-full bg-[var(--color-background)] rounded-lg h-8 flex items-end overflow-hidden">
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${Math.max(count > 0 ? 18 : 0, pct)}%`,
                        backgroundColor:
                          idx < 2 ? 'var(--color-warning)' : idx === 3 ? 'var(--color-success)' : 'var(--color-primary)',
                      }}
                    />
                  </div>
                  <div className="text-[10px] font-bold tabular-nums text-[var(--color-text-muted)]">
                    {label} ({count})
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setShowAddStudent(true)}
                className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>{t.grades.addStudent}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowPasteModal(true)}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>{t.grades.pasteNames}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCopyRoster(true)}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>{t.grades.copyRoster}</span>
              </button>
              <input
                ref={updateExcelRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setImportBlob({ blob: f, name: f.name });
                  if (updateExcelRef.current) updateExcelRef.current.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => updateExcelRef.current?.click()}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>{t.grades.updateFromExcel}</span>
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canEdit && termTab !== 'year' && canAccessBehavior && behaviorSummaries.size > 0 && (
            <button
              type="button"
              onClick={() => setConfirmApplyAll(true)}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-extrabold inline-flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t.seating.applyToAll}</span>
            </button>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                title={t.grades.undo}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center disabled:opacity-35"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                title={t.grades.redo}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center disabled:opacity-35"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={async () => {
              const hist = await services.grades.listHistory(ctx.academicYearId, classRoom.id);
              setHistoryList(hist);
              setShowHistory(true);
            }}
            title={t.grades.historyTitle}
            className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>{t.grades.exportExcel}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowPrintSheet(true)}
            className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>{t.grades.printPdf}</span>
          </button>
          <button
            type="button"
            onClick={handleShareSummary}
            aria-label={t.common.share}
            className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search, Filter, Rank Toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.grades.searchStudent}
            className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ps-9 pe-3 text-xs"
          />
        </div>
        <select
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
          className="min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-semibold"
        >
          <option value="all">{t.grades.filterAll}</option>
          <option value="below10">{t.grades.filterBelow10}</option>
          <option value="above10">{t.grades.filterAbove10}</option>
          <option value="missing">{t.grades.filterMissing}</option>
        </select>
        <label className="min-h-[42px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showRank}
            onChange={(e) => setShowRank(e.target.checked)}
            className="accent-[var(--color-primary)]"
          />
          <span>{t.grades.showRank}</span>
        </label>
      </div>

      {/* Clear Mobile-Friendly Grades Table */}
      {students.length === 0 ? (
        <EmptyState title={t.grades.addStudent} />
      ) : (
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[62dvh]">
            <table className="w-full text-xs border-collapse tabular-nums">
              <thead className="sticky top-0 z-20 bg-[var(--color-primary-light)] text-[var(--color-text)] font-extrabold">
                <tr>
                  <th className="sticky start-0 z-30 bg-[var(--color-primary-light)] px-2.5 py-3 border-b border-e border-[var(--color-border)] text-center w-10">
                    <button type="button" onClick={() => toggleSort('order')} className="inline-flex items-center gap-0.5">
                      <span>#</span>
                    </button>
                  </th>
                  <th className="sticky start-10 z-30 bg-[var(--color-primary-light)] px-3 py-3 border-b border-e border-[var(--color-border)] text-start min-w-[100px]">
                    <button type="button" onClick={() => toggleSort('lastName')} className="inline-flex items-center gap-1">
                      <span>{t.grades.lastName}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                  <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-start min-w-[100px]">
                    <button type="button" onClick={() => toggleSort('firstName')} className="inline-flex items-center gap-1">
                      <span>{t.grades.firstName}</span>
                      <ArrowDownUp className="w-3 h-3 opacity-60" />
                    </button>
                  </th>

                  {termTab === 'year' ? (
                    <>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[85px]">{t.sections.term1}</th>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[85px]">{t.sections.term2}</th>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[85px]">{t.sections.term3}</th>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[95px]">
                        <button type="button" onClick={() => toggleSort('average')} className="inline-flex items-center gap-1">
                          <span>{t.grades.annualAverage}</span>
                          <ArrowDownUp className="w-3 h-3 opacity-60" />
                        </button>
                      </th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[92px]">
                        <button type="button" onClick={() => toggleSort('continuous')} className="inline-flex items-center gap-1">
                          <span>{t.grades.continuous}</span>
                        </button>
                      </th>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[88px]">
                        <button type="button" onClick={() => toggleSort('assignment')} className="inline-flex items-center gap-1">
                          <span>{t.grades.assignment}</span>
                        </button>
                      </th>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[88px]">
                        <button type="button" onClick={() => toggleSort('exam')} className="inline-flex items-center gap-1">
                          <span>{t.grades.exam}</span>
                        </button>
                      </th>
                      <th className="px-3 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[92px]">
                        <button type="button" onClick={() => toggleSort('average')} className="inline-flex items-center gap-1">
                          <span>{t.grades.average}</span>
                          <ArrowDownUp className="w-3 h-3 opacity-60" />
                        </button>
                      </th>
                    </>
                  )}

                  {showRank && (
                    <th className="px-2.5 py-3 border-b border-e border-[var(--color-border)] text-center min-w-[60px]">
                      {t.grades.rank}
                    </th>
                  )}
                  {canEdit && (
                    <th className="px-2 py-3 border-b border-[var(--color-border)] text-center w-20">
                      {t.common.actions}
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row, idx) => {
                  const zebraBg = idx % 2 === 1 ? 'bg-black/[0.025] dark:bg-white/[0.025]' : 'bg-[var(--color-surface)]';
                  const behaviorSum = behaviorSummaries.get(row.student.id);
                  const renderEditableCell = (field: GradeField) => {
                    const cell = row.grade?.[field];
                    const isFocused =
                      activeCell?.studentId === row.student.id && activeCell?.field === field;
                    const display = cell?.mark
                      ? markLabel(cell.mark, lang)
                      : cell?.score !== null && cell?.score !== undefined
                      ? String(cell.score)
                      : '';
                    const suggested =
                      field === 'continuous' && canAccessBehavior && behaviorSum
                        ? behaviorSum.suggestedGrade
                        : null;
                    const isSameAsSuggested =
                      suggested !== null &&
                      cell?.score !== null &&
                      cell?.score !== undefined &&
                      Math.abs(cell.score - suggested) < 0.01;
                    const diffFromSuggested =
                      suggested !== null &&
                      cell?.score !== null &&
                      cell?.score !== undefined &&
                      !isSameAsSuggested
                        ? Math.round((suggested - cell.score) * 100) / 100
                        : null;

                    return (
                      <td
                        className={`p-1 border-b border-e border-[var(--color-border)] text-center ${
                          isFocused ? 'ring-2 ring-inset ring-[var(--color-primary)] bg-[var(--color-primary-light)]/40' : ''
                        }`}
                      >
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => handleOpenCell(row.student.id, field)}
                          className={`w-full min-h-[44px] px-2 rounded-lg text-sm font-bold flex items-center justify-center ${
                            cell?.mark
                              ? 'text-[var(--color-primary)]'
                              : getScoreColorClass(cell?.score ?? null)
                          }`}
                        >
                          {display || <span className="opacity-25">—</span>}
                        </button>

                        {field === 'continuous' && suggested !== null && (
                          <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1 text-[10px] leading-tight">
                            <span className="text-[var(--color-text-muted)] tabular-nums">
                              {t.seating.suggestedFromSeating}: <strong>{suggested.toFixed(1)}</strong>
                              {diffFromSuggested !== null && (
                                <span className="ms-1 text-[var(--color-primary)]">
                                  ({diffFromSuggested > 0 ? `+${diffFromSuggested}` : diffFromSuggested})
                                </span>
                              )}
                            </span>
                            {canEdit &&
                              (isSameAsSuggested ? (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 font-bold">
                                  <Check className="w-3 h-3" />
                                  {t.seating.appliedBadge}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmApplyOne({ student: row.student, score: suggested })
                                  }
                                  className="px-1.5 py-0.5 rounded bg-[var(--color-primary-light)] text-[var(--color-primary)] font-extrabold"
                                >
                                  {t.seating.applySuggested}
                                </button>
                              ))}
                          </div>
                        )}
                      </td>
                    );
                  };

                  return (
                    <tr key={row.student.id} className={zebraBg}>
                      <td className={`sticky start-0 z-10 ${zebraBg} px-2.5 py-2 border-b border-e border-[var(--color-border)] text-center font-bold text-[var(--color-text-muted)]`}>
                        {idx + 1}
                      </td>
                      <td className={`sticky start-10 z-10 ${zebraBg} px-3 py-2 border-b border-e border-[var(--color-border)] font-bold text-[var(--color-text)] whitespace-nowrap`}>
                        {canAccessBehavior && termTab !== 'year' ? (
                          <button
                            type="button"
                            onClick={() => setEvalStudentTarget(row.student)}
                            className="text-start font-bold hover:text-[var(--color-primary)] underline decoration-dotted underline-offset-4"
                          >
                            {row.student.lastName}
                          </button>
                        ) : (
                          row.student.lastName
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-e border-[var(--color-border)] font-semibold text-[var(--color-text)] whitespace-nowrap">
                        {canAccessBehavior && termTab !== 'year' ? (
                          <button
                            type="button"
                            onClick={() => setEvalStudentTarget(row.student)}
                            className="text-start hover:text-[var(--color-primary)]"
                          >
                            {row.student.firstName}
                          </button>
                        ) : (
                          row.student.firstName
                        )}
                      </td>

                      {termTab === 'year' ? (
                        <>
                          <td className="px-3 py-2 border-b border-e border-[var(--color-border)] text-center">{renderAvgBadge(row.t1Avg)}</td>
                          <td className="px-3 py-2 border-b border-e border-[var(--color-border)] text-center">{renderAvgBadge(row.t2Avg)}</td>
                          <td className="px-3 py-2 border-b border-e border-[var(--color-border)] text-center">{renderAvgBadge(row.t3Avg)}</td>
                          <td className="px-3 py-2 border-b border-e border-[var(--color-border)] text-center">{renderAvgBadge(row.avg)}</td>
                        </>
                      ) : (
                        <>
                          {renderEditableCell('continuous')}
                          {renderEditableCell('assignment')}
                          {renderEditableCell('exam')}
                          <td className="px-3 py-2 border-b border-e border-[var(--color-border)] text-center">
                            {renderAvgBadge(row.avg)}
                          </td>
                        </>
                      )}

                      {showRank && (
                        <td className="px-2.5 py-2 border-b border-e border-[var(--color-border)] text-center font-bold">
                          {row.rank ?? '—'}
                        </td>
                      )}

                      {canEdit && (
                        <td className="px-1.5 py-1 border-b border-[var(--color-border)] text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => setEditStudent(row.student)}
                              className="min-h-[36px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteStudentTarget(row.student)}
                              className="min-h-[36px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile-Friendly Numeric Keypad */}
      {activeCell && activeStudent && (
        <div className="fixed bottom-16 inset-x-0 z-40 px-3 pb-2 pointer-events-none">
          <div className="mx-auto max-w-md rounded-3xl bg-[var(--color-surface)] border-2 border-[var(--color-primary)] shadow-2xl p-3.5 pointer-events-auto space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-extrabold truncate">
                  {activeStudent.lastName} {activeStudent.firstName}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)]">
                  {activeCell.field === 'continuous'
                    ? t.grades.continuous
                    : activeCell.field === 'assignment'
                    ? t.grades.assignment
                    : t.grades.exam}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={keypadBuffer}
                  onChange={async (e) => {
                    const v = e.target.value;
                    setKeypadBuffer(v);
                    const parsed = services.grades.parseGradeInput(v, formula.maxGrade);
                    if (parsed) {
                      setKeypadError('');
                      await commitCellValue(activeCell.studentId, activeCell.field, parsed);
                    } else if (v.trim() !== '') {
                      setKeypadError(`0 – ${formula.maxGrade}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      handleCommitBufferAndMoveNext(true);
                    }
                  }}
                  className="w-20 min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-center text-base font-extrabold tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setActiveCell(null)}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {keypadError && (
              <div className="text-[11px] font-bold text-red-600">{keypadError}</div>
            )}

            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={async () => {
                  await commitCellValue(activeCell.studentId, activeCell.field, { score: null, mark: 'absent' });
                  await handleCommitBufferAndMoveNext(true);
                }}
                className="min-h-[40px] rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-xs font-extrabold"
              >
                {t.grades.absent}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await commitCellValue(activeCell.studentId, activeCell.field, { score: null, mark: 'excused' });
                  await handleCommitBufferAndMoveNext(true);
                }}
                className="min-h-[40px] rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 text-xs font-extrabold"
              >
                {t.grades.excused}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await commitCellValue(activeCell.studentId, activeCell.field, { score: null, mark: 'not_graded' });
                  await handleCommitBufferAndMoveNext(true);
                }}
                className="min-h-[40px] rounded-xl bg-[var(--color-background)] text-xs font-bold"
              >
                {t.grades.notGraded}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setKeypadBuffer('');
                  await commitCellValue(activeCell.studentId, activeCell.field, { ...EMPTY_CELL });
                }}
                className="min-h-[40px] rounded-xl bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-bold"
              >
                {t.grades.clearCell}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 tabular-nums">
              {['7', '8', '9', 'DEL', '4', '5', '6', '.', '1', '2', '3', ',', '0', '00', 'NEXT'].map((k) => {
                if (k === 'DEL') {
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKeypadBuffer((b) => b.slice(0, -1))}
                      className="min-h-[44px] rounded-xl bg-[var(--color-background)] flex items-center justify-center font-bold"
                    >
                      <BackspaceIcon className="w-4 h-4" />
                    </button>
                  );
                }
                if (k === 'NEXT') {
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => handleCommitBufferAndMoveNext(true)}
                      className="col-span-2 min-h-[44px] rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold"
                    >
                      {t.grades.nextStudent}
                    </button>
                  );
                }
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeypadChar(k)}
                    className="min-h-[44px] rounded-xl bg-[var(--color-background)] hover:bg-black/5 dark:hover:bg-white/5 text-base font-extrabold"
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showAddStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newLastName.trim()) return;
              await services.students.addStudent(ctx, classRoom.id, {
                lastName: newLastName,
                firstName: newFirstName,
              });
              setNewLastName('');
              setNewFirstName('');
              setShowAddStudent(false);
              await loadWorkspaceData();
              onDataChanged?.();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3"
          >
            <h3 className="text-sm font-extrabold">{t.grades.addStudent}</h3>
            <input
              type="text"
              required
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              placeholder={t.grades.lastName}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <input
              type="text"
              required
              value={newFirstName}
              onChange={(e) => setNewFirstName(e.target.value)}
              placeholder={t.grades.firstName}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowAddStudent(false)} className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold">
                {t.common.cancel}
              </button>
              <button type="submit" className="min-h-[40px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold">
                {t.common.add}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Student Modal */}
      {editStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await services.students.updateStudent(editStudent.id, {
                lastName: editStudent.lastName,
                firstName: editStudent.firstName,
              });
              setEditStudent(null);
              await loadWorkspaceData();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3"
          >
            <h3 className="text-sm font-extrabold">{t.common.edit}</h3>
            <input
              type="text"
              required
              value={editStudent.lastName}
              onChange={(e) => setEditStudent({ ...editStudent, lastName: e.target.value })}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <input
              type="text"
              required
              value={editStudent.firstName}
              onChange={(e) => setEditStudent({ ...editStudent, firstName: e.target.value })}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditStudent(null)} className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold">
                {t.common.cancel}
              </button>
              <button type="submit" className="min-h-[40px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold">
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Paste Names Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await services.students.pasteNames(ctx, classRoom.id, pasteText);
              setPasteText('');
              setShowPasteModal(false);
              await loadWorkspaceData();
              onDataChanged?.();
            }}
            className="w-full max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3"
          >
            <h3 className="text-sm font-extrabold">{t.grades.pasteNames}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{t.grades.pasteHint}</p>
            <textarea
              rows={7}
              required
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowPasteModal(false)} className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold">
                {t.common.cancel}
              </button>
              <button type="submit" className="min-h-[40px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold">
                {t.common.add}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Copy Roster Modal */}
      {showCopyRoster && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3">
            <h3 className="text-sm font-extrabold">{t.grades.copyRoster}</h3>
            <select
              value={copySourceId}
              onChange={(e) => setCopySourceId(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
            >
              <option value="">{t.grades.selectSourceClass}</option>
              {allClasses
                .filter((c) => c.id !== classRoom.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCopyRoster(false)} className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold">
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!copySourceId}
                onClick={async () => {
                  await services.students.copyRosterFromClass(ctx, copySourceId, classRoom.id);
                  setShowCopyRoster(false);
                  await loadWorkspaceData();
                  onDataChanged?.();
                }}
                className="min-h-[40px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold disabled:opacity-40"
              >
                {t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg max-h-[80dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
            <header className="px-5 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-sm font-extrabold">{t.grades.historyTitle}</h3>
              <button type="button" onClick={() => setShowHistory(false)} className="min-h-[38px] min-w-[38px] flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {historyList.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-6">{t.grades.noHistory}</p>
              ) : (
                historyList.map((h) => (
                  <div key={h.id} className="rounded-2xl border border-[var(--color-border)] p-3 text-xs space-y-1">
                    <div className="font-bold">
                      {h.studentName} · {h.field} (T{h.termNumber})
                    </div>
                    <div className="text-[var(--color-text-muted)] tabular-nums">
                      {h.oldValue} → <strong className="text-[var(--color-primary)]">{h.newValue}</strong> · {h.changedByName} · {h.createdAt.slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable / Save as PDF Sheet */}
      {showPrintSheet && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-6">
          <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col rounded-3xl bg-white text-slate-900 overflow-hidden shadow-2xl">
            <div className="no-print px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
              <span className="text-xs font-bold">{t.grades.printPdf}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>{t.grades.printPdf}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintSheet(false)}
                  className="min-h-[40px] px-3 rounded-xl border border-slate-300 text-xs font-bold"
                >
                  {t.common.close}
                </button>
              </div>
            </div>

            <div id="printable-grades-sheet" className="flex-1 overflow-auto p-6 space-y-4">
              <div className="border-b-2 border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold">{schoolName}</h2>
                  <p className="text-xs text-slate-600">
                    {user.displayName} · {subjectLabel}
                  </p>
                </div>
                <div className="text-end">
                  <div className="text-sm font-extrabold">{classRoom.name} · {termLabel}</div>
                  <div className="text-xs text-slate-600 tabular-nums">{new Date().toISOString().slice(0, 10)}</div>
                </div>
              </div>

              <table className="w-full text-xs border-collapse border border-slate-400 tabular-nums">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-400 p-2">#</th>
                    <th className="border border-slate-400 p-2 text-start">{t.grades.lastName}</th>
                    <th className="border border-slate-400 p-2 text-start">{t.grades.firstName}</th>
                    <th className="border border-slate-400 p-2">{termTab === 'year' ? t.sections.term1 : t.grades.continuous}</th>
                    <th className="border border-slate-400 p-2">{termTab === 'year' ? t.sections.term2 : t.grades.assignment}</th>
                    <th className="border border-slate-400 p-2">{termTab === 'year' ? t.sections.term3 : t.grades.exam}</th>
                    <th className="border border-slate-400 p-2">{termTab === 'year' ? t.grades.annualAverage : t.grades.average}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r, idx) => (
                    <tr key={r.student.id}>
                      <td className="border border-slate-300 p-1.5 text-center">{idx + 1}</td>
                      <td className="border border-slate-300 p-1.5 font-semibold">{r.student.lastName}</td>
                      <td className="border border-slate-300 p-1.5">{r.student.firstName}</td>
                      {termTab === 'year' ? (
                        <>
                          <td className="border border-slate-300 p-1.5 text-center">{r.t1Avg.value?.toFixed(2) ?? '—'}</td>
                          <td className="border border-slate-300 p-1.5 text-center">{r.t2Avg.value?.toFixed(2) ?? '—'}</td>
                          <td className="border border-slate-300 p-1.5 text-center">{r.t3Avg.value?.toFixed(2) ?? '—'}</td>
                          <td className="border border-slate-300 p-1.5 text-center font-bold">{r.avg.value?.toFixed(2) ?? '—'}</td>
                        </>
                      ) : (
                        <>
                          <td className="border border-slate-300 p-1.5 text-center">{services.grades.formatCellDisplay(r.grade?.continuous) || '—'}</td>
                          <td className="border border-slate-300 p-1.5 text-center">{services.grades.formatCellDisplay(r.grade?.assignment) || '—'}</td>
                          <td className="border border-slate-300 p-1.5 text-center">{services.grades.formatCellDisplay(r.grade?.exam) || '—'}</td>
                          <td className="border border-slate-300 p-1.5 text-center font-bold">{r.avg.value?.toFixed(2) ?? t.grades.incomplete}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-xs flex flex-wrap gap-4 pt-2 border-t border-slate-300 tabular-nums">
                <span><strong>{t.grades.statsClassAvg}:</strong> {stats.classAvg?.toFixed(2) ?? '—'}</span>
                <span><strong>{t.grades.statsHighest}:</strong> {stats.highest?.toFixed(2) ?? '—'}</span>
                <span><strong>{t.grades.statsLowest}:</strong> {stats.lowest?.toFixed(2) ?? '—'}</span>
                <span><strong>{t.grades.statsPassRate}:</strong> {stats.passRate}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteStudentTarget)}
        title={t.common.delete}
        message={`${t.common.delete}: ${deleteStudentTarget?.lastName ?? ''} ${deleteStudentTarget?.firstName ?? ''}?`}
        onConfirm={async () => {
          if (!deleteStudentTarget) return;
          await services.students.deleteStudent(deleteStudentTarget.id, ctx.academicYearId);
          setDeleteStudentTarget(null);
          await loadWorkspaceData();
          onDataChanged?.();
        }}
        onCancel={() => setDeleteStudentTarget(null)}
      />

      {importBlob && (
        <ExcelImportWizardModal
          open={Boolean(importBlob)}
          blob={importBlob.blob}
          fileName={importBlob.name}
          ctx={ctx}
          user={user}
          classRoom={classRoom}
          termNumber={termTab === 'year' ? 1 : termTab}
          subjectKey={effectiveSubjectKey}
          maxGrade={formula.maxGrade}
          initialMode="update_only"
          onClose={() => setImportBlob(null)}
          onImported={async () => {
            await loadWorkspaceData();
            onDataChanged?.();
          }}
        />
      )}

      <SubjectManagerModal
        open={showSubjectModal}
        ctx={ctx}
        initialEditSubjectId={editSubjectTargetId}
        onClose={() => {
          setShowSubjectModal(false);
          setEditSubjectTargetId(null);
        }}
        onChanged={async () => {
          if (onSubjectsChanged) await onSubjectsChanged();
          await loadWorkspaceData();
        }}
      />

      {/* Per-student Apply Suggested Continuous Assessment Confirmation */}
      <ConfirmDialog
        open={Boolean(confirmApplyOne)}
        title={t.seating.applySuggested}
        message={`${t.seating.applyOneConfirm} (${confirmApplyOne?.student.lastName ?? ''} ${confirmApplyOne?.student.firstName ?? ''}: ${confirmApplyOne?.score ?? 0})`}
        onConfirm={async () => {
          if (!confirmApplyOne || termTab === 'year') return;
          await commitCellValue(confirmApplyOne.student.id, 'continuous', {
            score: Math.min(formula.maxGrade, Math.max(0, confirmApplyOne.score)),
            mark: null,
          });
          setConfirmApplyOne(null);
        }}
        onCancel={() => setConfirmApplyOne(null)}
      />

      {/* Bulk Apply Suggested Continuous Assessment to All Students Confirmation */}
      <ConfirmDialog
        open={confirmApplyAll}
        title={t.seating.applyToAll}
        message={`${t.seating.applyToAllConfirm} (${students.length})`}
        onConfirm={async () => {
          if (termTab === 'year') return;
          for (const st of students) {
            const sum = behaviorSummaries.get(st.id);
            if (!sum) continue;
            await services.grades.upsertGradeCell(ctx, {
              studentId: st.id,
              studentName: `${st.lastName} ${st.firstName}`.trim(),
              classRoomId: classRoom.id,
              termNumber: termTab,
              subjectKey: effectiveSubjectKey,
              field: 'continuous',
              value: {
                score: Math.min(formula.maxGrade, Math.max(0, sum.suggestedGrade)),
                mark: null,
              },
              actorId: user.id,
              actorName: user.displayName,
            });
          }
          setConfirmApplyAll(false);
          await loadWorkspaceData();
          onDataChanged?.();
        }}
        onCancel={() => setConfirmApplyAll(false)}
      />

      {/* Evaluation & History Sheet opened from student name click in Grading Notebook */}
      {behaviorConfig && evalStudentTarget && termTab !== 'year' && (
        <EvaluationBottomSheet
          open={Boolean(evalStudentTarget)}
          ctx={ctx}
          classRoomId={classRoom.id}
          termNumber={termTab}
          subjectKey={effectiveSubjectKey}
          subjectLabel={subjectLabel}
          students={students}
          targetStudents={[evalStudentTarget]}
          criteria={behaviorCriteria}
          config={behaviorConfig}
          summaries={behaviorSummaries}
          onClose={() => setEvalStudentTarget(null)}
          onChanged={async () => {
            await loadWorkspaceData();
            onDataChanged?.();
          }}
        />
      )}
    </div>
  );
};
