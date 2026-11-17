import React, { useEffect, useState } from 'react';
import { Bell, Calendar, MapPin, Plus, Presentation, Trash2 } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { FileRecord, SeminarRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { EmptyState } from '@/src/components/common/EmptyState';
import { FileList } from '@/src/components/files/FileList';
import { FileUploadBar } from '@/src/components/files/FileUploadBar';

interface SeminarsViewProps {
  ctx: ServiceContext;
  sectionId: string;
  canWrite: boolean;
  onOpenFile: (file: FileRecord) => void;
}

export const SeminarsView: React.FC<SeminarsViewProps> = ({
  ctx,
  sectionId,
  canWrite,
  onOpenFile,
}) => {
  const { t } = useI18n();
  const [kindFilter, setKindFilter] = useState<'internal' | 'external'>('internal');
  const [seminars, setSeminars] = useState<SeminarRecord[]>([]);
  const [upcoming, setUpcoming] = useState<SeminarRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:30');
  const [location, setLocation] = useState('');
  const [content, setContent] = useState('');
  const [notifyMinutes, setNotifyMinutes] = useState(1440);

  const loadData = async () => {
    const [list, alerts, secFiles] = await Promise.all([
      services.seminars.listByYear(ctx.academicYearId, kindFilter),
      services.seminars.checkUpcomingNotifications(ctx.academicYearId),
      services.files.listBySection(ctx.academicYearId, sectionId),
    ]);
    setSeminars(list);
    setUpcoming(alerts);
    setFiles(secFiles);
  };

  useEffect(() => {
    loadData();
  }, [ctx.academicYearId, kindFilter, sectionId]);

  const handleEnableNotif = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      await Notification.requestPermission();
      await loadData();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await services.seminars.saveSeminar(ctx, {
      kind: kindFilter,
      title,
      date,
      time,
      location,
      content,
      notifyMinutesBefore: notifyMinutes,
    });
    setTitle('');
    setLocation('');
    setContent('');
    setShowForm(false);
    await loadData();
  };

  return (
    <div className="space-y-4">
      {upcoming.length > 0 && (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <Bell className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                {t.seminars.upcomingBanner}
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {upcoming[0].title} · {upcoming[0].date} {upcoming[0].time}
              </div>
            </div>
          </div>
          {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
            <button
              type="button"
              onClick={handleEnableNotif}
              className="min-h-[36px] px-3 rounded-xl bg-amber-600 text-white text-[11px] font-bold shrink-0"
            >
              {t.seminars.enableNotifications}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex-1 max-w-xs">
          <button
            type="button"
            onClick={() => setKindFilter('internal')}
            className={`min-h-[40px] rounded-xl text-xs font-bold ${
              kindFilter === 'internal'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {t.seminars.internal}
          </button>
          <button
            type="button"
            onClick={() => setKindFilter('external')}
            className={`min-h-[40px] rounded-xl text-xs font-bold ${
              kindFilter === 'external'
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            {t.seminars.external}
          </button>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t.seminars.addSeminar}</span>
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3"
        >
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.seminars.title}
            className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
            />
          </div>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t.seminars.location}
            className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-xs"
          />
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t.seminars.content}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--color-text-muted)]">
              {t.seminars.notifyBefore}
            </span>
            <select
              value={notifyMinutes}
              onChange={(e) => setNotifyMinutes(Number(e.target.value))}
              className="min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold"
            >
              <option value={60}>{t.seminars.minutes60}</option>
              <option value={1440}>{t.seminars.hours24}</option>
              <option value={2880}>{t.seminars.hours48}</option>
            </select>
          </div>
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

      {seminars.length === 0 ? (
        <EmptyState title={t.seminars.title} />
      ) : (
        <div className="space-y-3">
          {seminars.map((s) => (
            <div
              key={s.id}
              className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 flex items-start justify-between gap-3"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] tabular-nums">
                  <Presentation className="w-4 h-4 text-[var(--color-primary)]" />
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {s.date} {s.time}
                  </span>
                  {s.location && (
                    <>
                      <span>·</span>
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{s.location}</span>
                    </>
                  )}
                </div>
                <h3 className="text-sm font-extrabold text-[var(--color-text)]">{s.title}</h3>
                {s.content && (
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
                    {s.content}
                  </p>
                )}
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={async () => {
                    await services.seminars.deleteSeminar(s.id);
                    await loadData();
                  }}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 space-y-3">
        <FileUploadBar
          ctx={ctx}
          sectionId={sectionId}
          disabled={!canWrite}
          onUploaded={loadData}
        />
        <FileList
          files={files}
          canWrite={canWrite}
          onOpenFile={onOpenFile}
          onChanged={loadData}
        />
      </div>
    </div>
  );
};
