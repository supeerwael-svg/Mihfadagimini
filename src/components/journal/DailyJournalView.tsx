import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { JournalEntryRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { EmptyState } from '@/src/components/common/EmptyState';

interface DailyJournalViewProps {
  ctx: ServiceContext;
  canWrite: boolean;
}

export const DailyJournalView: React.FC<DailyJournalViewProps> = ({ ctx, canWrite }) => {
  const { t, dir } = useI18n();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [cursorMonth, setCursorMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [entries, setEntries] = useState<JournalEntryRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tag, setTag] = useState('');

  const loadEntries = async () => {
    const list = await services.journal.listByYear(ctx.academicYearId);
    setEntries(list);
  };

  useEffect(() => {
    loadEntries();
  }, [ctx.academicYearId]);

  const eventDateSet = useMemo(() => new Set(entries.map((e) => e.date)), [entries]);
  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === selectedDate),
    [entries, selectedDate]
  );

  const yearNum = cursorMonth.getFullYear();
  const monthIdx = cursorMonth.getMonth();
  const daysInMonth = new Date(yearNum, monthIdx + 1, 0).getDate();
  const firstWeekday = new Date(yearNum, monthIdx, 1).getDay();

  const calendarCells: Array<string | null> = [];
  for (let i = 0; i < firstWeekday; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${yearNum}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push(iso);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await services.journal.saveEntry(ctx, {
      date: selectedDate,
      title,
      content,
      classes: [],
      tag,
    });
    setTitle('');
    setContent('');
    setTag('');
    setShowForm(false);
    await loadEntries();
  };

  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-[var(--color-primary)]" />
          <h2 className="text-base font-extrabold text-[var(--color-text)]">{t.journal.title}</h2>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[42px] px-3.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t.journal.newEvent}</span>
          </button>
        )}
      </div>

      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setCursorMonth(new Date(yearNum, monthIdx - 1, 1))}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
          >
            <PrevIcon className="w-4 h-4" />
          </button>
          <div className="text-sm font-extrabold tabular-nums">
            {yearNum} / {String(monthIdx + 1).padStart(2, '0')}
          </div>
          <button
            type="button"
            onClick={() => setCursorMonth(new Date(yearNum, monthIdx + 1, 1))}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
          >
            <NextIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[var(--color-text-muted)] mb-2">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((iso, idx) => {
            if (!iso) return <div key={`empty-${idx}`} />;
            const dayNum = Number(iso.slice(-2));
            const isSelected = iso === selectedDate;
            const hasEvent = eventDateSet.has(iso);
            const isToday = iso === todayStr;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={`min-h-[42px] rounded-xl text-xs font-bold tabular-nums flex flex-col items-center justify-center transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : isToday
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'hover:bg-black/5 dark:hover:bg-white/5 text-[var(--color-text)]'
                }`}
              >
                <span>{dayNum}</span>
                {hasEvent && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected ? 'bg-white' : 'bg-[var(--color-primary)]'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3"
        >
          <div className="text-xs font-bold text-[var(--color-primary)] tabular-nums">
            {selectedDate}
          </div>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.journal.eventTitle}
            className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm"
          />
          <input
            type="text"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder={t.journal.eventTag}
            className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-xs"
          />
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t.journal.eventContent}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
            >
              {t.common.save}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2.5">
        <div className="text-xs font-bold text-[var(--color-text-muted)] tabular-nums">
          {selectedDate}
        </div>
        {dayEntries.length === 0 ? (
          <EmptyState title={t.journal.noEventsForDay} />
        ) : (
          dayEntries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  {entry.tag && (
                    <span className="font-bold text-[var(--color-primary)]">{entry.tag}</span>
                  )}
                  <span className="tabular-nums">{entry.date}</span>
                </div>
                <h3 className="text-sm font-bold text-[var(--color-text)] mt-0.5">{entry.title}</h3>
                {entry.content && (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
                    {entry.content}
                  </p>
                )}
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={async () => {
                    await services.journal.deleteEntry(entry.id);
                    await loadEntries();
                  }}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
