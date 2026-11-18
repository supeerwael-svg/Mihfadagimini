import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Edit2,
  History,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { StudentBehaviorSummary } from '@/src/services/BehaviorService';
import type {
  BehaviorConfigRecord,
  BehaviorCriterionRecord,
  BehaviorEventRecord,
  BehaviorGradingRule,
  GradeSubjectKey,
  StudentRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';

interface EvaluationBottomSheetProps {
  open: boolean;
  ctx: ServiceContext;
  classRoomId: string;
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  subjectLabel: string;
  students: StudentRecord[];
  targetStudents: StudentRecord[]; // length === 1 for single mode; >1 for Evaluate all / Evaluate some
  criteria: BehaviorCriterionRecord[];
  config: BehaviorConfigRecord;
  summaries: Map<string, StudentBehaviorSummary>;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export const EvaluationBottomSheet: React.FC<EvaluationBottomSheetProps> = ({
  open,
  ctx,
  classRoomId,
  termNumber,
  subjectKey,
  subjectLabel,
  targetStudents,
  criteria,
  config,
  summaries,
  onClose,
  onChanged,
}) => {
  const { t, pickLocalized } = useI18n();
  const [tab, setTab] = useState<'evaluate' | 'history' | 'rule'>('evaluate');
  const [note, setNote] = useState('');
  const [lastLoggedEventIds, setLastLoggedEventIds] = useState<string[]>([]);
  const [studentEvents, setStudentEvents] = useState<BehaviorEventRecord[]>([]);
  const [batchDeltas, setBatchDeltas] = useState<Record<string, number>>({});
  const [editingEvent, setEditingEvent] = useState<BehaviorEventRecord | null>(null);
  const [confirmResetTerm, setConfirmResetTerm] = useState(false);

  const isSingle = targetStudents.length === 1;
  const singleStudent = isSingle ? targetStudents[0] : null;

  const activeRule: BehaviorGradingRule = useMemo(
    () => services.behavior.resolveRule(config, termNumber, subjectKey),
    [config, termNumber, subjectKey]
  );

  const [ruleDraft, setRuleDraft] = useState<BehaviorGradingRule>(activeRule);

  useEffect(() => {
    setRuleDraft(activeRule);
  }, [activeRule, open]);

  useEffect(() => {
    setBatchDeltas({});
    setNote('');
    setTab('evaluate');
    setLastLoggedEventIds([]);
  }, [open, singleStudent?.id]);

  const loadHistory = async () => {
    if (!singleStudent) {
      setStudentEvents([]);
      return;
    }
    const list = await services.behavior.listEventsForStudent(
      ctx.academicYearId,
      singleStudent.id,
      termNumber,
      subjectKey
    );
    setStudentEvents(list);
  };

  useEffect(() => {
    if (open && singleStudent) {
      loadHistory();
    }
  }, [open, singleStudent?.id, termNumber, subjectKey, summaries]);

  const groupedEventsByDate = useMemo(() => {
    const groups = new Map<string, BehaviorEventRecord[]>();
    for (const ev of studentEvents) {
      const dateKey = ev.occurredAt.slice(0, 10);
      const list = groups.get(dateKey) ?? [];
      list.push(ev);
      groups.set(dateKey, list);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [studentEvents]);

  if (!open || targetStudents.length === 0) return null;

  const singleSummary = singleStudent ? summaries.get(singleStudent.id) : undefined;

  const handleSingleTap = async (crit: BehaviorCriterionRecord, signMul: 1 | -1) => {
    if (!singleStudent) return;
    const delta = crit.step * signMul;
    const ev = await services.behavior.logEvent(ctx, {
      classRoomId,
      studentId: singleStudent.id,
      termNumber,
      subjectKey,
      criterionId: crit.id,
      criterionNameSnapshot: pickLocalized(crit.names),
      delta,
      note,
    });
    setLastLoggedEventIds((prev) => [...prev, ev.id]);
    if (note.trim()) setNote('');
    await onChanged();
    await loadHistory();
  };

  const handleUndoLast = async () => {
    const lastId = lastLoggedEventIds[lastLoggedEventIds.length - 1];
    if (!lastId) return;
    await services.behavior.deleteEvent(lastId);
    setLastLoggedEventIds((prev) => prev.slice(0, -1));
    await onChanged();
    await loadHistory();
  };

  const handleConfirmBatch = async () => {
    const entries = Object.entries(batchDeltas).filter(([, d]) => d !== 0);
    if (entries.length === 0) return;
    const items: Array<{
      classRoomId: string;
      studentId: string;
      termNumber: 1 | 2 | 3;
      subjectKey: GradeSubjectKey;
      criterionId: string;
      criterionNameSnapshot: string;
      delta: number;
      note?: string;
    }> = [];
    for (const [criterionId, delta] of entries) {
      const crit = criteria.find((c) => c.id === criterionId);
      if (!crit) continue;
      for (const st of targetStudents) {
        items.push({
          classRoomId,
          studentId: st.id,
          termNumber,
          subjectKey,
          criterionId: crit.id,
          criterionNameSnapshot: pickLocalized(crit.names),
          delta,
          note,
        });
      }
    }
    if (items.length > 0) {
      await services.behavior.logBatchEvents(ctx, items);
      await onChanged();
    }
    onClose();
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const ruleKey = `${termNumber}__${subjectKey}`;
    await services.behavior.saveConfig({
      ...config,
      rules: {
        ...config.rules,
        [ruleKey]: { ...ruleDraft, key: ruleKey },
      },
    });
    await onChanged();
    setTab('evaluate');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <header className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-[var(--color-text)] leading-snug">
              {isSingle
                ? `${singleStudent!.lastName} ${singleStudent!.firstName}`
                : `${t.seating.confirmBatchEvaluate} (${targetStudents.length})`}
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              {subjectLabel} · T{termNumber} · {t.seating.privacyPrivateBadge}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isSingle && lastLoggedEventIds.length > 0 && (
              <button
                type="button"
                onClick={handleUndoLast}
                className="min-h-[38px] px-2.5 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>{t.library.undoAction}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Suggested Continuous Assessment Banner */}
        {isSingle && singleSummary && (
          <div className="px-4 py-3 bg-[var(--color-background)] border-b border-[var(--color-border)] flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
                {t.seating.suggestedContinuous}
              </div>
              <div className="text-xl font-extrabold tabular-nums text-[var(--color-primary)] leading-tight">
                {singleSummary.suggestedGrade.toFixed(2)}{' '}
                <span className="text-xs font-bold text-[var(--color-text-muted)]">
                  / {activeRule.maxGrade}
                </span>
              </div>
              <div className="text-[10.5px] text-[var(--color-text-muted)] tabular-nums mt-0.5">
                {t.seating.formulaLine}: {activeRule.startingGrade} + (Δ × {activeRule.pointsPerStep}) ·{' '}
                {activeRule.minGrade}–{activeRule.maxGrade}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTab(tab === 'rule' ? 'evaluate' : 'rule')}
              className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span>{t.seating.editGradingRule}</span>
            </button>
          </div>
        )}

        {/* Tabs for Single Mode */}
        {isSingle && (
          <div className="grid grid-cols-3 gap-1 p-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={() => setTab('evaluate')}
              className={`min-h-[38px] rounded-xl text-xs font-bold ${
                tab === 'evaluate'
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              {t.seating.evaluateSome}
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`min-h-[38px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1 ${
                tab === 'history'
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>
                {t.seating.historyTitle} ({studentEvents.length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('rule')}
              className={`min-h-[38px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1 ${
                tab === 'rule'
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{t.seating.editGradingRule}</span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {tab === 'evaluate' && (
            <>
              {!isSingle && (
                <div className="rounded-2xl bg-[var(--color-background)] p-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <Users className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                  <span className="font-bold">
                    {targetStudents
                      .slice(0, 5)
                      .map((s) => `${s.lastName} ${s.firstName}`)
                      .join(' · ')}
                    {targetStudents.length > 5 ? ` +${targetStudents.length - 5}` : ''}
                  </span>
                </div>
              )}

              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.seating.noteOptional}
                className="w-full min-h-[42px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-xs"
              />

              <div className="space-y-2">
                {criteria.map((crit) => {
                  const tally = singleSummary?.byCriterion[crit.id];
                  const batchVal = batchDeltas[crit.id] ?? 0;

                  return (
                    <div
                      key={crit.id}
                      className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/60 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-extrabold text-[var(--color-text)] leading-snug">
                          {pickLocalized(crit.names)}
                        </div>
                        <div className="text-[11px] font-bold text-[var(--color-text-muted)] tabular-nums mt-0.5">
                          {isSingle ? (
                            <span>
                              −{tally?.negativeCount ?? 0} / +{tally?.positiveCount ?? 0} (
                              {tally && tally.rawNet > 0 ? `+${tally.rawNet}` : tally?.rawNet ?? 0})
                            </span>
                          ) : (
                            <span>
                              {t.seating.selectedStudents}: {batchVal > 0 ? `+${batchVal}` : batchVal}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {(crit.sign === 'negative' || crit.sign === 'both') && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSingle) {
                                handleSingleTap(crit, -1);
                              } else {
                                setBatchDeltas((prev) => ({
                                  ...prev,
                                  [crit.id]: (prev[crit.id] ?? 0) - crit.step,
                                }));
                              }
                            }}
                            className="min-w-[48px] min-h-[48px] rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-200 font-extrabold text-sm inline-flex items-center justify-center gap-0.5 active:scale-95 transition-transform"
                          >
                            <Minus className="w-3.5 h-3.5" />
                            <span>{crit.step}</span>
                          </button>
                        )}
                        {(crit.sign === 'positive' || crit.sign === 'both') && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSingle) {
                                handleSingleTap(crit, 1);
                              } else {
                                setBatchDeltas((prev) => ({
                                  ...prev,
                                  [crit.id]: (prev[crit.id] ?? 0) + crit.step,
                                }));
                              }
                            }}
                            className="min-w-[48px] min-h-[48px] rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-200 font-extrabold text-sm inline-flex items-center justify-center gap-0.5 active:scale-95 transition-transform"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{crit.step}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!isSingle && (
                <button
                  type="button"
                  disabled={Object.values(batchDeltas).every((v) => v === 0)}
                  onClick={handleConfirmBatch}
                  className="w-full min-h-[48px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-sm font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-45"
                >
                  <Check className="w-4 h-4" />
                  <span>{t.seating.confirmBatchEvaluate}</span>
                </button>
              )}
            </>
          )}

          {tab === 'history' && isSingle && (
            <div className="space-y-3">
              {groupedEventsByDate.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] text-center py-8">
                  {t.seating.noBehaviorHistory}
                </p>
              ) : (
                groupedEventsByDate.map(([dateKey, list]) => (
                  <div key={dateKey} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[var(--color-primary)] tabular-nums">
                      <CalendarDays className="w-3.5 h-3.5" />
                      <span>{dateKey}</span>
                    </div>
                    {list.map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded-lg text-[11px] font-extrabold tabular-nums ${
                                ev.delta >= 0
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
                              }`}
                            >
                              {ev.delta > 0 ? `+${ev.delta}` : ev.delta}
                            </span>
                            <span className="truncate">{ev.criterionNameSnapshot}</span>
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums mt-0.5">
                            {ev.occurredAt.slice(11, 16)}
                            {ev.note ? ` · ${ev.note}` : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingEvent(ev)}
                            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await services.behavior.deleteEvent(ev.id);
                              await onChanged();
                              await loadHistory();
                            }}
                            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}

              {editingEvent && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await services.behavior.updateEvent(editingEvent.id, {
                      delta: editingEvent.delta,
                      note: editingEvent.note,
                    });
                    setEditingEvent(null);
                    await onChanged();
                    await loadHistory();
                  }}
                  className="rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-surface)] p-3 space-y-2.5"
                >
                  <div className="text-xs font-extrabold">{t.seating.editEvent}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step={0.25}
                      value={editingEvent.delta}
                      onChange={(e) =>
                        setEditingEvent({ ...editingEvent, delta: Number(e.target.value) || 0 })
                      }
                      className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold tabular-nums"
                    />
                    <input
                      type="text"
                      value={editingEvent.note ?? ''}
                      onChange={(e) =>
                        setEditingEvent({ ...editingEvent, note: e.target.value })
                      }
                      placeholder={t.seating.noteOptional}
                      className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingEvent(null)}
                      className="min-h-[36px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="submit"
                      className="min-h-[36px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                    >
                      {t.common.save}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {tab === 'rule' && isSingle && (
            <form onSubmit={handleSaveRule} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.seating.startingGrade}
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={ruleDraft.startingGrade}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, startingGrade: Number(e.target.value) || 0 })
                    }
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.seating.pointsPerStep}
                  </label>
                  <input
                    type="number"
                    step={0.25}
                    min={0.25}
                    value={ruleDraft.pointsPerStep}
                    onChange={(e) =>
                      setRuleDraft({
                        ...ruleDraft,
                        pointsPerStep: Math.max(0.25, Number(e.target.value) || 0.5),
                      })
                    }
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.seating.minGrade}
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={ruleDraft.minGrade}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, minGrade: Number(e.target.value) || 0 })
                    }
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.seating.maxGrade}
                  </label>
                  <input
                    type="number"
                    step={0.5}
                    value={ruleDraft.maxGrade}
                    onChange={(e) =>
                      setRuleDraft({ ...ruleDraft, maxGrade: Number(e.target.value) || 20 })
                    }
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold"
              >
                {t.common.save}
              </button>

              <div className="pt-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => setConfirmResetTerm(true)}
                  className="w-full min-h-[42px] rounded-2xl border border-amber-400/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs font-bold inline-flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t.seating.resetTerm}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmResetTerm}
        title={t.seating.resetTerm}
        message={t.seating.resetTermConfirm}
        onConfirm={async () => {
          await services.behavior.resetTermScoresKeepHistory(
            config,
            classRoomId,
            termNumber,
            subjectKey
          );
          setConfirmResetTerm(false);
          await onChanged();
        }}
        onCancel={() => setConfirmResetTerm(false)}
      />
    </div>
  );
};
