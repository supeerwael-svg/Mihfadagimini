import React, { useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Folder,
  GripVertical,
  MoreVertical,
  Pin,
  Plus,
} from 'lucide-react';
import { triggerRipple } from '@/src/hooks/useRipple';
import { useI18n } from '@/src/i18n/I18nContext';
import type { SectionNode, ThemeConfigRecord } from '@/src/types/models';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';

interface QuickAccessGridProps {
  sections: SectionNode[];
  fileCounts: Record<string, { count: number; totalBytes: number }>;
  themeConfig: ThemeConfigRecord | null;
  canWrite: boolean;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onSelectSection: (section: SectionNode) => void;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onTogglePin: (sectionId: string) => Promise<void>;
  onToggleHide: (sectionId: string) => Promise<void>;
  onAddCustomSection: (names: { ar: string; en: string; fr: string }) => Promise<void>;
}

export const QuickAccessGrid: React.FC<QuickAccessGridProps> = ({
  sections,
  fileCounts,
  themeConfig,
  canWrite,
  showHidden,
  onToggleShowHidden,
  onSelectSection,
  onReorder,
  onTogglePin,
  onToggleHide,
  onAddCustomSection,
}) => {
  const { t, pickLocalized } = useI18n();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameFr, setNewNameFr] = useState('');
  const longPressTimer = useRef<number | null>(null);

  const visibleSections = sections.filter((s) => showHidden || !s.isHidden);

  const getSlug = (id: string) => (id.includes('__') ? id.split('__')[1] : id);

  const getCardAccent = (s: SectionNode) => {
    const slug = getSlug(s.id);
    return themeConfig?.cardOverrides[slug]?.accentColor || s.accentColor || '#0f766e';
  };

  const getCardIcon = (s: SectionNode) => {
    const slug = getSlug(s.id);
    return themeConfig?.cardOverrides[slug]?.icon || s.icon;
  };

  const handleDropOn = async (targetId: string) => {
    if (!draggingId || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ids = sections.map((s) => s.id);
    const fromIdx = ids.indexOf(draggingId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggingId(null);
      return;
    }
    const next = [...ids];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDraggingId(null);
    await onReorder(next);
  };

  const handleTouchStart = (id: string) => {
    longPressTimer.current = window.setTimeout(() => {
      setDraggingId(id);
    }, 320);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNameAr.trim()) return;
    await onAddCustomSection({
      ar: newNameAr.trim(),
      en: newNameEn.trim() || newNameAr.trim(),
      fr: newNameFr.trim() || newNameAr.trim(),
    });
    setNewNameAr('');
    setNewNameEn('');
    setNewNameFr('');
    setShowAddModal(false);
  };

  return (
    <section className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center">
            <Folder className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[var(--color-text)]">
              {t.home.sectionsHeading}
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)]">{t.home.dragHint}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleShowHidden}
            className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text-muted)] inline-flex items-center gap-1.5"
          >
            {showHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showHidden ? t.home.hideHidden : t.home.showHidden}</span>
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">{t.home.addCustomSection}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {visibleSections.map((section) => {
          const accent = getCardAccent(section);
          const iconName = getCardIcon(section);
          const stats = fileCounts[section.id] || { count: 0, totalBytes: 0 };
          const isBeingDragged = draggingId === section.id;

          return (
            <div
              key={section.id}
              draggable={canWrite}
              onDragStart={() => setDraggingId(section.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropOn(section.id)}
              onTouchStart={() => handleTouchStart(section.id)}
              onTouchEnd={handleTouchEnd}
              style={{ borderColor: accent }}
              className={`relative rounded-[24px] bg-[var(--color-surface)] border-2 p-3.5 shadow-sm transition-all duration-150 ${
                isBeingDragged ? 'scale-[0.97] opacity-75 ring-2 ring-[var(--color-primary)]' : ''
              } ${section.isHidden ? 'opacity-55' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    triggerRipple(e);
                    if (draggingId && draggingId !== section.id) {
                      handleDropOn(section.id);
                    } else {
                      setDraggingId(null);
                      onSelectSection(section);
                    }
                  }}
                  className="ripple-surface w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${accent}1F`, color: accent }}
                >
                  <DynamicIcon name={iconName} className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-0.5">
                  {section.isPinned && (
                    <Pin className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setMenuOpenId((prev) => (prev === section.id ? null : section.id))
                    }
                    aria-label={t.common.actions}
                    className="min-h-[36px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  <span
                    className="min-h-[36px] min-w-[24px] flex items-center justify-center text-[var(--color-text-muted)] cursor-grab"
                    title={t.home.dragHint}
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  triggerRipple(e);
                  if (draggingId && draggingId !== section.id) {
                    handleDropOn(section.id);
                  } else {
                    setDraggingId(null);
                    onSelectSection(section);
                  }
                }}
                className="ripple-surface mt-3 w-full text-start block rounded-xl"
              >
                <div className="text-sm font-bold text-[var(--color-text)] leading-snug line-clamp-2 min-h-[2.4rem]">
                  {pickLocalized(section.names)}
                </div>
                <div className="mt-1.5 text-[11px] text-[var(--color-text-muted)] tabular-nums">
                  {stats.count} {t.common.filesCount}
                  {stats.totalBytes > 0 ? ` · ${(stats.totalBytes / 1024).toFixed(0)} KB` : ''}
                </div>
              </button>

              {menuOpenId === section.id && (
                <div className="absolute top-11 end-2 z-20 w-40 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl p-1.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpenId(null);
                      await onTogglePin(section.id);
                    }}
                    className="w-full min-h-[38px] px-2.5 rounded-xl text-start hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2"
                  >
                    <Pin className="w-3.5 h-3.5" />
                    <span>{section.isPinned ? t.common.unpin : t.common.pin}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpenId(null);
                      await onToggleHide(section.id);
                    }}
                    className="w-full min-h-[38px] px-2.5 rounded-xl text-start hover:bg-black/5 dark:hover:bg-white/5 flex items-center gap-2"
                  >
                    {section.isHidden ? (
                      <Eye className="w-3.5 h-3.5" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                    <span>{section.isHidden ? t.common.show : t.common.hide}</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleAddSubmit}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3.5 shadow-2xl"
          >
            <h3 className="text-base font-extrabold">{t.home.addCustomSection}</h3>
            <input
              type="text"
              required
              value={newNameAr}
              onChange={(e) => setNewNameAr(e.target.value)}
              placeholder={t.sections.nameAr}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <input
              type="text"
              value={newNameEn}
              onChange={(e) => setNewNameEn(e.target.value)}
              placeholder={t.sections.nameEn}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <input
              type="text"
              value={newNameFr}
              onChange={(e) => setNewNameFr(e.target.value)}
              placeholder={t.sections.nameFr}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.add}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
