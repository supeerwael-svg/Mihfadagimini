import React, { useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  Eye,
  EyeOff,
  Folder,
  Plus,
  Search,
} from 'lucide-react';
import { triggerRipple } from '@/src/hooks/useRipple';
import { useI18n } from '@/src/i18n/I18nContext';
import type { SectionNode, ThemeConfigRecord } from '@/src/types/models';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';

interface QuickAccessGridProps {
  teacherDocs: SectionNode[];
  otherSections: SectionNode[];
  themeConfig: ThemeConfigRecord | null;
  canWrite: boolean;
  showHidden: boolean;
  onToggleShowHidden: () => void;
  onSelectSection: (section: SectionNode) => void;
  onReorder: (orderedIds: string[]) => Promise<void>;
  onAddCustomSection: (names: { ar: string; en: string; fr: string }) => Promise<void>;
  onOpenSearch: () => void;
  onOpenSchoolGateway: () => void;
}

const SixDotHandle: React.FC = () => (
  <svg
    viewBox="0 0 12 16"
    className="w-3 h-4 text-slate-400/75 dark:text-slate-500"
    fill="currentColor"
    aria-hidden="true"
  >
    <circle cx="3" cy="3" r="1.35" />
    <circle cx="9" cy="3" r="1.35" />
    <circle cx="3" cy="8" r="1.35" />
    <circle cx="9" cy="8" r="1.35" />
    <circle cx="3" cy="13" r="1.35" />
    <circle cx="9" cy="13" r="1.35" />
  </svg>
);

