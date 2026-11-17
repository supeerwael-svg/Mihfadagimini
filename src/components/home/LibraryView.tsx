import React, { useEffect, useState } from 'react';
import { Clock, Folder, Star } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { FileRecord, SectionNode } from '@/src/types/models';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';
import { EmptyState } from '@/src/components/common/EmptyState';

interface LibraryViewProps {
  academicYearId: string;
  sections: SectionNode[];
  onSelectSection: (sec: SectionNode) => void;
  onOpenFile: (file: FileRecord) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  academicYearId,
  sections,
  onSelectSection,
  onOpenFile,
}) => {
  const { t, pickLocalized } = useI18n();
  const [subTab, setSubTab] = useState<'sections' | 'favorites' | 'recent'>('sections');
  const [favorites, setFavorites] = useState<FileRecord[]>([]);
  const [recent, setRecent] = useState<FileRecord[]>([]);

  useEffect(() => {
    Promise.all([
      services.files.listFavorites(academicYearId),
      services.files.listRecentlyOpened(academicYearId, 20),
    ]).then(([fav, rec]) => {
      setFavorites(fav);
      setRecent(rec);
    });
  }, [academicYearId, subTab]);

  const handleOpen = async (f: FileRecord) => {
    await services.files.markOpened(f.id);
    onOpenFile(f);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setSubTab('sections')}
          className={`min-h-[42px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'sections'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <Folder className="w-3.5 h-3.5" />
          <span>{t.home.sectionsHeading}</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('favorites')}
          className={`min-h-[42px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'favorites'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          <span>{t.common.favorites}</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('recent')}
          className={`min-h-[42px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'recent'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{t.common.recent}</span>
        </button>
      </div>

      {subTab === 'sections' && (
        <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
          {sections.map((sec) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSelectSection(sec)}
              className="w-full min-h-[58px] px-4 py-3 flex items-center gap-3 text-start hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${sec.accentColor}1F`, color: sec.accentColor }}
              >
                <DynamicIcon name={sec.icon} className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-[var(--color-text)] truncate">
                {pickLocalized(sec.names)}
              </span>
            </button>
          ))}
        </div>
      )}

      {subTab === 'favorites' &&
        (favorites.length === 0 ? (
          <EmptyState title={t.common.noFiles} />
        ) : (
          <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
            {favorites.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleOpen(f)}
                className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-start"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{f.name}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                    {f.extension.toUpperCase()} · {(f.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Star className="w-4 h-4 fill-amber-400 text-amber-500 shrink-0" />
              </button>
            ))}
          </div>
        ))}

      {subTab === 'recent' &&
        (recent.length === 0 ? (
          <EmptyState title={t.common.noFiles} />
        ) : (
          <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
            {recent.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => handleOpen(f)}
                className="w-full min-h-[54px] px-4 py-3 flex items-center justify-between gap-3 text-start"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{f.name}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                    {f.lastOpenedAt?.slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
                <Clock className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              </button>
            ))}
          </div>
        ))}
    </div>
  );
};
