import React, { useEffect, useState } from 'react';
import { AlertTriangle, Archive, ArrowRightLeft, Trash2, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { SubjectDependencies } from '@/src/services/SubjectsService';
import type { SubjectRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';

interface SubjectDeleteModalProps {
  open: boolean;
  ctx: ServiceContext;
  subject: SubjectRecord | null;
  otherActiveSubjects: SubjectRecord[];
  initialMode?: 'archive' | 'move' | 'delete';
  onClose: () => void;
  onResolved: () => Promise<void>;
}

export const SubjectDeleteModal: React.FC<SubjectDeleteModalProps> = ({
  open,
  ctx,
  subject,
  otherActiveSubjects,
  initialMode = 'archive',
  onClose,
  onResolved,
}) => {
  const { t, pickLocalized } = useI18n();
  const [deps, setDeps] = useState<SubjectDependencies | null>(null);
  const [mode, setMode] = useState<'archive' | 'move' | 'delete'>(initialMode);
  const [targetSubjectId, setTargetSubjectId] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !subject) return;
    setMode(initialMode);
    setConfirmInput('');
    setTargetSubjectId(otherActiveSubjects[0]?.id || '');
    services.subjects.getDependencies(ctx.academicYearId, subject.id).then(setDeps);
  }, [open, subject?.id, ctx.academicYearId, initialMode]);

  if (!open || !subject) return null;

  const subjectDisplayName = pickLocalized(subject.names);
  const validNameMatch = [subject.names.ar, subject.names.en, subject.names.fr]
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean)
    .includes(confirmInput.trim().toLowerCase());

  const canConfirm =
    !busy &&
    (mode === 'archive' ||
      (mode === 'move' && Boolean(targetSubjectId)) ||
      (mode === 'delete' && validNameMatch));

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      if (mode === 'archive') {
        await services.subjects.archiveSubject(ctx, subject.id);
      } else if (mode === 'move' && targetSubjectId) {
        await services.subjects.moveSubjectContent(ctx, subject.id, targetSubjectId);
      } else if (mode === 'delete') {
        await services.subjects.deleteSubjectToTrash(ctx, subject.id);
      }
      await onResolved();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${subject.color}22`, color: subject.color }}
            >
              <DynamicIcon name={subject.icon} className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-[var(--color-text)] truncate">
                {t.subjects.safeDeleteTitle}
              </h3>
              <p className="text-xs font-bold text-[var(--color-primary)] truncate">
                {subjectDisplayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Exact Dependencies Summary */}
          <div className="rounded-2xl bg-[var(--color-background)] border border-[var(--color-border)] p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-[var(--color-text)]">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{t.subjects.dependenciesTitle}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center tabular-nums">
              <div className="rounded-xl bg-[var(--color-surface)] p-2 border border-[var(--color-border)]">
                <div className="text-base font-extrabold">{deps?.filesCount ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">{t.subjects.depFiles}</div>
              </div>
              <div className="rounded-xl bg-[var(--color-surface)] p-2 border border-[var(--color-border)]">
                <div className="text-base font-extrabold">{deps?.gradesCount ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">{t.subjects.depGrades}</div>
              </div>
              <div className="rounded-xl bg-[var(--color-surface)] p-2 border border-[var(--color-border)]">
                <div className="text-base font-extrabold">{deps?.classesCount ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">{t.subjects.depClasses}</div>
              </div>
              <div className="rounded-xl bg-[var(--color-surface)] p-2 border border-[var(--color-border)]">
                <div className="text-base font-extrabold">{deps?.examsCount ?? 0}</div>
                <div className="text-[11px] text-[var(--color-text-muted)]">{t.subjects.depExams}</div>
              </div>
            </div>
          </div>

          {/* 3 Resolution Options */}
          <div className="space-y-2.5">
            <label
              className={`block rounded-2xl border-2 p-3.5 cursor-pointer transition-colors ${
                mode === 'archive'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/35'
                  : 'border-[var(--color-border)]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  checked={mode === 'archive'}
                  onChange={() => setMode('archive')}
                  className="mt-1 accent-[var(--color-primary)]"
                />
                <div className="space-y-0.5">
                  <div className="text-xs font-extrabold inline-flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                    <span>{t.subjects.optArchiveTitle}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    {t.subjects.optArchiveDesc}
                  </p>
                </div>
              </div>
            </label>

            {otherActiveSubjects.length > 0 && (
              <label
                className={`block rounded-2xl border-2 p-3.5 cursor-pointer transition-colors ${
                  mode === 'move'
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/35'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    checked={mode === 'move'}
                    onChange={() => setMode('move')}
                    className="mt-1 accent-[var(--color-primary)]"
                  />
                  <div className="space-y-2 flex-1">
                    <div>
                      <div className="text-xs font-extrabold inline-flex items-center gap-1.5">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{t.subjects.optMoveTitle}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        {t.subjects.optMoveDesc}
                      </p>
                    </div>
                    {mode === 'move' && (
                      <select
                        value={targetSubjectId}
                        onChange={(e) => setTargetSubjectId(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
                      >
                        <option value="">{t.subjects.selectTargetSubject}</option>
                        {otherActiveSubjects.map((s) => (
                          <option key={s.id} value={s.id}>
                            {pickLocalized(s.names)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </label>
            )}

            <label
              className={`block rounded-2xl border-2 p-3.5 cursor-pointer transition-colors ${
                mode === 'delete'
                  ? 'border-red-500 bg-red-50/60 dark:bg-red-950/30'
                  : 'border-[var(--color-border)]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="radio"
                  checked={mode === 'delete'}
                  onChange={() => setMode('delete')}
                  className="mt-1 accent-red-600"
                />
                <div className="space-y-2 flex-1">
                  <div>
                    <div className="text-xs font-extrabold text-red-600 inline-flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t.subjects.optDeleteTitle}</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      {t.subjects.optDeleteDesc}
                    </p>
                  </div>
                  {mode === 'delete' && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-[var(--color-text)]">
                        {t.subjects.typeConfirmHint}{' '}
                        <span className="text-red-600 underline select-all">
                          {subjectDisplayName}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={confirmInput}
                        onChange={(e) => setConfirmInput(e.target.value)}
                        placeholder={t.subjects.typeConfirmPlaceholder}
                        className="w-full min-h-[42px] rounded-xl border border-red-300 dark:border-red-800 bg-[var(--color-surface)] px-3 text-xs font-bold"
                      />
                    </div>
                  )}
                </div>
              </div>
            </label>
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className={`min-h-[44px] px-5 rounded-xl text-xs font-extrabold text-white disabled:opacity-40 ${
              mode === 'delete' ? 'bg-red-600' : 'bg-[var(--color-primary)]'
            }`}
          >
            {busy
              ? t.common.loading
              : mode === 'archive'
              ? t.subjects.hideSubject
              : mode === 'move'
              ? t.common.move
              : t.subjects.confirmDeleteBtn}
          </button>
        </footer>
      </div>
    </div>
  );
};
