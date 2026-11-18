import React, { useEffect, useState } from 'react';
import {
  Archive,
  Bookmark,
  CalendarDays,
  FileText,
  Folder,
  History,
  MessageSquare,
  Pin,
  Presentation,
  ScanText,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { getFileTitle } from '@/src/services/FilesService';
import type { SearchFileHit } from '@/src/services/SearchService';
import type {
  FileRecord,
  ForumTopicRecord,
  JournalEntryRecord,
  SectionNode,
  SeminarRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { formatFileSize, getExtensionBadge } from '@/src/utils/fileFormat';

interface GlobalSearchModalProps {
  open: boolean;
  academicYearId: string;
  ctx?: ServiceContext;
  user?: UserRecord | null;
  onClose: () => void;
  onSelectSection: (sec: SectionNode) => void;
  onSelectFile: (file: FileRecord, initialPage?: number) => void;
  onNavigateTab: (tab: 'journal' | 'forum') => void;
  onOpenInLibrary?: (query: string, includeArchived: boolean) => void;
  onSavedSearchChanged?: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  academicYearId,
  ctx,
  user,
  onClose,
  onSelectSection,
  onSelectFile,
  onNavigateTab,
  onOpenInLibrary,
  onSavedSearchChanged,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [query, setQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [sections, setSections] = useState<SectionNode[]>([]);
  const [fileHits, setFileHits] = useState<SearchFileHit[]>([]);
  const [journal, setJournal] = useState<JournalEntryRecord[]>([]);
  const [seminars, setSeminars] = useState<SeminarRecord[]>([]);
  const [forumTopics, setForumTopics] = useState<ForumTopicRecord[]>([]);
  const [savedToast, setSavedToast] = useState('');

  useEffect(() => {
    if (!open) return;
    setSavedToast('');
    if (user?.id) {
      services.search.getSearchHistory(user.id).then(setHistory);
    }
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setSections([]);
        setFileHits([]);
        setJournal([]);
        setSeminars([]);
        setForumTopics([]);
        return;
      }
      const res = await services.search.searchLibrary({
        user,
        academicYearId: includeArchived ? 'all' : academicYearId,
        query,
        filters: {
          status: includeArchived ? 'all_with_archived' : 'active',
        },
        lang,
      });
      setSections(res.sections);
      setFileHits(res.hits);
      setJournal(res.journal);
      setSeminars(res.seminars);
      setForumTopics(res.forumTopics);
    }, 150);
    return () => clearTimeout(handle);
  }, [open, query, academicYearId, includeArchived, lang, user]);

  if (!open) return null;

  const recordHistory = async () => {
    if (user?.id && query.trim()) {
      const next = await services.search.recordSearchHistory(user.id, query);
      setHistory(next);
    }
  };

  const handleSaveSearch = async (pinnedToHome: boolean) => {
    if (!query.trim()) return;
    const effectiveCtx: ServiceContext = ctx ?? {
      ownerId: user?.id || 'teacher',
      schoolId: user?.schoolId || 'school_default',
      academicYearId,
    };
    await services.search.saveSearch(effectiveCtx, {
      title: query.trim(),
      query: query.trim(),
      filters: {
        status: includeArchived ? 'all_with_archived' : 'active',
      },
      pinnedToHome,
    });
    await recordHistory();
    setSavedToast(pinnedToHome ? t.library.pinToHome : t.library.saveThisSearch);
    onSavedSearchChanged?.();
  };

  const hasAnyResults =
    sections.length > 0 ||
    fileHits.length > 0 ||
    journal.length > 0 ||
    seminars.length > 0 ||
    forumTopics.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col">
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] p-4 space-y-2.5">
        <div className="mx-auto max-w-2xl flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') recordHistory();
              }}
              placeholder={t.home.globalSearchPlaceholder}
              className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] ps-10 pe-9 text-sm text-[var(--color-text)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute top-1/2 -translate-y-1/2 end-2.5 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="min-h-[46px] min-w-[46px] rounded-2xl border border-[var(--color-border)] flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-auto max-w-2xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="text-[var(--color-text-muted)] truncate">{t.library.operatorsHint}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIncludeArchived((v) => !v)}
              className={`min-h-[32px] px-2.5 rounded-xl font-bold inline-flex items-center gap-1 border ${
                includeArchived
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>{t.library.includeArchived}</span>
            </button>
            {query.trim() && (
              <>
                <button
                  type="button"
                  onClick={() => handleSaveSearch(false)}
                  className="min-h-[32px] px-2.5 rounded-xl border border-[var(--color-border)] font-bold inline-flex items-center gap-1"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{t.library.saveThisSearch}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveSearch(true)}
                  className="min-h-[32px] px-2.5 rounded-xl border border-[var(--color-border)] font-bold inline-flex items-center gap-1"
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span>{t.library.pinToHome}</span>
                </button>
              </>
            )}
            {onOpenInLibrary && query.trim() && (
              <button
                type="button"
                onClick={() => {
                  recordHistory();
                  onClose();
                  onOpenInLibrary(query, includeArchived);
                }}
                className="min-h-[32px] px-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] font-bold inline-flex items-center gap-1"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{t.library.browseTab}</span>
              </button>
            )}
          </div>
        </div>

        {savedToast && (
          <div className="mx-auto max-w-2xl rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            ✓ {savedToast}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-background)] p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {!query.trim() && history.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                  <History className="w-4 h-4" />
                  <span>{t.library.recentSearches}</span>
                </span>
                {user?.id && (
                  <button
                    type="button"
                    onClick={async () => {
                      await services.search.clearSearchHistory(user.id);
                      setHistory([]);
                    }}
                    className="text-[11px] font-bold text-red-600 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t.library.clearFilters}</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {history.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setQuery(item)}
                    className="min-h-[34px] px-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-xs font-bold hover:border-[var(--color-primary)]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim() && !hasAnyResults && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-8 text-center space-y-3">
              <p className="text-sm font-bold text-[var(--color-text-muted)]">
                {t.library.noSearchMatches}
              </p>
              {!includeArchived && (
                <button
                  type="button"
                  onClick={() => setIncludeArchived(true)}
                  className="min-h-[40px] px-4 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold"
                >
                  {t.library.includeArchived}
                </button>
              )}
            </div>
          )}

          {sections.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {sections.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    recordHistory();
                    onClose();
                    onSelectSection(s);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-start hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Folder className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                  <span className="text-sm font-bold truncate">{pickLocalized(s.names)}</span>
                </button>
              ))}
            </div>
          )}

          {fileHits.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1.5">
              {fileHits.slice(0, 20).map((hit) => {
                const f = hit.file;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      recordHistory();
                      services.files.markOpened(f.id);
                      onClose();
                      onSelectFile(f, hit.contentMatch?.page);
                    }}
                    className="w-full p-2.5 rounded-2xl flex items-start gap-3 text-start hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <FileText className="w-5 h-5 text-[var(--color-primary)] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-sm font-bold text-[var(--color-text)] line-clamp-2">
                        {getFileTitle(f)}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] tabular-nums">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--color-background)] font-bold">
                          {getExtensionBadge(f)}
                        </span>
                        <span>{formatFileSize(f.size)}</span>
                        {f.levelCode && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                            {f.levelCode}
                          </span>
                        )}
                        {f.tags.slice(0, 3).map((tg) => (
                          <span key={tg} className="text-[var(--color-primary)] font-semibold">
                            #{tg}
                          </span>
                        ))}
                        {hit.isScannedUnsearchable && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 inline-flex items-center gap-1 font-bold">
                            <ScanText className="w-3 h-3" />
                            <span>{t.library.notSearchable}</span>
                          </span>
                        )}
                      </div>
                      {hit.contentMatch && (
                        <div className="rounded-xl bg-[var(--color-background)] px-2.5 py-1.5 text-[11px] text-[var(--color-text)] leading-relaxed">
                          <span className="font-extrabold text-[var(--color-primary)] me-1.5">
                            {t.library.contentMatch} ({t.library.pageBadge} {hit.contentMatch.page}):
                          </span>
                          <span className="line-clamp-2">{hit.contentMatch.snippet}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {journal.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {journal.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => {
                    recordHistory();
                    onClose();
                    onNavigateTab('journal');
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-start hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <CalendarDays className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{j.title}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {j.date}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {seminars.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {seminars.map((sem) => (
                <div key={sem.id} className="min-h-[44px] px-3 py-2 flex items-center gap-3">
                  <Presentation className="w-4 h-4 text-amber-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{sem.title}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {sem.date} · {sem.location}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {forumTopics.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {forumTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
                    recordHistory();
                    onClose();
                    onNavigateTab('forum');
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-start hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <MessageSquare className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="text-sm font-bold truncate">{topic.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
