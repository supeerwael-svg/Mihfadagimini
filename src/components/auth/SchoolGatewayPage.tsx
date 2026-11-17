import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Megaphone,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  AcademicYearRecord,
  AnnouncementRecord,
  SchoolRecord,
  UserRecord,
} from '@/src/types/models';
import { EmptyState } from '@/src/components/common/EmptyState';

interface SchoolGatewayPageProps {
  user: UserRecord;
  school: SchoolRecord;
  year: AcademicYearRecord;
  onEnterPortfolio: () => void;
  onLogout: () => void;
}

export const SchoolGatewayPage: React.FC<SchoolGatewayPageProps> = ({
  user,
  school,
  year,
  onEnterPortfolio,
  onLogout,
}) => {
  const { t, dir } = useI18n();
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [teachersCount, setTeachersCount] = useState(0);
  const [onlineCount, setOnlineCount] = useState(0);
  const [filesCount, setFilesCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementRecord['category']>('announcement');
  const [pinned, setPinned] = useState(false);

  const canPost = user.role === 'primary_admin' || user.role === 'teacher_write';

  const loadData = async () => {
    const [ann, users, files] = await Promise.all([
      services.school.listAnnouncements(school.id),
      services.auth.listUsers(),
      services.files.listAllForYear(year.id),
    ]);
    setAnnouncements(ann);
    setTeachersCount(users.length);
    setOnlineCount(users.filter((u) => u.isOnlineSimulated).length);
    setFilesCount(files.length);
  };

  useEffect(() => {
    loadData();
  }, [school.id, year.id]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    await services.school.createAnnouncement(
      {
        ownerId: user.id,
        schoolId: school.id,
        academicYearId: year.id,
      },
      {
        title,
        body,
        category,
        pinned,
        authorName: user.displayName,
      }
    );
    setTitle('');
    setBody('');
    setPinned(false);
    setShowForm(false);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    await services.school.deleteAnnouncement(id);
    await loadData();
  };

  const ArrowIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-dvh bg-[var(--color-background)] pb-12">
      <header
        className="px-4 pt-6 pb-8 text-[var(--color-on-primary)] rounded-b-[32px] shadow-md"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
        }}
      >
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold opacity-90">{t.school.pageTitle}</span>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3 rounded-xl bg-white/15 text-xs font-bold hover:bg-white/25"
            >
              {t.auth.logout}
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold truncate">{school.name}</h1>
              <p className="text-xs opacity-85 mt-0.5">
                {school.directorate} · {school.wilaya} · {year.label}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-2xl bg-white/12 p-3">
              <div className="text-lg font-extrabold tabular-nums">{teachersCount}</div>
              <div className="text-[11px] opacity-85">{t.school.statsTeachers}</div>
            </div>
            <div className="rounded-2xl bg-white/12 p-3">
              <div className="text-lg font-extrabold tabular-nums">{onlineCount}</div>
              <div className="text-[11px] opacity-85">{t.school.statsOnline}</div>
            </div>
            <div className="rounded-2xl bg-white/12 p-3">
              <div className="text-lg font-extrabold tabular-nums">{filesCount}</div>
              <div className="text-[11px] opacity-85">{t.school.statsFiles}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={onEnterPortfolio}
            className="mt-5 w-full min-h-[52px] rounded-2xl bg-white text-[var(--color-primary-dark)] font-extrabold text-sm shadow-lg flex items-center justify-center gap-2 hover:bg-white/95 transition-transform active:scale-[0.99]"
          >
            <span>{t.school.enterPortfolio}</span>
            <ArrowIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 mt-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-base font-extrabold text-[var(--color-text)]">
              {t.school.generalSection}
            </h2>
          </div>
          {canPost && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="min-h-[44px] px-3.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.school.postAnnouncement}</span>
            </button>
          )}
        </div>

        {showForm && (
          <form
            onSubmit={handlePost}
            className="mb-5 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3 shadow-sm"
          >
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.school.titlePlaceholder}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
            />
            <textarea
              required
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t.school.bodyPlaceholder}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 text-sm text-[var(--color-text)]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(['news', 'announcement', 'urgent'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-bold ${
                      category === cat
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                        : 'bg-[var(--color-background)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {cat === 'news'
                      ? t.school.categoryNews
                      : cat === 'announcement'
                      ? t.school.categoryAnnouncement
                      : t.school.categoryUrgent}
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="w-4 h-4 accent-[var(--color-primary)]"
                />
                <span>{t.school.pinned}</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)]"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        )}

        {announcements.length === 0 ? (
          <EmptyState title={t.school.noAnnouncements} />
        ) : (
          <div className="space-y-3">
            {announcements.map((ann) => (
              <article
                key={ann.id}
                className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-1">
                      <span
                        className={
                          ann.category === 'urgent'
                            ? 'font-bold text-red-600 dark:text-red-400'
                            : 'font-semibold text-[var(--color-primary)]'
                        }
                      >
                        {ann.category === 'news'
                          ? t.school.categoryNews
                          : ann.category === 'announcement'
                          ? t.school.categoryAnnouncement
                          : t.school.categoryUrgent}
                      </span>
                      <span>·</span>
                      <span>{ann.authorName}</span>
                      <span>·</span>
                      <span className="tabular-nums">{ann.createdAt.slice(0, 10)}</span>
                      {ann.pinned && (
                        <>
                          <span>·</span>
                          <Pin className="w-3.5 h-3.5 text-[var(--color-primary)] inline" />
                        </>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-[var(--color-text)]">{ann.title}</h3>
                    <p className="mt-1.5 text-sm text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
                      {ann.body}
                    </p>
                  </div>
                  {(user.role === 'primary_admin' || ann.ownerId === user.id) && (
                    <button
                      type="button"
                      onClick={() => handleDelete(ann.id)}
                      aria-label={t.common.delete}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