export const QuickAccessGrid: React.FC<QuickAccessGridProps> = ({
  teacherDocs,
  otherSections,
  themeConfig,
  canWrite,
  showHidden,
  onToggleShowHidden,
  onSelectSection,
  onReorder,
  onAddCustomSection,
  onOpenSearch,
  onOpenSchoolGateway,
}) => {
  const { t, pickLocalized } = useI18n();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<'docs' | 'sections' | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameFr, setNewNameFr] = useState('');
  const longPressTimer = useRef<number | null>(null);
  const suppressNextClick = useRef(false);

  const getSlug = (id: string) => (id.includes('__') ? id.split('__')[1] : id);

  const getCardAccent = (s: SectionNode) => {
    const slug = getSlug(s.id);
    return themeConfig?.cardOverrides[slug]?.accentColor || s.accentColor || '#1e40af';
  };

  const getCardIcon = (s: SectionNode) => {
    const slug = getSlug(s.id);
    return themeConfig?.cardOverrides[slug]?.icon || s.icon;
  };

  const reorderWithinGroup = async (
    groupList: SectionNode[],
    sourceId: string,
    targetId: string
  ) => {
    if (sourceId === targetId) return;
    const ids = groupList.map((s) => s.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const next = [...ids];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await onReorder(next);
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleTouchStart = (id: string, group: 'docs' | 'sections') => {
    if (!canWrite) return;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      suppressNextClick.current = true;
      setDraggingId(id);
      setDragGroup(group);
    }, 260);
  };

  const handleTouchEnd = async (
    e: React.TouchEvent,
    group: 'docs' | 'sections',
    groupList: SectionNode[]
  ) => {
    clearLongPress();
    if (!draggingId || dragGroup !== group) return;
    const touch = e.changedTouches[0];
    if (touch) {
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cardEl = el?.closest('[data-card-id]') as HTMLElement | null;
      const targetId = cardEl?.dataset.cardId;
      const targetGroup = cardEl?.dataset.group;
      if (targetId && targetGroup === group && targetId !== draggingId) {
        await reorderWithinGroup(groupList, draggingId, targetId);
      }
    }
    setDraggingId(null);
    setDragGroup(null);
    window.setTimeout(() => {
      suppressNextClick.current = false;
    }, 80);
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

  const renderGroup = (
    title: string,
    groupKey: 'docs' | 'sections',
    items: SectionNode[]
  ) => {
    const visibleItems = items.filter((s) => showHidden || !s.isHidden);
    if (visibleItems.length === 0) return null;

    return (
      <section className="space-y-4">
        {/* Heading row: folder icon + title on start, muted hint + circular swap icon on end */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Folder className="w-6 h-6 text-amber-400 fill-amber-400 shrink-0" />
            <h2 className="text-lg font-extrabold text-[var(--color-text)] truncate">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 text-[var(--color-text-muted)] shrink-0">
            <span className="text-xs font-medium whitespace-nowrap">{t.home.dragHint}</span>
            <span className="w-5 h-5 rounded-full border border-[var(--color-text-muted)]/60 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* 2-column grid (expands on wider screens), 16px gaps, ~150px tall equal square-ish cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {visibleItems.map((section) => {
            const accent = getCardAccent(section);
            const iconName = getCardIcon(section);
            const isBeingDragged = draggingId === section.id && dragGroup === groupKey;

            return (
              <button
                key={section.id}
                type="button"
                data-card-id={section.id}
                data-group={groupKey}
                draggable={canWrite}
                onDragStart={() => {
                  setDraggingId(section.id);
                  setDragGroup(groupKey);
                }}
                onDragOver={(e) => {
                  if (dragGroup === groupKey) e.preventDefault();
                }}
                onDrop={async () => {
                  if (draggingId && dragGroup === groupKey) {
                    await reorderWithinGroup(items, draggingId, section.id);
                  }
                  setDraggingId(null);
                  setDragGroup(null);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragGroup(null);
                }}
                onTouchStart={() => handleTouchStart(section.id, groupKey)}
                onTouchCancel={() => {
                  clearLongPress();
                  setDraggingId(null);
                  setDragGroup(null);
                }}
                onTouchEnd={(e) => handleTouchEnd(e, groupKey, items)}
                onClick={(e) => {
                  if (suppressNextClick.current) {
                    suppressNextClick.current = false;
                    return;
                  }
                  triggerRipple(e);
                  if (draggingId && dragGroup === groupKey && draggingId !== section.id) {
                    reorderWithinGroup(items, draggingId, section.id);
                    setDraggingId(null);
                    setDragGroup(null);
                  } else {
                    setDraggingId(null);
                    setDragGroup(null);
                    onSelectSection(section);
                  }
                }}
                style={{
                  borderColor: `${accent}52`,
                }}
                className={`ripple-surface relative min-h-[150px] rounded-[24px] bg-[var(--color-surface)] border-2 p-4 flex flex-col items-center justify-center text-center shadow-[0_4px_14px_rgba(15,23,42,0.05)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-transform duration-150 active:scale-[0.98] select-none ${
                  isBeingDragged ? 'scale-[0.96] opacity-75 ring-2 ring-[var(--color-primary)]' : ''
                } ${section.isHidden ? 'opacity-55' : ''}`}
              >
                {/* 6-dot drag handle at top corner */}
                <span className="absolute top-3 end-3 pointer-events-none">
                  <SixDotHandle />
                </span>

                {/* Centered circular ~56px icon badge with 15% tint & solid-color icon */}
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-3 shrink-0"
                  style={{ backgroundColor: `${accent}26`, color: accent }}
                >
                  <DynamicIcon name={iconName} className="w-7 h-7" />
                </div>

                {/* Centered label under badge (semi-bold, Cairo) */}
                <span className="text-sm font-semibold text-[var(--color-text)] leading-snug line-clamp-2">
                  {pickLocalized(section.names)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-5">
      {renderGroup(t.home.teacherDocsHeading, 'docs', teacherDocs)}
      {renderGroup(t.home.allSectionsHeading, 'sections', otherSections)}

      {/* Compact Home Utility Strip (48px touch targets, below the grids) */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className="min-h-[48px] px-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)] inline-flex items-center gap-1.5"
          >
            <Search className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.common.search}</span>
          </button>
          <button
            type="button"
            onClick={onOpenSchoolGateway}
            className="min-h-[48px] px-3.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)] inline-flex items-center gap-1.5"
          >
            <Building2 className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.school.pageTitle}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleShowHidden}
            className="min-h-[48px] px-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text-muted)] inline-flex items-center gap-1.5"
          >
            {showHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showHidden ? t.home.hideHidden : t.home.showHidden}</span>
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="min-h-[48px] px-3.5 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{t.home.addCustomSection}</span>
            </button>
          )}
        </div>
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
              className="w-full min-h-[48px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <input
              type="text"
              value={newNameEn}
              onChange={(e) => setNewNameEn(e.target.value)}
              placeholder={t.sections.nameEn}
              className="w-full min-h-[48px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <input
              type="text"
              value={newNameFr}
              onChange={(e) => setNewNameFr(e.target.value)}
              placeholder={t.sections.nameFr}
              className="w-full min-h-[48px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="min-h-[48px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[48px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.add}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
