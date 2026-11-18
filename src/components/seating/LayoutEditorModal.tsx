import React, { useState } from 'react';
import { Grid, RotateCw, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  BoardSide,
  SeatingLayoutPreset,
  SeatingPlanRecord,
} from '@/src/types/models';

interface LayoutEditorModalProps {
  open: boolean;
  plan: SeatingPlanRecord;
  onApply: (updatedPlan: SeatingPlanRecord) => Promise<void>;
  onClose: () => void;
}

export const LayoutEditorModal: React.FC<LayoutEditorModalProps> = ({
  open,
  plan,
  onApply,
  onClose,
}) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState<SeatingPlanRecord>(plan);
  const [moveSourceDeskId, setMoveSourceDeskId] = useState<string | null>(null);

  if (!open) return null;

  const byPos = new Map(draft.desks.map((d) => [`${d.row}_${d.col}`, d]));

  const applyPreset = (preset: SeatingLayoutPreset) => {
    const existingIds: string[] = [];
    for (const d of draft.desks) {
      for (const sid of d.studentIds) {
        if (sid) existingIds.push(sid);
      }
    }
    const newDesks = services.seating.buildDeskGridFromPreset(
      preset,
      draft.rows,
      draft.cols,
      draft.defaultSeatsPerDesk
    );
    // Refill previously seated students into the new desks
    let ptr = 0;
    for (const d of newDesks) {
      if (d.isAisle) continue;
      for (let i = 0; i < d.seatsPerDesk && ptr < existingIds.length; i++) {
        d.studentIds[i] = existingIds[ptr++];
      }
    }
    setDraft({ ...draft, desks: newDesks });
    setMoveSourceDeskId(null);
  };

  const handleResize = (rows: number, cols: number) => {
    setDraft(services.seating.resizeGrid(draft, rows, cols));
  };

  const handleSeatsPerDeskAll = (count: 1 | 2 | 3) => {
    const desks = draft.desks.map((d) => {
      if (d.isAisle) return { ...d, seatsPerDesk: count, studentIds: [] };
      const nextIds = Array.from({ length: count }, (_, idx) => d.studentIds[idx] ?? null);
      return { ...d, seatsPerDesk: count, studentIds: nextIds };
    });
    setDraft({ ...draft, defaultSeatsPerDesk: count, desks });
  };

  const cycleSingleDesk = (deskId: string) => {
    const desks = draft.desks.map((d) => {
      if (d.id !== deskId) return d;
      if (d.isAisle) {
        return {
          ...d,
          isAisle: false,
          seatsPerDesk: draft.defaultSeatsPerDesk,
          studentIds: Array.from({ length: draft.defaultSeatsPerDesk }, () => null),
        };
      }
      if (d.seatsPerDesk === 1) {
        return { ...d, seatsPerDesk: 2 as const, studentIds: [d.studentIds[0] ?? null, null] };
      }
      if (d.seatsPerDesk === 2) {
        return {
          ...d,
          seatsPerDesk: 3 as const,
          studentIds: [d.studentIds[0] ?? null, d.studentIds[1] ?? null, null],
        };
      }
      // Cycle to aisle
      return { ...d, isAisle: true, studentIds: [] };
    });
    setDraft({ ...draft, desks });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-xl max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <header className="px-4 py-3.5 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <Grid className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.seating.layoutEditor}</span>
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
          {/* Dimensions & Default Seats Per Desk */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-[var(--color-background)] p-2.5 text-center space-y-1">
              <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
                {t.seating.rowsLabel}
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleResize(draft.rows - 1, draft.cols)}
                  className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-extrabold"
                >
                  −
                </button>
                <span className="text-sm font-extrabold tabular-nums">{draft.rows}</span>
                <button
                  type="button"
                  onClick={() => handleResize(draft.rows + 1, draft.cols)}
                  className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-extrabold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--color-background)] p-2.5 text-center space-y-1">
              <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
                {t.seating.colsLabel}
              </div>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleResize(draft.rows, draft.cols - 1)}
                  className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-extrabold"
                >
                  −
                </button>
                <span className="text-sm font-extrabold tabular-nums">{draft.cols}</span>
                <button
                  type="button"
                  onClick={() => handleResize(draft.rows, draft.cols + 1)}
                  className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-extrabold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-[var(--color-background)] p-2.5 text-center space-y-1">
              <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
                {t.seating.seatsPerDesk}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleSeatsPerDeskAll(n)}
                    className={`h-8 rounded-lg text-xs font-extrabold border ${
                      draft.defaultSeatsPerDesk === n
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]'
                        : 'bg-[var(--color-surface)] border-[var(--color-border)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-[var(--color-text-muted)]">Presets</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {([
                { id: 'rows', label: t.seating.presetRows },
                { id: 'u_shape', label: t.seating.presetUShape },
                { id: 'groups_4', label: t.seating.presetGroups4 },
                { id: 'workshop', label: t.seating.presetWorkshop },
              ] as const).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className="min-h-[38px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-bold hover:border-[var(--color-primary)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Board / Teacher Desk Placement & Rotation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--color-text-muted)]">
                {t.seating.boardTitle}
              </span>
              <button
                type="button"
                onClick={() =>
                  setDraft({ ...draft, boardRotationDeg: (draft.boardRotationDeg + 90) % 360 })
                }
                className="min-h-[34px] px-2.5 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{t.seating.rotateBoard}</span>
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { id: 'top', label: t.seating.boardSideTop },
                { id: 'bottom', label: t.seating.boardSideBottom },
                { id: 'left', label: t.seating.boardSideLeft },
                { id: 'right', label: t.seating.boardSideRight },
              ] as Array<{ id: BoardSide; label: string }>).map((side) => (
                <button
                  key={side.id}
                  type="button"
                  onClick={() => setDraft({ ...draft, boardSide: side.id })}
                  className={`min-h-[38px] rounded-xl text-xs font-bold border ${
                    draft.boardSide === side.id
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]'
                      : 'border-[var(--color-border)] bg-[var(--color-background)]'
                  }`}
                >
                  {side.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Cell Editor (Tap to cycle seats/aisle; or swap positions) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
              <span>{t.seating.toggleAisle} (1 / 2 / 3 / {t.seating.aisleCell})</span>
              <span>{t.seating.moveDeskHint}</span>
            </div>
            <div
              className="grid gap-1.5 p-2 rounded-2xl bg-[var(--color-background)] border border-[var(--color-border)]"
              style={{ gridTemplateColumns: `repeat(${draft.cols}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: draft.rows }, (_, r) =>
                Array.from({ length: draft.cols }, (_, c) => {
                  const desk = byPos.get(`${r}_${c}`);
                  if (!desk) return null;
                  const isMoveSrc = moveSourceDeskId === desk.id;
                  return (
                    <div
                      key={desk.id}
                      draggable
                      onDragStart={() => setMoveSourceDeskId(desk.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (moveSourceDeskId && moveSourceDeskId !== desk.id) {
                          setDraft(
                            services.seating.moveDeskToCell(draft, moveSourceDeskId, desk.row, desk.col)
                          );
                          setMoveSourceDeskId(null);
                        }
                      }}
                      className={`min-h-[46px] rounded-xl border p-1 flex items-center justify-between gap-1 text-[10px] font-bold ${
                        isMoveSrc
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] ring-2 ring-[var(--color-primary)]'
                          : desk.isAisle
                          ? 'border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (moveSourceDeskId && moveSourceDeskId !== desk.id) {
                            setDraft(
                              services.seating.moveDeskToCell(
                                draft,
                                moveSourceDeskId,
                                desk.row,
                                desk.col
                              )
                            );
                            setMoveSourceDeskId(null);
                          } else {
                            cycleSingleDesk(desk.id);
                          }
                        }}
                        className="flex-1 h-full text-center"
                      >
                        {desk.isAisle ? t.seating.aisleCell : `${desk.seatsPerDesk}×`}
                      </button>
                    </div>
                  );
                })
              )}
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
            onClick={async () => {
              await onApply(draft);
              onClose();
            }}
            className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold"
          >
            {t.common.save}
          </button>
        </footer>
      </div>
    </div>
  );
};
