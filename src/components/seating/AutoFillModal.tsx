import React, { useState } from 'react';
import { Sparkles, Trash2, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import type { SeatingPlanRecord, StudentRecord } from '@/src/types/models';

interface AutoFillModalProps {
  open: boolean;
  plan: SeatingPlanRecord;
  students: StudentRecord[];
  onApply: (options: {
    strategy: 'alphabetical' | 'random' | 'by_last_grade';
    apartPairs: Array<[string, string]>;
    priorityStudentIds: string[];
  }) => Promise<void>;
  onClose: () => void;
}

export const AutoFillModal: React.FC<AutoFillModalProps> = ({
  open,
  plan,
  students,
  onApply,
  onClose,
}) => {
  const { t } = useI18n();
  const [strategy, setStrategy] = useState<'alphabetical' | 'random' | 'by_last_grade'>(
    'alphabetical'
  );
  const [apartPairs, setApartPairs] = useState<Array<[string, string]>>(plan.apartPairs ?? []);
  const [pairA, setPairA] = useState('');
  const [pairB, setPairB] = useState('');
  const [priorityIds, setPriorityIds] = useState<string[]>(plan.priorityStudentIds ?? []);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const studentName = (id: string) => {
    const s = students.find((x) => x.id === id);
    return s ? `${s.lastName} ${s.firstName}` : id;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <header className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <Sparkles className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.seating.autoFill}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Strategy */}
          <div className="space-y-1.5">
            {([
              { id: 'alphabetical', label: t.seating.strategyAlphabetical },
              { id: 'random', label: t.seating.strategyRandom },
              { id: 'by_last_grade', label: t.seating.strategyByGrade },
            ] as const).map((opt) => (
              <label
                key={opt.id}
                className={`min-h-[44px] px-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold cursor-pointer ${
                  strategy === opt.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/50 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-background)]'
                }`}
              >
                <input
                  type="radio"
                  checked={strategy === opt.id}
                  onChange={() => setStrategy(opt.id)}
                  className="accent-[var(--color-primary)]"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          {/* Keep couples apart */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-[var(--color-text)]">
              {t.seating.keepApartTitle}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <select
                value={pairA}
                onChange={(e) => setPairA(e.target.value)}
                className="flex-1 min-w-[120px] min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
              >
                <option value="">--</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lastName} {s.firstName}
                  </option>
                ))}
              </select>
              <select
                value={pairB}
                onChange={(e) => setPairB(e.target.value)}
                className="flex-1 min-w-[120px] min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
              >
                <option value="">--</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.lastName} {s.firstName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pairA || !pairB || pairA === pairB}
                onClick={() => {
                  setApartPairs((prev) => [...prev, [pairA, pairB]]);
                  setPairA('');
                  setPairB('');
                }}
                className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold disabled:opacity-40"
              >
                {t.common.add}
              </button>
            </div>

            {apartPairs.length > 0 && (
              <div className="space-y-1">
                {apartPairs.map(([a, b], idx) => (
                  <div
                    key={`${a}_${b}_${idx}`}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold">
                      {studentName(a)} ≠ {studentName(b)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setApartPairs((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-rose-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Front row priority */}
          <div className="space-y-2">
            <div className="text-xs font-extrabold text-[var(--color-text)]">
              {t.seating.frontPriorityTitle}
            </div>
            <div className="max-h-36 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
              {students.map((s) => {
                const checked = priorityIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs cursor-pointer hover:bg-[var(--color-surface)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setPriorityIds((prev) =>
                          e.target.checked
                            ? [...prev, s.id]
                            : prev.filter((id) => id !== s.id)
                        );
                      }}
                      className="accent-[var(--color-primary)]"
                    />
                    <span className="truncate font-semibold">
                      {s.lastName} {s.firstName}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onApply({
                  strategy,
                  apartPairs,
                  priorityStudentIds: priorityIds,
                });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold disabled:opacity-50"
          >
            {t.seating.applyAutoFill}
          </button>
        </footer>
      </div>
    </div>
  );
};
