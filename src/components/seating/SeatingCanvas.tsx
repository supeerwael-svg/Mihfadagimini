import React, { useMemo, useRef, useState } from 'react';
import {
  Armchair,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Maximize2,
  Move,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import type { StudentBehaviorSummary } from '@/src/services/BehaviorService';
import type {
  BoardSide,
  DeskSlot,
  SeatingPlanRecord,
  StudentRecord,
} from '@/src/types/models';
import { buildOrderedGrid } from './SeatingPrintExport';

interface SeatingCanvasProps {
  plan: SeatingPlanRecord;
  students: StudentRecord[];
  summaries: Map<string, StudentBehaviorSummary>;
  editMode: boolean;
  batchSelectMode: boolean;
  selectedBatchIds: Set<string>;
  selectedSeatForMove: { deskId: string; seatIndex: number } | null;
  pendingUnseatedStudentId: string | null;
  colorFeedback: boolean;
  hideNamesMode: boolean;
  onSeatClick: (desk: DeskSlot, seatIndex: number, studentId: string | null) => void;
  onSwapSeats?: (
    from: { deskId: string; seatIndex: number },
    to: { deskId: string; seatIndex: number }
  ) => void;
  onBoardClick?: () => void;
}

export const SeatingCanvas: React.FC<SeatingCanvasProps> = ({
  plan,
  students,
  summaries,
  editMode,
  batchSelectMode,
  selectedBatchIds,
  selectedSeatForMove,
  pendingUnseatedStudentId,
  colorFeedback,
  hideNamesMode,
  onSeatClick,
  onSwapSeats,
  onBoardClick,
}) => {
  const { t } = useI18n();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragPayload, setDragPayload] = useState<{ deskId: string; seatIndex: number } | null>(null);

  // Touch pinch-to-zoom & pan refs
  const pinchStartRef = useRef<{ dist: number; startZoom: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; origX: number; origY: number } | null>(null);

  const studentMap = useMemo(() => {
    const m = new Map<string, { student: StudentRecord; rosterNum: number }>();
    students.forEach((s, idx) => m.set(s.id, { student: s, rosterNum: idx + 1 }));
    return m;
  }, [students]);

  const { rowOrder, colOrder, byPos, effectiveBoardSide } = useMemo(
    () => buildOrderedGrid(plan),
    [plan]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartRef.current = {
        dist: Math.hypot(dx, dy),
        startZoom: zoom,
      };
      panStartRef.current = null;
    } else if (e.touches.length === 1 && zoom > 1.05) {
      panStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        origX: pan.x,
        origY: pan.y,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / Math.max(1, pinchStartRef.current.dist);
      setZoom(Math.max(0.75, Math.min(2.3, pinchStartRef.current.startZoom * ratio)));
    } else if (e.touches.length === 1 && panStartRef.current && zoom > 1.05) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.origX + dx, y: panStartRef.current.origY + dy });
    }
  };

  const handleTouchEnd = () => {
    pinchStartRef.current = null;
    panStartRef.current = null;
  };

  const renderBoardArrow = (side: BoardSide) => {
    if (side === 'top') return <ArrowUp className="w-3.5 h-3.5 shrink-0" />;
    if (side === 'bottom') return <ArrowDown className="w-3.5 h-3.5 shrink-0" />;
    if (side === 'left') return <ArrowLeft className="w-3.5 h-3.5 shrink-0" />;
    return <ArrowRight className="w-3.5 h-3.5 shrink-0" />;
  };

  const boardElement = (
    <button
      type="button"
      onClick={onBoardClick}
      className={`rounded-2xl border-2 border-[var(--color-primary)]/40 bg-[var(--color-primary-light)]/75 text-[var(--color-primary)] font-extrabold text-xs px-3 py-2 flex items-center justify-center gap-2 shadow-sm hover:bg-[var(--color-primary-light)] transition-colors ${
        effectiveBoardSide === 'left' || effectiveBoardSide === 'right'
          ? 'min-h-[140px] w-14 flex-col py-4'
          : 'w-full min-h-[42px]'
      }`}
      title={t.seating.boardTitle}
    >
      {renderBoardArrow(effectiveBoardSide)}
      <span
        className={
          effectiveBoardSide === 'left' || effectiveBoardSide === 'right'
            ? 'text-[11px] leading-tight text-center'
            : 'truncate'
        }
        style={
          plan.boardRotationDeg
            ? { transform: `rotate(${plan.boardRotationDeg}deg)` }
            : undefined
        }
      >
        {t.seating.boardShort}
      </span>
      <RotateCw className="w-3 h-3 opacity-65 shrink-0" />
    </button>
  );

  // Dynamic desk density sizing so 16-45 seats auto-fit stage cleanly without bottom void
  const isDenseCols = plan.cols >= 4;

  const gridBody = (
    <div
      className="flex-1 w-full grid gap-2 sm:gap-2.5 items-stretch justify-items-stretch"
      style={{
        gridTemplateColumns: `repeat(${colOrder.length}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rowOrder.length}, minmax(66px, 1fr))`,
      }}
    >
      {rowOrder.map((rIdx) =>
        colOrder.map((cIdx) => {
          const desk = byPos.get(`${rIdx}_${cIdx}`);
          if (!desk || desk.isAisle) {
            return (
              <div
                key={`aisle_${rIdx}_${cIdx}`}
                className={`rounded-2xl ${
                  editMode
                    ? 'border border-dashed border-[var(--color-border)]/70 bg-transparent flex items-center justify-center text-[10px] text-[var(--color-text-muted)]'
                    : ''
                }`}
              >
                {editMode ? t.seating.aisleCell : null}
              </div>
            );
          }

          return (
            <div
              key={desk.id}
              className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-1 sm:p-1.5 shadow-sm flex items-stretch gap-1 min-w-0"
            >
              {Array.from({ length: desk.seatsPerDesk }, (_, seatIdx) => {
                const sid = desk.studentIds[seatIdx] ?? null;
                const info = sid ? studentMap.get(sid) : undefined;
                const summary = sid ? summaries.get(sid) : undefined;
                const isSourceSelected =
                  selectedSeatForMove?.deskId === desk.id &&
                  selectedSeatForMove?.seatIndex === seatIdx;
                const isBatchPicked = Boolean(sid && selectedBatchIds.has(sid));
                const isPlaceTarget = Boolean(pendingUnseatedStudentId && !sid);

                // Non-hue-only visual feedback when colorFeedback is enabled
                let seatSurfaceClass = info
                  ? 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text)]'
                  : 'bg-black/[0.025] dark:bg-white/[0.03] border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]';

                if (info && colorFeedback && summary) {
                  if (summary.suggestedGrade >= 12) {
                    seatSurfaceClass =
                      'bg-emerald-50/90 dark:bg-emerald-950/45 border-emerald-400/70 text-emerald-950 dark:text-emerald-100';
                  } else if (summary.suggestedGrade < 9.5) {
                    seatSurfaceClass =
                      'bg-rose-50/90 dark:bg-rose-950/45 border-rose-400/70 text-rose-950 dark:text-rose-100';
                  } else {
                    seatSurfaceClass =
                      'bg-amber-50/80 dark:bg-amber-950/35 border-amber-300/70 text-amber-950 dark:text-amber-100';
                  }
                }

                if (isSourceSelected || isBatchPicked) {
                  seatSurfaceClass =
                    'bg-[var(--color-primary-light)] border-[var(--color-primary)] ring-2 ring-[var(--color-primary)] text-[var(--color-primary)]';
                } else if (isPlaceTarget) {
                  seatSurfaceClass =
                    'bg-[var(--color-primary-light)]/50 border-dashed border-[var(--color-primary)] text-[var(--color-primary)]';
                }

                return (
                  <button
                    key={`${desk.id}_${seatIdx}`}
                    type="button"
                    draggable={editMode && Boolean(sid)}
                    onDragStart={() => {
                      if (editMode && sid) {
                        setDragPayload({ deskId: desk.id, seatIndex: seatIdx });
                      }
                    }}
                    onDragOver={(e) => {
                      if (editMode && dragPayload) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (editMode && dragPayload && onSwapSeats) {
                        onSwapSeats(dragPayload, { deskId: desk.id, seatIndex: seatIdx });
                        setDragPayload(null);
                      }
                    }}
                    onClick={() => onSeatClick(desk, seatIdx, sid)}
                    className={`relative flex-1 min-w-0 min-h-[54px] rounded-xl border px-1 py-1.5 flex flex-col items-center justify-center text-center transition-all active:scale-[0.97] ${seatSurfaceClass}`}
                  >
                    {/* Batch selection checkmark */}
                    {batchSelectMode && isBatchPicked && (
                      <span className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow">
                        <Check className="w-3 h-3" />
                      </span>
                    )}

                    {/* Edit mode move indicator */}
                    {editMode && isSourceSelected && (
                      <span className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shadow">
                        <Move className="w-3 h-3" />
                      </span>
                    )}

                    {/* Today activity counter badge */}
                    {!editMode && info && summary && summary.todayCount > 0 && (
                      <span
                        className={`absolute top-0.5 end-0.5 px-1 rounded-md text-[9px] font-extrabold tabular-nums leading-tight ${
                          summary.todayNet >= 0
                            ? 'bg-emerald-600 text-white'
                            : 'bg-rose-600 text-white'
                        }`}
                      >
                        {summary.todayNet > 0
                          ? `+${summary.todayNet}`
                          : summary.todayNet < 0
                          ? `${summary.todayNet}`
                          : summary.todayCount}
                      </span>
                    )}

                    {!info ? (
                      <div className="flex flex-col items-center justify-center gap-0.5 opacity-60">
                        <Armchair className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold leading-none">
                          {t.seating.emptySeat}
                        </span>
                      </div>
                    ) : hideNamesMode ? (
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-xs sm:text-sm font-extrabold tabular-nums">
                          #{info.rosterNum}
                        </span>
                        {colorFeedback && summary && (
                          <span className="text-[10px] font-bold tabular-nums opacity-85">
                            {summary.suggestedGrade.toFixed(1)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="w-full min-w-0 flex flex-col items-center justify-center gap-0.5">
                        {/* Always display BOTH lastName and firstName without single-word truncation */}
                        <span
                          className={`w-full font-extrabold leading-tight break-words line-clamp-2 ${
                            desk.seatsPerDesk === 3 || isDenseCols
                              ? 'text-[10px] sm:text-[11px]'
                              : 'text-[11px] sm:text-xs'
                          }`}
                        >
                          {info.student.lastName} {info.student.firstName}
                        </span>

                        {/* Explicit numeric score indicator alongside color feedback (never color-only!) */}
                        {colorFeedback && summary && (
                          <span className="text-[9.5px] font-extrabold tabular-nums px-1.5 rounded bg-black/5 dark:bg-white/10">
                            {summary.suggestedGrade >= 12
                              ? '▲ '
                              : summary.suggestedGrade < 9.5
                              ? '▼ '
                              : ''}
                            {summary.suggestedGrade.toFixed(1)}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="relative flex-1 min-h-0 flex flex-col rounded-3xl bg-[var(--color-surface)]/55 border border-[var(--color-border)] overflow-hidden">
      {/* Subtle Zoom Controls Corner */}
      <div className="absolute top-2 end-2 z-20 flex items-center gap-1 rounded-xl bg-[var(--color-surface)]/95 border border-[var(--color-border)] p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.15).toFixed(2)))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Zoom out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="text-[10px] font-bold tabular-nums px-1">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.3, +(z + 0.15).toFixed(2)))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          title="Zoom in"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-primary)]"
            title="Fit"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Auto-fitting, scrollable & pinch-zoomable classroom stage */}
      <div
        ref={stageRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex-1 min-h-0 overflow-auto p-2.5 sm:p-4 flex flex-col justify-between"
      >
        <div
          className="flex-1 min-h-full w-full flex flex-col gap-2.5 origin-center transition-transform duration-75"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {effectiveBoardSide === 'top' && boardElement}

          {effectiveBoardSide === 'left' || effectiveBoardSide === 'right' ? (
            <div className="flex-1 flex items-stretch gap-2.5 min-h-0">
              {effectiveBoardSide === 'left' && boardElement}
              {gridBody}
              {effectiveBoardSide === 'right' && boardElement}
            </div>
          ) : (
            gridBody
          )}

          {effectiveBoardSide === 'bottom' && boardElement}
        </div>
      </div>
    </div>
  );
};
