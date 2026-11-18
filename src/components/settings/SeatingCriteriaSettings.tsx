import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ListChecks, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { BehaviorCriterionRecord, BehaviorCriterionSign } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';

interface SeatingCriteriaSettingsProps {
  ctx: ServiceContext;
}

export const SeatingCriteriaSettings: React.FC<SeatingCriteriaSettingsProps> = ({ ctx }) => {
  const { t, pickLocalized } = useI18n();
  const [criteria, setCriteria] = useState<BehaviorCriterionRecord[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newAr, setNewAr] = useState('');
  const [newEn, setNewEn] = useState('');
  const [newFr, setNewFr] = useState('');
  const [newSign, setNewSign] = useState<BehaviorCriterionSign>('both');
  const [newStep, setNewStep] = useState(1);
  const [newMin, setNewMin] = useState(-5);
  const [newMax, setNewMax] = useState(5);
  const [newWeight, setNewWeight] = useState(1);

  const load = async () => {
    const list = await services.behavior.listCriteria(ctx, false);
    setCriteria(list);
  };

  useEffect(() => {
    load();
  }, [ctx.academicYearId, ctx.ownerId]);

  const handleMove = async (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= criteria.length) return;
    const next = [...criteria];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setCriteria(next);
    await services.behavior.reorderCriteria(next.map((c) => c.id));
    await load();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const baseName = newAr.trim() || newEn.trim() || newFr.trim();
    if (!baseName) return;
    await services.behavior.addCriterion(ctx, {
      names: {
        ar: newAr.trim() || baseName,
        en: newEn.trim() || baseName,
        fr: newFr.trim() || baseName,
      },
      sign: newSign,
      step: newStep,
      minPoints: newMin,
      maxPoints: newMax,
      weight: newWeight,
    });
    setNewAr('');
    setNewEn('');
    setNewFr('');
    setShowAdd(false);
    await load();
  };

  return (
    <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <ListChecks className="w-4 h-4 text-[var(--color-primary)]" />
          <span>{t.seating.criteriaSettingsTitle}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              await services.behavior.resetToDefaultCriteria(ctx);
              await load();
            }}
            className="min-h-[36px] px-2.5 rounded-xl text-xs font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.seating.resetDefaultCriteria}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="min-h-[36px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.seating.addCriterion}</span>
          </button>
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-2xl bg-[var(--color-background)] border border-[var(--color-border)] p-3 space-y-2.5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={newAr}
              onChange={(e) => setNewAr(e.target.value)}
              placeholder={t.seating.criterionNameAr}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs"
            />
            <input
              type="text"
              value={newEn}
              onChange={(e) => setNewEn(e.target.value)}
              placeholder={t.seating.criterionNameEn}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs"
            />
            <input
              type="text"
              value={newFr}
              onChange={(e) => setNewFr(e.target.value)}
              placeholder={t.seating.criterionNameFr}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <select
              value={newSign}
              onChange={(e) => setNewSign(e.target.value as BehaviorCriterionSign)}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-bold"
            >
              <option value="both">{t.seating.signBoth}</option>
              <option value="positive">{t.seating.signPositive}</option>
              <option value="negative">{t.seating.signNegative}</option>
            </select>
            <input
              type="number"
              step={0.5}
              min={0.5}
              value={newStep}
              onChange={(e) => setNewStep(Number(e.target.value) || 1)}
              placeholder={t.seating.stepLabel}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-center font-bold tabular-nums"
            />
            <input
              type="number"
              step={1}
              value={newMin}
              onChange={(e) => setNewMin(Number(e.target.value) || 0)}
              placeholder={t.seating.minPointsLabel}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-center font-bold tabular-nums"
            />
            <input
              type="number"
              step={1}
              value={newMax}
              onChange={(e) => setNewMax(Number(e.target.value) || 5)}
              placeholder={t.seating.maxPointsLabel}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-center font-bold tabular-nums"
            />
            <input
              type="number"
              step={0.25}
              min={0}
              value={newWeight}
              onChange={(e) => setNewWeight(Number(e.target.value) || 1)}
              placeholder={t.seating.weightLabel}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-center font-bold tabular-nums"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="min-h-[38px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
            >
              {t.common.add}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {criteria.map((c, idx) => (
          <div
            key={c.id}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="font-extrabold text-xs text-[var(--color-text)] truncate">
                {pickLocalized(c.names)}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMove(idx, -1)}
                  className="min-h-[34px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-30"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === criteria.length - 1}
                  onClick={() => handleMove(idx, 1)}
                  className="min-h-[34px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-30"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await services.behavior.deleteCriterion(c.id);
                    await load();
                  }}
                  className="min-h-[34px] min-w-[32px] rounded-lg flex items-center justify-center text-rose-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <input
                type="text"
                value={c.names.ar}
                onChange={(e) => {
                  const val = e.target.value;
                  setCriteria((prev) =>
                    prev.map((x) => (x.id === c.id ? { ...x, names: { ...x.names, ar: val } } : x))
                  );
                }}
                onBlur={() => services.behavior.updateCriterion(c.id, { names: c.names })}
                className="min-h-[36px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs"
              />
              <input
                type="text"
                value={c.names.en}
                onChange={(e) => {
                  const val = e.target.value;
                  setCriteria((prev) =>
                    prev.map((x) => (x.id === c.id ? { ...x, names: { ...x.names, en: val } } : x))
                  );
                }}
                onBlur={() => services.behavior.updateCriterion(c.id, { names: c.names })}
                className="min-h-[36px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs"
              />
              <input
                type="text"
                value={c.names.fr}
                onChange={(e) => {
                  const val = e.target.value;
                  setCriteria((prev) =>
                    prev.map((x) => (x.id === c.id ? { ...x, names: { ...x.names, fr: val } } : x))
                  );
                }}
                onBlur={() => services.behavior.updateCriterion(c.id, { names: c.names })}
                className="min-h-[36px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs"
              />
            </div>

            <div className="grid grid-cols-5 gap-1.5 text-[11px] tabular-nums">
              <select
                value={c.sign}
                onChange={async (e) => {
                  const sign = e.target.value as BehaviorCriterionSign;
                  await services.behavior.updateCriterion(c.id, { sign });
                  await load();
                }}
                className="col-span-2 min-h-[34px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2 font-bold"
              >
                <option value="both">{t.seating.signBoth}</option>
                <option value="positive">{t.seating.signPositive}</option>
                <option value="negative">{t.seating.signNegative}</option>
              </select>
              <label className="flex flex-col">
                <span className="text-[10px] text-[var(--color-text-muted)]">{t.seating.stepLabel}</span>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  value={c.step}
                  onChange={(e) => {
                    const step = Math.max(0.5, Number(e.target.value) || 1);
                    setCriteria((prev) => prev.map((x) => (x.id === c.id ? { ...x, step } : x)));
                  }}
                  onBlur={() => services.behavior.updateCriterion(c.id, { step: c.step })}
                  className="min-h-[32px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-center font-bold"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] text-[var(--color-text-muted)]">{t.seating.minPointsLabel} / {t.seating.maxPointsLabel}</span>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={c.minPoints}
                    onChange={(e) => {
                      const minPoints = Number(e.target.value) || 0;
                      setCriteria((prev) =>
                        prev.map((x) => (x.id === c.id ? { ...x, minPoints } : x))
                      );
                    }}
                    onBlur={() =>
                      services.behavior.updateCriterion(c.id, { minPoints: c.minPoints })
                    }
                    className="w-1/2 min-h-[32px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-center font-bold"
                  />
                  <input
                    type="number"
                    value={c.maxPoints}
                    onChange={(e) => {
                      const maxPoints = Number(e.target.value) || 0;
                      setCriteria((prev) =>
                        prev.map((x) => (x.id === c.id ? { ...x, maxPoints } : x))
                      );
                    }}
                    onBlur={() =>
                      services.behavior.updateCriterion(c.id, { maxPoints: c.maxPoints })
                    }
                    className="w-1/2 min-h-[32px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-center font-bold"
                  />
                </div>
              </label>
              <label className="flex flex-col">
                <span className="text-[10px] text-[var(--color-text-muted)]">{t.seating.weightLabel}</span>
                <input
                  type="number"
                  step={0.25}
                  min={0}
                  value={c.weight}
                  onChange={(e) => {
                    const weight = Math.max(0, Number(e.target.value) || 0);
                    setCriteria((prev) => prev.map((x) => (x.id === c.id ? { ...x, weight } : x)));
                  }}
                  onBlur={() => services.behavior.updateCriterion(c.id, { weight: c.weight })}
                  className="min-h-[32px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-center font-bold"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
