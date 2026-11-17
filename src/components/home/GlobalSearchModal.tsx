import React, { useEffect, useState } from 'react';
import { CalendarDays, FileText, Folder, MessageSquare, Presentation, Search, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { GlobalSearchResults } from '@/src/services/SearchService';
import type { FileRecord, SectionNode } from '@/src/types/models';

interface GlobalSearchModalProps {
  open: boolean;
  academicYearId: string;
  onClose: () => void;
  onSelectSection: (sec: SectionNode) => void;
  onSelectFile: (file: FileRecord) => void;
  onNavigateTab: (tab: 'journal' | 'forum') => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  academicYearId,
  onClose,
  onSelectSection,
  onSelectFile,
  onNavigateTab,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResults>({
    sections: [],
    files: [],
    journal: [],
    seminars: [],
    forumTopics: [],
  });

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults({ sections: [], files: [], journal: [], seminars: [], forumTopics: [] });
        return;
      }
      const res = await services.search.search(academicYearId, query, lang);
      setResults(res);
    }, 150);
    return () => clearTimeout(handle);
  }, [open, query, academicYearId, lang]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex flex-col">
      <div className="bg-[var(--color-surface)] border-b border-[var(--color-border)] p-4">
        <div className="mx-auto max-w-2xl flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.home.globalSearchPlaceholder}
              className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] ps-10 pe-4 text-sm text-[var(--color-text)]"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] min-w-[46px] rounded-2xl border border-[var(--color-border)] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-background)] p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {results.sections.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {results.sections.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
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

          {results.files.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {results.files.slice(0, 12).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectFile(f);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-start hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{f.name}</div>
                    {f.tags.length > 0 && (
                      <div className="text-[11px] text-[var(--color-text-muted)]">
                        {f.tags.join(' · ')}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.journal.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {results.journal.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateTab('journal');
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl flex items-center gap-3 text-start hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <CalendarDays className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{j.title}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">{j.date}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.seminars.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {results.seminars.map((sem) => (
                <div
                  key={sem.id}
                  className="min-h-[44px] px-3 py-2 flex items-center gap-3"
                >
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

          {results.forumTopics.length > 0 && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 space-y-1">
              {results.forumTopics.map((topic) => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => {
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
