import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckSquare,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FolderKanban,
  Grid,
  Lock,
  Maximize2,
  Minimize2,
  Palette,
  Plus,
  Printer,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { StudentBehaviorSummary } from '@/src/services/BehaviorService';
import type {
  BehaviorConfigRecord,
  BehaviorCriterionRecord,
  BehaviorEventRecord,
  ClassRoomRecord,
  DeskSlot,
  GradeSubjectKey,
  SeatingPlanRecord,
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { AutoFillModal } from './AutoFillModal';
import { EvaluationBottomSheet } from './EvaluationBottomSheet';
import { LayoutEditorModal } from './LayoutEditorModal';
import { SeatingCanvas } from './SeatingCanvas';
import { exportSeatingPlanPng, printSeatingPlanHtml } from './SeatingPrintExport';

interface SeatingChartWorkspaceProps {
  ctx: ServiceContext;
  user: UserRecord;
  schoolName: string;
  classRoom: ClassRoomRecord;
  subjects: SubjectRecord[];
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  isArchiveYear: boolean;
  onChangeTerm?: (t: 1 | 2 | 3) => void;
  onChangeSubject?: (s: GradeSubjectKey) => void;
  onChanged?: () => void;
}

export const SeatingChartWorkspace: React.FC<SeatingChartWorkspaceProps> = ({
  ctx,
  user,
  schoolName,
  classRoom,
  subjects,
  termNumber,
  subjectKey,
  isArchiveYear,
  onChangeTerm,
  onChangeSubject,
  onChanged,
}) => {
  const { t, dir, pickLocalized } = useI18n();

  const canAccess =
    services.seating.canAccessSeating(user, classRoom) &&
    services.behavior.canAccessBehavior(user, classRoom);

  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [plans, setPlans] = useState<SeatingPlanRecord[]>([]);
  const [activePlan, setActivePlan] = useState<SeatingPlanRecord | null>(null);
  const [criteria, setCriteria] = useState<BehaviorCriterionRecord[]>([]);
  const [behaviorConfig, setBehaviorConfig] = useState<BehaviorConfigRecord | null>(null);
  const [events, setEvents] = useState<BehaviorEventRecord[]>([]);

  // Workspace UX states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [batchSelectMode, setBatchSelectMode] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [selectedSeatForMove, setSelectedSeatForMove] = useState<{
    deskId: string;
    seatIndex: number;
  } | null>(null);
  const [pendingUnseatedStudentId, setPendingUnseatedStudentId] = useState<string | null>(null);

  const [undoStack, setUndoStack] = useState<SeatingPlanRecord[]>([]);
  const [redoStack, setRedoStack] = useState<SeatingPlanRecord[]>([]);

  // Modals & sheets
  const [showUnseatedSheet, setShowUnseatedSheet] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [renamePlanTarget, setRenamePlanTarget] = useState<SeatingPlanRecord | null>(null);
  const [deletePlanTarget, setDeletePlanTarget] = useState<SeatingPlanRecord | null>(null);
  const [evalTargetStudents, setEvalTargetStudents] = useState<StudentRecord[] | null>(null);

  const effectiveSubjectKey = useMemo(() => {
    if (subjects.some((s) => s.id === subjectKey)) return subjectKey;
    return subjects[0]?.id || '';
  }, [subjects, subjectKey]);

  const activeSubject = subjects.find((s) => s.id === effectiveSubjectKey) || null;
  const subjectLabel = activeSubject ? pickLocalized(activeSubject.names) : '—';
  const termLabel =
    termNumber === 1 ? t.sections.term1 : termNumber === 2 ? t.sections.term2 : t.sections.term3;

  const loadWorkspace = async () => {
    if (!canAccess) return;
    const [stList, critList, bCfg, evList] = await Promise.all([
      services.students.listByClass(ctx.academicYearId, classRoom.id),
      services.behavior.listCriteria(ctx, true),
      services.behavior.getConfig(ctx),
      services.behavior.listEventsForClass(
        ctx.academicYearId,
        classRoom.id,
        termNumber,
        effectiveSubjectKey
      ),
    ]);
    let planList = await services.seating.listPlans(ctx.academicYearId, classRoom.id);
    if (planList.length === 0) {
      await services.seating.getOrCreateActivePlan(
        ctx,
        classRoom.id,
        stList.length,
        t.seating.defaultPlanName,
        termNumber,
        effectiveSubjectKey
      );
      planList = await services.seating.listPlans(ctx.academicYearId, classRoom.id);
    }
    const currentActive = planList.find((p) => p.isActive) || planList[0] || null;

    setStudents(stList);
    setCriteria(critList);
    setBehaviorConfig(bCfg);
    setEvents(evList);
    setPlans(planList);
    setActivePlan(currentActive);
  };

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setSelectedSeatForMove(null);
    setPendingUnseatedStudentId(null);
    loadWorkspace();
  }, [ctx.academicYearId, classRoom.id, termNumber, effectiveSubjectKey, canAccess]);

  const reconciled = useMemo(() => {
    if (!activePlan) return null;
    return services.seating.reconcilePlanWithRoster(activePlan, students);
  }, [activePlan, students]);

  // Persist ghost student cleanup automatically if any deleted students remained in seat slots
  useEffect(() => {
    if (activePlan && reconciled && reconciled.removedGhostCount > 0) {
      services.seating
        .savePlan({ ...activePlan, desks: reconciled.desks })
        .then(setActivePlan)
        .catch(() => {});
    }
  }, [activePlan, reconciled]);

  const summaries: Map<string, StudentBehaviorSummary> = useMemo(() => {
    return services.behavior.computeClassSummaries({
      students,
      criteria,
      events,
      config: behaviorConfig,
      classRoomId: classRoom.id,
      termNumber,
      subjectKey: effectiveSubjectKey,
    });
  }, [students, criteria, events, behaviorConfig, classRoom.id, termNumber, effectiveSubjectKey]);

  if (!canAccess) {
    return (
      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-[var(--color-text-muted)] mx-auto" />
        <p className="text-sm font-bold text-[var(--color-text)]">{t.seating.studentNoAccess}</p>
      </div>
    );
  }

  if (!activePlan || !reconciled || !behaviorConfig) {
    return (
      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center text-xs text-[var(--color-text-muted)]">
        {t.common.loading}
      </div>
    );
  }

  const displayPlan: SeatingPlanRecord = {
    ...activePlan,
    desks: reconciled.desks,
  };

  const commitPlanMutation = async (nextPlan: SeatingPlanRecord) => {
    setUndoStack((prev) => [...prev.slice(-24), displayPlan]);
    setRedoStack([]);
    setActivePlan(nextPlan);
    const saved = await services.seating.savePlan(nextPlan);
    setActivePlan(saved);
    setPlans((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    onChanged?.();
  };

  const handleUndo = async () => {
    const prevSnapshot = undoStack[undoStack.length - 1];
    if (!prevSnapshot) return;
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [...s, displayPlan]);
    const saved = await services.seating.savePlan(prevSnapshot);
    setActivePlan(saved);
  };

  const handleRedo = async () => {
    const nextSnapshot = redoStack[redoStack.length - 1];
    if (!nextSnapshot) return;
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [...s, displayPlan]);
    const saved = await services.seating.savePlan(nextSnapshot);
    setActivePlan(saved);
  };

  const handleSeatClick = async (
    desk: DeskSlot,
    seatIndex: number,
    studentId: string | null
  ) => {
    if (isArchiveYear) {
      if (studentId) {
        const st = students.find((s) => s.id === studentId);
        if (st) setEvalTargetStudents([st]);
      }
      return;
    }

    // 1. Pending unseated placement takes priority
    if (pendingUnseatedStudentId) {
      const next = services.seating.assignStudentToSeat(
        displayPlan,
        desk.id,
        seatIndex,
        pendingUnseatedStudentId
      );
      await commitPlanMutation(next);
      setPendingUnseatedStudentId(null);
      return;
    }

    // 2. Edit mode: tap-to-move / swap
    if (editMode) {
      if (!selectedSeatForMove) {
        if (!studentId) return; // Tap occupied seat first (or use unseated tray for empty)
        setSelectedSeatForMove({ deskId: desk.id, seatIndex });
        return;
      }
      if (
        selectedSeatForMove.deskId === desk.id &&
        selectedSeatForMove.seatIndex === seatIndex
      ) {
        setSelectedSeatForMove(null);
        return;
      }
      const next = services.seating.swapOrMoveSeats(
        displayPlan,
        selectedSeatForMove,
        { deskId: desk.id, seatIndex }
      );
      setSelectedSeatForMove(null);
      await commitPlanMutation(next);
      return;
    }

    // 3. Batch select mode ("Evaluate some")
    if (batchSelectMode) {
      if (!studentId) return;
      setSelectedBatchIds((prev) => {
        const next = new Set(prev);
        if (next.has(studentId)) next.delete(studentId);
        else next.add(studentId);
        return next;
      });
      return;
    }

    // 4. Normal mode: tap student to evaluate
    if (studentId) {
      const st = students.find((s) => s.id === studentId);
      if (st) setEvalTargetStudents([st]);
    } else {
      // Tap empty seat in normal mode -> open unseated drawer quickly
      setShowUnseatedSheet(true);
    }
  };

  const handleBoardToggleOrientation = async () => {
    const nextOrientation =
      displayPlan.viewOrientation === 'teacher_desk' ? 'back_of_class' : 'teacher_desk';
    await commitPlanMutation({ ...displayPlan, viewOrientation: nextOrientation });
  };

  const toggleColorFeedback = async () => {
    const saved = await services.behavior.saveConfig({
      ...behaviorConfig,
      showColorFeedback: !behaviorConfig.showColorFeedback,
    });
    setBehaviorConfig(saved);
  };

  const toggleHideNames = async () => {
    const saved = await services.behavior.saveConfig({
      ...behaviorConfig,
      hideNamesMode: !behaviorConfig.hideNamesMode,
    });
    setBehaviorConfig(saved);
  };

  const colorFeedback = Boolean(behaviorConfig.showColorFeedback);
  const hideNamesMode = Boolean(behaviorConfig.hideNamesMode);
  const pendingStudent = pendingUnseatedStudentId
    ? students.find((s) => s.id === pendingUnseatedStudentId)
    : null;

  const selectedSourceStudentId = selectedSeatForMove
    ? displayPlan.desks.find((d) => d.id === selectedSeatForMove.deskId)?.studentIds[
        selectedSeatForMove.seatIndex
      ] ?? null
    : null;

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[var(--color-background)]'
    : 'rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 sm:p-4 flex flex-col gap-3 min-h-[72dvh]';

  return (
    <div className={containerClass}>
      {/* Top Bar — Non-truncated 2-line safe title + Manage Seating + Undo/Redo + Fullscreen */}
      <header
        className={`flex flex-wrap items-center justify-between gap-2 ${
          isFullscreen
            ? 'px-3.5 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-border)]'
            : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-extrabold text-[var(--color-text)] leading-snug">
            {t.seating.title} · {classRoom.name}
          </div>
          <div className="text-[11px] font-semibold text-[var(--color-text-muted)] leading-tight">
            {displayPlan.name} · {subjectLabel} · {termLabel}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isArchiveYear && editMode && (
            <>
              <button
                type="button"
                disabled={undoStack.length === 0}
                onClick={handleUndo}
                title={t.grades.undo}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-center disabled:opacity-35"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                title={t.grades.redo}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-center disabled:opacity-35"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </>
          )}

          {!isArchiveYear && (
            <button
              type="button"
              onClick={() => {
                setBatchSelectMode(false);
                setSelectedBatchIds(new Set());
                setSelectedSeatForMove(null);
                setPendingUnseatedStudentId(null);
                setEditMode((v) => !v);
              }}
              className={`min-h-[40px] px-3 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 ${
                editMode
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              }`}
            >
              {editMode ? <Check className="w-4 h-4" /> : <ArrowLeftRight className="w-4 h-4" />}
              <span>{editMode ? t.seating.finishEditing : t.seating.manageSeating}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={t.seating.openFullscreen}
            className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-center"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content Wrapper */}
      <div
        className={`flex-1 min-h-0 flex flex-col gap-2.5 ${
          isFullscreen ? 'px-3 pt-2 overflow-hidden' : ''
        }`}
      >
        {/* Term & Subject mini-switcher + Plan picker & Utilities */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {onChangeTerm && (
              <div className="inline-flex rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] p-0.5">
                {([1, 2, 3] as const).map((tm) => (
                  <button
                    key={tm}
                    type="button"
                    onClick={() => onChangeTerm(tm)}
                    className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-bold ${
                      termNumber === tm
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                        : 'text-[var(--color-text-muted)]'
                    }`}
                  >
                    T{tm}
                  </button>
                ))}
              </div>
            )}

            {subjects.length > 1 && onChangeSubject && (
              <select
                value={effectiveSubjectKey}
                onChange={(e) => onChangeSubject(e.target.value)}
                className="min-h-[34px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-[11px] font-bold"
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {pickLocalized(sub.names)}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setShowPlansModal(true)}
              className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-bold inline-flex items-center gap-1"
            >
              <FolderKanban className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>
                {t.seating.plansTitle} ({plans.length})
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleBoardToggleOrientation}
              className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-bold inline-flex items-center gap-1"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>
                {displayPlan.viewOrientation === 'teacher_desk'
                  ? t.seating.viewFromTeacher
                  : t.seating.viewFromBack}
              </span>
            </button>

            <button
              type="button"
              onClick={toggleColorFeedback}
              title={t.seating.colorFeedback}
              className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 ${
                colorFeedback
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-muted)]'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.seating.colorFeedback}</span>
            </button>

            <button
              type="button"
              onClick={toggleHideNames}
              title={t.seating.hideNamesMode}
              className={`min-h-[34px] px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 ${
                hideNamesMode
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text-muted)]'
              }`}
            >
              {hideNamesMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>

            {!isArchiveYear && (
              <>
                <button
                  type="button"
                  onClick={() => setShowLayoutEditor(true)}
                  title={t.seating.layoutEditor}
                  className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <Grid className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="hidden sm:inline">{t.seating.layoutEditor}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAutoFill(true)}
                  title={t.seating.autoFill}
                  className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  <span className="hidden sm:inline">{t.seating.autoFill}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() =>
                exportSeatingPlanPng({
                  plan: displayPlan,
                  students,
                  schoolName,
                  className: classRoom.name,
                  subjectName: subjectLabel,
                  termLabel,
                  hideNames: hideNamesMode,
                  isRtl: dir === 'rtl',
                  frontLabel: t.seating.frontMarker,
                  boardLabel: t.seating.boardShort,
                  emptyLabel: t.seating.emptySeat,
                  summaries,
                  showScores: colorFeedback,
                })
              }
              title={t.seating.exportPng}
              className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-bold inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() =>
                printSeatingPlanHtml({
                  plan: displayPlan,
                  students,
                  schoolName,
                  className: classRoom.name,
                  subjectName: subjectLabel,
                  termLabel,
                  hideNames: hideNamesMode,
                  isRtl: dir === 'rtl',
                  frontLabel: t.seating.frontMarker,
                  boardLabel: t.seating.boardShort,
                  emptyLabel: t.seating.emptySeat,
                })
              }
              title={t.seating.printPdf}
              className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-bold inline-flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Unboxed Single-Line Stats Strip (zero pill clutter) */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] font-bold text-[var(--color-text-muted)] tabular-nums px-1">
          <span>
            {students.length} {t.seating.totalStudentsLabel} · {reconciled.seatedCount}{' '}
            {t.seating.seatedLabel} · {reconciled.unseatedStudents.length} {t.seating.unseatedLabel}{' '}
            · {reconciled.totalSeats} {t.seating.seatsAvailableLabel}
          </span>

          {reconciled.unseatedStudents.length > 0 && (
            <button
              type="button"
              onClick={() => setShowUnseatedSheet(true)}
              className="text-[var(--color-primary)] font-extrabold underline"
            >
              {t.seating.unseatedDrawer} ({reconciled.unseatedStudents.length})
            </button>
          )}
        </div>

        {/* Shortage Warning */}
        {reconciled.totalSeats < students.length && (
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 px-3 py-2 text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{t.seating.seatsShortageWarning}</span>
          </div>
        )}

        {/* Context Banners (Edit Mode / Pending Unseated Placement / Batch Selection) */}
        {editMode && (
          <div className="rounded-2xl bg-[var(--color-primary-light)]/75 border border-[var(--color-primary)]/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--color-primary)]">
            <span>{t.seating.editInstructionBanner}</span>
            {selectedSourceStudentId && selectedSeatForMove && (
              <button
                type="button"
                onClick={async () => {
                  const next = services.seating.assignStudentToSeat(
                    displayPlan,
                    selectedSeatForMove.deskId,
                    selectedSeatForMove.seatIndex,
                    null
                  );
                  setSelectedSeatForMove(null);
                  await commitPlanMutation(next);
                }}
                className="min-h-[32px] px-2.5 rounded-xl bg-rose-600 text-white text-[11px] font-extrabold inline-flex items-center gap-1"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>{t.seating.removeFromSeat}</span>
              </button>
            )}
          </div>
        )}

        {pendingStudent && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 px-3 py-2 flex items-center justify-between gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
            <span>
              {t.seating.tapSeatToPlace}: <strong>{pendingStudent.lastName} {pendingStudent.firstName}</strong>
            </span>
            <button
              type="button"
              onClick={() => setPendingUnseatedStudentId(null)}
              className="p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {batchSelectMode && (
          <div className="rounded-2xl bg-[var(--color-primary-light)] border border-[var(--color-primary)] px-3 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[var(--color-primary)]">
            <span>
              {t.seating.pickStudentsFirst} ({selectedBatchIds.size})
            </span>
            <button
              type="button"
              onClick={() => {
                setBatchSelectMode(false);
                setSelectedBatchIds(new Set());
              }}
              className="text-xs underline"
            >
              {t.common.cancel}
            </button>
          </div>
        )}

        {/* Auto-scaling Seating Grid Canvas */}
        <SeatingCanvas
          plan={displayPlan}
          students={students}
          summaries={summaries}
          editMode={editMode}
          batchSelectMode={batchSelectMode}
          selectedBatchIds={selectedBatchIds}
          selectedSeatForMove={selectedSeatForMove}
          pendingUnseatedStudentId={pendingUnseatedStudentId}
          colorFeedback={colorFeedback}
          hideNamesMode={hideNamesMode}
          onSeatClick={handleSeatClick}
          onSwapSeats={async (from, to) => {
            const next = services.seating.swapOrMoveSeats(displayPlan, from, to);
            setSelectedSeatForMove(null);
            await commitPlanMutation(next);
          }}
          onBoardClick={handleBoardToggleOrientation}
        />
      </div>

      {/* Bottom Action Bar — Clears Android Nav Bar & BottomNav cleanly */}
      <div
        className={
          isFullscreen
            ? 'px-3 pt-2.5 pb-[max(0.85rem,env(safe-area-inset-bottom))] bg-[var(--color-surface)] border-t border-[var(--color-border)] flex items-center gap-2'
            : 'pt-1 flex flex-wrap items-center gap-2'
        }
      >
        {batchSelectMode ? (
          <button
            type="button"
            disabled={selectedBatchIds.size === 0}
            onClick={() => {
              const picked = students.filter((s) => selectedBatchIds.has(s.id));
              if (picked.length > 0) setEvalTargetStudents(picked);
            }}
            className="flex-1 min-h-[48px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-45"
          >
            <CheckSquare className="w-4 h-4" />
            <span>
              {t.seating.doneSelecting} ({selectedBatchIds.size})
            </span>
          </button>
        ) : (
          <>
            {!isArchiveYear && (
              <button
                type="button"
                disabled={students.length === 0}
                onClick={() => setEvalTargetStudents(students)}
                className="flex-1 min-h-[48px] px-3 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="truncate">{t.seating.evaluateAll}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleBoardToggleOrientation}
              className="flex-1 min-h-[48px] px-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
            >
              <ArrowLeftRight className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span className="truncate">{t.seating.boardShort}</span>
            </button>

            {!isArchiveYear && (
              <button
                type="button"
                disabled={students.length === 0}
                onClick={() => {
                  setEditMode(false);
                  setBatchSelectMode(true);
                  setSelectedBatchIds(new Set());
                }}
                className="flex-1 min-h-[48px] px-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <CheckSquare className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                <span className="truncate">{t.seating.evaluateSome}</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Unseated Students Bottom Sheet */}
      {showUnseatedSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowUnseatedSheet(false);
          }}
        >
          <div className="w-full sm:max-w-md max-h-[75dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <header className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <span className="text-sm font-extrabold">
                {t.seating.unseatedDrawer} ({reconciled.unseatedStudents.length})
              </span>
              <button
                type="button"
                onClick={() => setShowUnseatedSheet(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {reconciled.unseatedStudents.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-6">
                  {t.seating.allSeated}
                </p>
              ) : (
                reconciled.unseatedStudents.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setPendingUnseatedStudentId(st.id);
                      setShowUnseatedSheet(false);
                    }}
                    className="w-full min-h-[46px] px-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] flex items-center justify-between text-xs font-extrabold hover:border-[var(--color-primary)]"
                  >
                    <span>
                      {st.lastName} {st.firstName}
                    </span>
                    <span className="text-[var(--color-primary)]">{t.seating.tapToSeatHint}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Plans Management Modal (Create, Duplicate, Rename, Set Active, Delete, History) */}
      {showPlansModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPlansModal(false);
          }}
        >
          <div className="w-full sm:max-w-lg max-h-[82dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden pb-[env(safe-area-inset-bottom)]">
            <header className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
              <span className="text-sm font-extrabold">{t.seating.plansTitle}</span>
              <button
                type="button"
                onClick={() => setShowPlansModal(false)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {!isArchiveYear && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newPlanName.trim()) return;
                    await services.seating.createPlan(ctx, {
                      classRoomId: classRoom.id,
                      name: newPlanName,
                      rows: displayPlan.rows,
                      cols: displayPlan.cols,
                      defaultSeatsPerDesk: displayPlan.defaultSeatsPerDesk,
                      termNumber,
                      subjectId: effectiveSubjectKey,
                      setActive: true,
                    });
                    setNewPlanName('');
                    await loadWorkspace();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    placeholder={t.seating.planName}
                    className="flex-1 min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                  />
                  <button
                    type="submit"
                    className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t.seating.newPlan}</span>
                  </button>
                </form>
              )}

              <div className="space-y-2">
                {plans.map((pl) => (
                  <div
                    key={pl.id}
                    className={`rounded-2xl border p-3 flex items-center justify-between gap-2 ${
                      pl.id === activePlan.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/35'
                        : 'border-[var(--color-border)] bg-[var(--color-background)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold truncate">
                        {pl.name}{' '}
                        {pl.isActive && (
                          <span className="text-[10px] text-[var(--color-primary)]">
                            ({t.seating.activePlanBadge})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                        {pl.rows}×{pl.cols} · {pl.updatedAt.slice(0, 10)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!pl.isActive && (
                        <button
                          type="button"
                          onClick={async () => {
                            await services.seating.setActivePlan(
                              ctx.academicYearId,
                              classRoom.id,
                              pl.id
                            );
                            await loadWorkspace();
                          }}
                          className="min-h-[34px] px-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[11px] font-bold"
                        >
                          {t.seating.setActivePlan}
                        </button>
                      )}
                      {!isArchiveYear && (
                        <>
                          <button
                            type="button"
                            title={t.seating.duplicatePlan}
                            onClick={async () => {
                              await services.seating.duplicatePlan(
                                ctx,
                                pl.id,
                                `${pl.name} (${t.seating.duplicatePlan})`
                              );
                              await loadWorkspace();
                            }}
                            className="min-h-[34px] min-w-[34px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title={t.seating.renamePlan}
                            onClick={() => setRenamePlanTarget(pl)}
                            className="min-h-[34px] min-w-[34px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {plans.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setDeletePlanTarget(pl)}
                              className="min-h-[34px] min-w-[34px] rounded-xl flex items-center justify-center text-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Plan Modal */}
      {renamePlanTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await services.seating.renamePlan(renamePlanTarget.id, renamePlanTarget.name);
              setRenamePlanTarget(null);
              await loadWorkspace();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3"
          >
            <h3 className="text-sm font-extrabold">{t.seating.renamePlan}</h3>
            <input
              type="text"
              required
              value={renamePlanTarget.name}
              onChange={(e) =>
                setRenamePlanTarget({ ...renamePlanTarget, name: e.target.value })
              }
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenamePlanTarget(null)}
                className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[40px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletePlanTarget)}
        title={t.common.delete}
        message={`${t.seating.deletePlanConfirm} (${deletePlanTarget?.name ?? ''})`}
        onConfirm={async () => {
          if (!deletePlanTarget) return;
          await services.seating.deletePlan(
            ctx.academicYearId,
            classRoom.id,
            deletePlanTarget.id
          );
          setDeletePlanTarget(null);
          await loadWorkspace();
        }}
        onCancel={() => setDeletePlanTarget(null)}
      />

      {/* Layout Editor Modal */}
      <LayoutEditorModal
        open={showLayoutEditor}
        plan={displayPlan}
        onApply={commitPlanMutation}
        onClose={() => setShowLayoutEditor(false)}
      />

      {/* Auto-fill Modal */}
      <AutoFillModal
        open={showAutoFill}
        plan={displayPlan}
        students={students}
        onApply={async (opts) => {
          const filled = await services.seating.autoFillPlan(displayPlan, students, {
            ...opts,
            academicYearId: ctx.academicYearId,
            subjectKey: effectiveSubjectKey,
          });
          await commitPlanMutation(filled);
        }}
        onClose={() => setShowAutoFill(false)}
      />

      {/* Single / Batch Evaluation Bottom Sheet */}
      <EvaluationBottomSheet
        open={Boolean(evalTargetStudents && evalTargetStudents.length > 0)}
        ctx={ctx}
        classRoomId={classRoom.id}
        termNumber={termNumber}
        subjectKey={effectiveSubjectKey}
        subjectLabel={subjectLabel}
        students={students}
        targetStudents={evalTargetStudents ?? []}
        criteria={criteria}
        config={behaviorConfig}
        summaries={summaries}
        onClose={() => {
          setEvalTargetStudents(null);
          setBatchSelectMode(false);
          setSelectedBatchIds(new Set());
        }}
        onChanged={async () => {
          await loadWorkspace();
          onChanged?.();
        }}
      />
    </div>
  );
};
