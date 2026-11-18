import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  CheckCircle2,
  CheckSquare,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Film,
  Filter,
  FolderHeart,
  FolderInput,
  Image as ImageIcon,
  LayoutGrid,
  Link2,
  List,
  MoreVertical,
  Music,
  Pin,
  Presentation,
  QrCode,
  Rows3,
  ScanText,
  Search,
  Share2,
  Star,
  Tag,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { detectFileCategory, getFileStatus, getFileTitle } from '@/src/services/FilesService';
import type { LibrarySortField, LibraryViewMode } from '@/src/services/LibraryService';
import type { SearchFileHit } from '@/src/services/SearchService';
import type {
  FileRecord,
  FileTypeCategory,
  MiddleSchoolLevel,
  SectionNode,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import {
  formatFileSize,
  formatShortDate,
  getExtensionBadge,
  getFileCategoryStyle,
} from '@/src/utils/fileFormat';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { EmptyState } from '@/src/components/common/EmptyState';
import { AddToCollectionModal } from './CollectionModals';

export type LibraryGroupBy = 'none' | 'level' | 'subject' | 'type' | 'month';

export interface VirtualizedFileBrowserProps {
  ctx: ServiceContext;
  user: UserRecord;
  files: FileRecord[];
  hitsByFileId?: Map<string, SearchFileHit>;
  sections: SectionNode[];
  subjects: SubjectRecord[];
  canWrite: boolean;
  loading?: boolean;
  /** Shows model solution link controls inside Section 3 */
  showSolutionSupport?: boolean;
  /** Controlled search query when parent drives SearchService */
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  /** Optional favorites filter controlled or local */
  favoritesOnly?: boolean;
  onFavoritesOnlyChange?: (val: boolean) => void;
  /** Extra action buttons placed compactly in toolbar (e.g. Filter drawer toggle) */
  activeFiltersCount?: number;
  onToggleFiltersDrawer?: () => void;
  /** Extra compact action slot below/beside toolbar for section buttons */
  toolbarActionsSlot?: React.ReactNode;
  onOpenFile: (file: FileRecord, initialPage?: number) => void;
  onOpenDetails: (file: FileRecord) => void;
  onChanged: () => Promise<void> | void;
}

const LazyCoverImage: React.FC<{
  file: FileRecord;
  className?: string;
  compactIconSize?: string;
}> = ({ file, className = 'w-full h-full object-cover', compactIconSize = 'w-7 h-7' }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const category: FileTypeCategory =
    file.fileCategory || detectFileCategory(file.mimeType, file.extension, file.externalUrl);
  const style = getFileCategoryStyle(category);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !file.thumbnailBlob) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file.thumbnailBlob);
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [visible, file.id, file.thumbnailBlob]);

  const renderCategoryIcon = () => {
    if (file.externalUrl) return <Link2 className={compactIconSize} />;
    switch (category) {
      case 'excel':
        return <FileSpreadsheet className={compactIconSize} />;
      case 'pdf':
      case 'word':
        return <FileText className={compactIconSize} />;
      case 'ppt':
        return <Presentation className={compactIconSize} />;
      case 'image':
        return <ImageIcon className={compactIconSize} />;
      case 'audio':
        return <Music className={compactIconSize} />;
      case 'video':
        return <Film className={compactIconSize} />;
      default:
        return <FileIcon className={compactIconSize} />;
    }
  };

  return (
    <div
      ref={hostRef}
      className="w-full h-full flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      {file.thumbnailBlob && !visible && (
        <div className="absolute inset-0 animate-pulse bg-slate-200/70 dark:bg-slate-700/50" />
      )}
      {src ? (
        <img src={src} alt={getFileTitle(file)} loading="lazy" className={className} />
      ) : (
        renderCategoryIcon()
      )}
    </div>
  );
};

export const VirtualizedFileBrowser: React.FC<VirtualizedFileBrowserProps> = ({
  ctx,
  user,
  files,
  hitsByFileId,
  sections,
  subjects,
  canWrite,
  loading = false,
  showSolutionSupport = false,
  searchQuery,
  onSearchQueryChange,
  favoritesOnly: controlledFavOnly,
  onFavoritesOnlyChange,
  activeFiltersCount = 0,
  onToggleFiltersDrawer,
  toolbarActionsSlot,
  onOpenFile,
  onOpenDetails,
  onChanged,
}) => {
  const { t, lang, dir, pickLocalized } = useI18n();

  // Persistent view mode per user
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid');
  const [sortField, setSortField] = useState<LibrarySortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [groupBy, setGroupBy] = useState<LibraryGroupBy>('none');
  const [localQuery, setLocalQuery] = useState('');
  const [localFavOnly, setLocalFavOnly] = useState(false);

  // Progressive virtualized slice for 2,000+ items at 60fps
  const [visibleLimit, setVisibleLimit] = useState(48);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Quick Filters popover inside sections when no parent drawer passed
  const [showInlineFilters, setShowInlineFilters] = useState(false);
  const [inlineTypeFilter, setInlineTypeFilter] = useState<FileTypeCategory | 'all'>('all');
  const [inlineLevelFilter, setInlineLevelFilter] = useState<MiddleSchoolLevel | 'all'>('all');
  const [inlineSubjectFilter, setInlineSubjectFilter] = useState<string>('all');

  // Action Bottom Sheet & Sub-modals
  const [menuFile, setMenuFile] = useState<FileRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const [moveTargets, setMoveTargets] = useState<string[]>([]);
  const [moveSectionId, setMoveSectionId] = useState('');
  const [collectionTargetIds, setCollectionTargetIds] = useState<string[]>([]);
  const [linkSolutionTarget, setLinkSolutionTarget] = useState<FileRecord | null>(null);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkMetaOpen, setBulkMetaOpen] = useState(false);
  const [bulkLevel, setBulkLevel] = useState<MiddleSchoolLevel | ''>('');
  const [bulkSubjectId, setBulkSubjectId] = useState('');

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [longPressTitleBanner, setLongPressTitleBanner] = useState<string | null>(null);

  // Swipe state & Undo snackbar
  const [swipeState, setSwipeState] = useState<{ id: string; dx: number } | null>(null);
  const touchStartRef = useRef<{
    id: string;
    x: number;
    y: number;
    timer: number | null;
    moved: boolean;
  } | null>(null);
  const [undoToast, setUndoToast] = useState<{
    message: string;
    fileId?: string;
    undoKind?: 'trash' | 'archive' | 'favorite';
  } | null>(null);

  const effectiveQuery = searchQuery !== undefined ? searchQuery : localQuery;
  const setEffectiveQuery = (val: string) => {
    if (onSearchQueryChange) onSearchQueryChange(val);
    else setLocalQuery(val);
  };

  const effectiveFavOnly =
    controlledFavOnly !== undefined ? controlledFavOnly : localFavOnly;
  const toggleFavOnly = () => {
    const next = !effectiveFavOnly;
    if (onFavoritesOnlyChange) onFavoritesOnlyChange(next);
    else setLocalFavOnly(next);
  };

  useEffect(() => {
    services.library.getPreferredViewMode(user.id).then(setViewMode);
  }, [user.id]);

  const handleChangeViewMode = async (next: LibraryViewMode) => {
    setViewMode(next);
    await services.library.setPreferredViewMode(user.id, next);
  };

  // Infinite lazy scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => prev + 48);
        }
      },
      { rootMargin: '250px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [files.length, effectiveQuery]);

  // Reset pagination when dataset/query shrinks
  useEffect(() => {
    setVisibleLimit(48);
  }, [effectiveQuery, effectiveFavOnly, inlineTypeFilter, inlineLevelFilter, inlineSubjectFilter]);

  const subjectMap = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects]
  );
  const fileMap = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  // Local client filter (used cleanly when section Explorer doesn't pass pre-filtered SearchService hits)
  const filteredAndSorted = useMemo(() => {
    const normQ = searchQuery === undefined ? effectiveQuery.trim().toLowerCase() : '';
    const list = files.filter((f) => {
      if (effectiveFavOnly && !f.isFavorite) return false;
      const cat = f.fileCategory || detectFileCategory(f.mimeType, f.extension, f.externalUrl);
      if (inlineTypeFilter !== 'all' && cat !== inlineTypeFilter) return false;
      if (inlineLevelFilter !== 'all' && f.levelCode !== inlineLevelFilter) return false;
      if (inlineSubjectFilter !== 'all' && f.subjectId !== inlineSubjectFilter) return false;
      if (!normQ) return true;
      return (
        getFileTitle(f).toLowerCase().includes(normQ) ||
        (f.originalFileName || '').toLowerCase().includes(normQ) ||
        f.tags.some((tg) => tg.toLowerCase().includes(normQ))
      );
    });
    return services.library.sortFiles(list, sortField, sortDir, lang);
  }, [
    files,
    searchQuery,
    effectiveQuery,
    effectiveFavOnly,
    inlineTypeFilter,
    inlineLevelFilter,
    inlineSubjectFilter,
    sortField,
    sortDir,
    lang,
  ]);

  const slicedFiles = useMemo(
    () => filteredAndSorted.slice(0, visibleLimit),
    [filteredAndSorted, visibleLimit]
  );

  // Optional Grouping
  const groupedSections = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', items: slicedFiles }];
    }
    const groups = new Map<string, { label: string; items: FileRecord[] }>();
    for (const f of slicedFiles) {
      let key = '';
      let label = '';
      if (groupBy === 'level') {
        key = f.levelCode || '_none';
        label = f.levelCode || '--';
      } else if (groupBy === 'subject') {
        key = f.subjectId || '_none';
        const sub = f.subjectId ? subjectMap.get(f.subjectId) : undefined;
        label = sub ? pickLocalized(sub.names) : '--';
      } else if (groupBy === 'type') {
        const cat = f.fileCategory || detectFileCategory(f.mimeType, f.extension, f.externalUrl);
        key = cat;
        label = cat.toUpperCase();
      } else {
        key = f.createdAt.slice(0, 7);
        label = key;
      }
      const bucket = groups.get(key) ?? { label, items: [] };
      bucket.items.push(f);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries()).map(([key, v]) => ({ key, ...v }));
  }, [slicedFiles, groupBy, subjectMap, pickLocalized]);

  const inlineFilterBadge =
    (inlineTypeFilter !== 'all' ? 1 : 0) +
    (inlineLevelFilter !== 'all' ? 1 : 0) +
    (inlineSubjectFilter !== 'all' ? 1 : 0);
  const totalFilterBadge = activeFiltersCount + inlineFilterBadge;

  const showToast = (toast: typeof undoToast) => {
    setUndoToast(toast);
    window.setTimeout(() => {
      setUndoToast((curr) => (curr === toast ? null : curr));
    }, 4500);
  };

  const handleOpen = async (f: FileRecord) => {
    if (selectMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(f.id)) next.delete(f.id);
        else next.add(f.id);
        return next;
      });
      return;
    }
    await services.files.markOpened(f.id);
    const hit = hitsByFileId?.get(f.id);
    onOpenFile(f, hit?.contentMatch?.page ?? f.lastReadPage ?? undefined);
  };

  const handleCardTouchStart = (f: FileRecord, e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const timer = window.setTimeout(() => {
      setSelectMode(true);
      setSelectedIds((prev) => new Set(prev).add(f.id));
      setLongPressTitleBanner(getFileTitle(f));
    }, 480);
    touchStartRef.current = {
      id: f.id,
      x: touch.clientX,
      y: touch.clientY,
      timer,
      moved: false,
    };
  };

  const handleCardTouchMove = (f: FileRecord, e: React.TouchEvent, allowSwipe: boolean) => {
    const st = touchStartRef.current;
    const touch = e.touches[0];
    if (!st || !touch || st.id !== f.id) return;
    const dx = touch.clientX - st.x;
    const dy = touch.clientY - st.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      if (st.timer) {
        clearTimeout(st.timer);
        st.timer = null;
      }
      st.moved = true;
    }
    if (allowSwipe && !selectMode && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 16) {
      setSwipeState({ id: f.id, dx: Math.max(-110, Math.min(110, dx)) });
    }
  };

  const handleCardTouchEnd = async (f: FileRecord) => {
    const st = touchStartRef.current;
    if (st?.timer) clearTimeout(st.timer);
    touchStartRef.current = null;

    if (swipeState && swipeState.id === f.id) {
      const dx = swipeState.dx;
      setSwipeState(null);
      const isTowardStart = dir === 'rtl' ? dx > 70 : dx < -70;
      const isTowardEnd = dir === 'rtl' ? dx < -70 : dx > 70;

      if (isTowardStart) {
        await services.files.toggleFavorite(f.id);
        await onChanged();
        showToast({
          message: t.library.swipedFavorited,
          fileId: f.id,
          undoKind: 'favorite',
        });
      } else if (isTowardEnd && canWrite) {
        await services.files.deleteFile(f.id);
        await onChanged();
        showToast({
          message: t.library.swipedDeleted,
          fileId: f.id,
          undoKind: 'trash',
        });
      }
    }
  };

  const handleDownloadFile = (f: FileRecord) => {
    if (f.externalUrl) {
      navigator.clipboard?.writeText(f.externalUrl).catch(() => {});
      onOpenFile(f);
      return;
    }
    if (!f.blob) return;
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.originalFileName || `${getFileTitle(f)}.${f.extension || 'bin'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShareFile = async (f: FileRecord) => {
    if (f.externalUrl && navigator.share) {
      await navigator.share({ title: getFileTitle(f), url: f.externalUrl }).catch(() => {});
      return;
    }
    if (f.blob && navigator.share) {
      const shareObj = new File([f.blob], f.originalFileName || f.name, { type: f.mimeType });
      if (navigator.canShare && navigator.canShare({ files: [shareObj] })) {
        await navigator.share({ title: getFileTitle(f), files: [shareObj] }).catch(() => {});
        return;
      }
    }
    handleDownloadFile(f);
  };

  const renderMetaChips = (f: FileRecord, compactGrid = false) => {
    const extBadge = getExtensionBadge(f);
    const subj = f.subjectId ? subjectMap.get(f.subjectId) : undefined;
    const shortDate = formatShortDate(f.createdAt, lang);
    const sizeText = formatFileSize(f.size);

    return (
      <div className="mt-1 flex flex-wrap items-center gap-1 min-w-0">
        {!compactGrid && (
          <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-background)] border border-[var(--color-border)] text-[10px] font-extrabold text-[var(--color-text)] uppercase shrink-0">
            {extBadge}
          </span>
        )}
        <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-background)] border border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
          {sizeText}
        </span>
        <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-background)] border border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
          {shortDate}
        </span>
        {subj && (
          <span
            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap max-w-[120px] truncate"
            style={{
              backgroundColor: `${subj.color}1F`,
              color: subj.color,
            }}
          >
            {pickLocalized(subj.names)}
          </span>
        )}
        {f.levelCode && (
          <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] text-[10px] font-extrabold whitespace-nowrap">
            {f.levelCode}
          </span>
        )}
      </div>
    );
  };

  const renderPdfProgressLine = (f: FileRecord) => {
    const isPdf = f.fileCategory === 'pdf' || f.extension.toLowerCase() === 'pdf';
    if (!isPdf || !f.pageCount) return null;
    const readPage = f.lastReadPage && f.lastReadPage > 1 ? Math.min(f.lastReadPage, f.pageCount) : 0;
    const pct = readPage > 0 ? Math.min(100, Math.round((readPage / f.pageCount) * 100)) : 0;
    return (
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center justify-between text-[10px] font-semibold text-[var(--color-text-muted)] tabular-nums">
          <span>
            {f.pageCount} {t.library.pagesLabel}
          </span>
          {readPage > 0 && (
            <span className="text-[var(--color-primary)] font-bold">
              {t.library.lastPageRead}: {readPage}/{f.pageCount}
            </span>
          )}
        </div>
        {readPage > 0 && (
          <div className="h-1 rounded-full bg-[var(--color-background)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary)] rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 min-w-0 max-w-full">
      {/* Sticky Responsive Toolbar (never overflows 360px/412px) */}
      <div className="sticky top-[84px] z-20 -mx-1 px-1 py-2 bg-[var(--color-background)]/95 backdrop-blur-md space-y-2">
        {/* Row 1: Full-width search input */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3.5" />
          <input
            type="text"
            value={effectiveQuery}
            onChange={(e) => setEffectiveQuery(e.target.value)}
            placeholder={t.files.searchFiles}
            className="w-full min-h-[44px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] ps-10 pe-9 text-xs font-semibold text-[var(--color-text)]"
          />
          {effectiveQuery && (
            <button
              type="button"
              onClick={() => setEffectiveQuery('')}
              aria-label={t.common.close}
              className="absolute top-1/2 -translate-y-1/2 end-2 min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Row 2: Sort + View Mode Toggle + Filter Button + Result Counter on ONE compact row */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-x-auto no-scrollbar">
            <select
              value={`${sortField}:${sortDir}`}
              onChange={(e) => {
                const [f, d] = e.target.value.split(':') as [LibrarySortField, 'asc' | 'desc'];
                setSortField(f);
                setSortDir(d);
              }}
              aria-label={t.library.sortCreatedAt}
              className="min-h-[40px] max-w-[132px] px-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-bold text-[var(--color-text)] shrink-0"
            >
              <option value="createdAt:desc">{t.library.sortCreatedAt}</option>
              <option value="name:asc">{t.library.sortName}</option>
              <option value="size:desc">{t.library.sortSize}</option>
              <option value="lastOpenedAt:desc">{t.library.sortLastOpened}</option>
              <option value="openCount:desc">{t.library.sortOpenCount}</option>
              <option value="type:asc">{t.library.sortType}</option>
            </select>

            {/* View mode 3-way toggle */}
            <div className="inline-flex items-center p-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
              {(
                [
                  { id: 'grid', Icon: LayoutGrid, title: t.library.viewGrid },
                  { id: 'detailed', Icon: List, title: t.library.viewDetailed },
                  { id: 'compact', Icon: Rows3, title: t.library.viewCompact },
                ] as const
              ).map(({ id, Icon, title }) => (
                <button
                  key={id}
                  type="button"
                  title={title}
                  aria-label={title}
                  onClick={() => handleChangeViewMode(id)}
                  className={`min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center transition-colors ${
                    viewMode === id
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            {/* Filter Button */}
            <button
              type="button"
              onClick={() => {
                if (onToggleFiltersDrawer) onToggleFiltersDrawer();
                else setShowInlineFilters((v) => !v);
              }}
              aria-label={t.library.filters}
              className={`min-h-[40px] px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 shrink-0 ${
                totalFilterBadge > 0 || showInlineFilters
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              {totalFilterBadge > 0 && <span className="tabular-nums">{totalFilterBadge}</span>}
            </button>

            {/* Favorites chip */}
            <button
              type="button"
              onClick={toggleFavOnly}
              aria-label={t.common.favorites}
              className={`min-h-[40px] px-2.5 rounded-xl border text-[11px] font-bold inline-flex items-center gap-1 shrink-0 ${
                effectiveFavOnly
                  ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${effectiveFavOnly ? 'fill-current' : ''}`} />
              <span className="hidden xs:inline">{t.common.favorites}</span>
            </button>
          </div>

          {/* Result counter */}
          <span className="text-[11px] font-extrabold text-[var(--color-text-muted)] tabular-nums shrink-0 whitespace-nowrap">
            {filteredAndSorted.length} {t.common.filesCount}
          </span>
        </div>

        {/* Inline compact filter + group bar when expanded */}
        {showInlineFilters && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <select
              value={inlineLevelFilter}
              onChange={(e) => setInlineLevelFilter(e.target.value as MiddleSchoolLevel | 'all')}
              className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-semibold"
            >
              <option value="all">{t.library.browseLevel}: {t.common.all}</option>
              <option value="1M">1M</option>
              <option value="2M">2M</option>
              <option value="3M">3M</option>
              <option value="4M">4M</option>
            </select>
            <select
              value={inlineSubjectFilter}
              onChange={(e) => setInlineSubjectFilter(e.target.value)}
              className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-semibold"
            >
              <option value="all">{t.library.browseSubject}: {t.common.all}</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {pickLocalized(sub.names)}
                </option>
              ))}
            </select>
            <select
              value={inlineTypeFilter}
              onChange={(e) => setInlineTypeFilter(e.target.value as FileTypeCategory | 'all')}
              className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-semibold"
            >
              <option value="all">{t.library.browseType}: {t.common.all}</option>
              <option value="pdf">PDF</option>
              <option value="word">Word</option>
              <option value="excel">Excel</option>
              <option value="ppt">PPT</option>
              <option value="image">Image</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </select>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as LibraryGroupBy)}
              className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-semibold"
            >
              <option value="none">{t.library.groupNone}</option>
              <option value="level">{t.library.groupLevel}</option>
              <option value="subject">{t.library.groupSubject}</option>
              <option value="type">{t.library.groupType}</option>
              <option value="month">{t.library.groupMonth}</option>
            </select>
          </div>
        )}

        {/* Optional compact slot for Section Upload / Add Subfolder buttons */}
        {toolbarActionsSlot && <div className="pt-0.5">{toolbarActionsSlot}</div>}

        {/* Full Title Callout when Long-Pressing a File */}
        {longPressTitleBanner && (
          <div className="rounded-2xl bg-[var(--color-primary-light)] border border-[var(--color-primary)]/30 px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[var(--color-text)] break-words">
              {longPressTitleBanner}
            </span>
            <button
              type="button"
              onClick={() => setLongPressTitleBanner(null)}
              className="min-h-[32px] min-w-[32px] flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-52 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Main Content */}
      {!loading && filteredAndSorted.length === 0 && <EmptyState title={t.common.noFiles} />}

      {!loading &&
        filteredAndSorted.length > 0 &&
        groupedSections.map((grp) => (
          <div key={grp.key} className="space-y-2.5">
            {grp.label && (
              <div className="px-1 text-xs font-extrabold text-[var(--color-primary)] uppercase">
                {grp.label} ({grp.items.length})
              </div>
            )}

            {/* VIEW 1: GRID WITH COVERS (Default 2 columns on mobile) */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {grp.items.map((f) => {
                  const selected = selectedIds.has(f.id);
                  const hit = hitsByFileId?.get(f.id);
                  return (
                    <div
                      key={f.id}
                      onTouchStart={(e) => handleCardTouchStart(f, e)}
                      onTouchMove={(e) => handleCardTouchMove(f, e, false)}
                      onTouchEnd={() => handleCardTouchEnd(f)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setLongPressTitleBanner(getFileTitle(f));
                        setMenuFile(f);
                      }}
                      className={`group rounded-2xl bg-[var(--color-surface)] border overflow-hidden flex flex-col transition-all ${
                        selected
                          ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/40'
                          : 'border-[var(--color-border)]'
                      }`}
                    >
                      {/* Cover container */}
                      <div className="relative h-36 sm:h-40 w-full overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleOpen(f)}
                          className="w-full h-full block text-start"
                        >
                          <LazyCoverImage file={f} compactIconSize="w-9 h-9" />
                        </button>

                        {/* Top-start corner: Type badge + optional select checkbox */}
                        <div className="absolute top-2 start-2 flex items-center gap-1 pointer-events-none">
                          {selectMode && (
                            <span
                              className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                                selected
                                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                                  : 'bg-white/90 border-slate-300'
                              }`}
                            >
                              {selected && <Check className="w-3.5 h-3.5" />}
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-extrabold tracking-wide backdrop-blur-sm">
                            {getExtensionBadge(f)}
                          </span>
                        </div>

                        {/* Top-end corner: Star favorite + Menu trigger */}
                        <div className="absolute top-1.5 end-1.5 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              await services.files.toggleFavorite(f.id);
                              await onChanged();
                            }}
                            aria-label={t.common.favorites}
                            className="w-8 h-8 rounded-full bg-white/85 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center shadow-sm"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                f.isFavorite
                                  ? 'fill-amber-400 text-amber-500'
                                  : 'text-slate-500 dark:text-slate-300'
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuFile(f);
                            }}
                            aria-label={t.common.actions}
                            className="w-8 h-8 rounded-full bg-white/85 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center text-slate-700 dark:text-slate-200 shadow-sm"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Bottom corner indicator for Pin / QR */}
                        {(f.pinned || f.hasQrMap) && (
                          <div className="absolute bottom-1.5 start-2 flex items-center gap-1 pointer-events-none">
                            {f.pinned && (
                              <span className="p-1 rounded-md bg-[var(--color-primary)] text-white">
                                <Pin className="w-2.5 h-2.5" />
                              </span>
                            )}
                            {f.hasQrMap && (
                              <span className="p-1 rounded-md bg-slate-900/75 text-white">
                                <QrCode className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Title + Single Compact Meta Row */}
                      <button
                        type="button"
                        onClick={() => handleOpen(f)}
                        className="flex-1 p-2.5 text-start flex flex-col justify-between min-w-0"
                      >
                        <div className="text-[13px] font-bold text-[var(--color-text)] leading-snug line-clamp-2 break-words">
                          {getFileTitle(f)}
                        </div>
                        <div className="mt-1">
                          {renderMetaChips(f, true)}
                          {renderPdfProgressLine(f)}
                          {hit?.contentMatch && (
                            <div className="mt-1 text-[10px] font-bold text-[var(--color-primary)] truncate">
                              {t.library.pageBadge} {hit.contentMatch.page}: {hit.contentMatch.snippet}
                            </div>
                          )}
                          {hit?.isScannedUnsearchable && (
                            <div className="mt-1 text-[10px] font-bold text-amber-600 flex items-center gap-1 truncate">
                              <ScanText className="w-3 h-3 shrink-0" />
                              <span className="truncate">{t.library.notSearchable}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW 2: DETAILED LIST (56x72 cover on start, full width title 2 lines, 1 meta row, single ⋮ menu) */}
            {viewMode === 'detailed' && (
              <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
                {grp.items.map((f) => {
                  const selected = selectedIds.has(f.id);
                  const hit = hitsByFileId?.get(f.id);
                  const linkedSol = f.linkedSolutionFileId
                    ? fileMap.get(f.linkedSolutionFileId)
                    : undefined;
                  const dx = swipeState?.id === f.id ? swipeState.dx : 0;

                  return (
                    <div
                      key={f.id}
                      onTouchStart={(e) => handleCardTouchStart(f, e)}
                      onTouchMove={(e) => handleCardTouchMove(f, e, true)}
                      onTouchEnd={() => handleCardTouchEnd(f)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setLongPressTitleBanner(getFileTitle(f));
                        setMenuFile(f);
                      }}
                      style={{
                        transform: dx ? `translateX(${dx}px)` : undefined,
                      }}
                      className={`p-3 transition-transform ${
                        selected ? 'bg-[var(--color-primary-light)]/50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {selectMode && (
                          <button
                            type="button"
                            onClick={() => handleOpen(f)}
                            className={`mt-5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              selected
                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                                : 'border-[var(--color-border)]'
                            }`}
                          >
                            {selected && <Check className="w-3.5 h-3.5" />}
                          </button>
                        )}

                        {/* Small cover 56x72px on start side */}
                        <button
                          type="button"
                          onClick={() => handleOpen(f)}
                          className="relative w-[56px] h-[72px] rounded-xl border border-[var(--color-border)] overflow-hidden shrink-0"
                        >
                          <LazyCoverImage file={f} compactIconSize="w-6 h-6" />
                          {f.isFavorite && (
                            <span className="absolute top-1 end-1 w-5 h-5 rounded-full bg-white/90 dark:bg-slate-900/90 flex items-center justify-center shadow-sm">
                              <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                            </span>
                          )}
                        </button>

                        {/* Main text column takes ALL remaining width */}
                        <button
                          type="button"
                          onClick={() => handleOpen(f)}
                          className="flex-1 min-w-0 text-start"
                        >
                          <div className="text-sm font-bold text-[var(--color-text)] leading-snug line-clamp-2 break-words">
                            {getFileTitle(f)}
                          </div>

                          {renderMetaChips(f, false)}
                          {renderPdfProgressLine(f)}

                          {hit?.contentMatch && (
                            <div className="mt-1.5 rounded-lg bg-[var(--color-primary-light)]/60 px-2 py-1 text-[11px] text-[var(--color-text)] line-clamp-2">
                              <span className="font-extrabold text-[var(--color-primary)] me-1">
                                {t.library.pageBadge} {hit.contentMatch.page}:
                              </span>
                              <span>{hit.contentMatch.snippet}</span>
                            </div>
                          )}

                          {hit?.isScannedUnsearchable && (
                            <div className="mt-1 text-[11px] font-bold text-amber-600 inline-flex items-center gap-1">
                              <ScanText className="w-3.5 h-3.5" />
                              <span>{t.library.notSearchable}</span>
                            </div>
                          )}
                        </button>

                        {/* Single ⋮ button on end side (48px target) */}
                        <button
                          type="button"
                          onClick={() => setMenuFile(f)}
                          aria-label={t.common.actions}
                          className="min-h-[48px] min-w-[44px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </div>

                      {showSolutionSupport && (
                        <div className="mt-2 ps-[68px] flex flex-wrap items-center gap-2">
                          {linkedSol ? (
                            <button
                              type="button"
                              onClick={() => handleOpen(linkedSol)}
                              className="min-h-[34px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t.sections.showSolution}</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-[var(--color-text-muted)]">
                              {t.sections.noSolutionLinked}
                            </span>
                          )}
                          {canWrite && files.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setLinkSolutionTarget(f)}
                              className="min-h-[34px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                              <span>{t.sections.linkSolution}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* VIEW 3: COMPACT LIST (1 line: icon + title + size + ⋮) */}
            {viewMode === 'compact' && (
              <div className="divide-y divide-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
                {grp.items.map((f) => {
                  const selected = selectedIds.has(f.id);
                  const dx = swipeState?.id === f.id ? swipeState.dx : 0;
                  return (
                    <div
                      key={f.id}
                      onTouchStart={(e) => handleCardTouchStart(f, e)}
                      onTouchMove={(e) => handleCardTouchMove(f, e, true)}
                      onTouchEnd={() => handleCardTouchEnd(f)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setLongPressTitleBanner(getFileTitle(f));
                        setMenuFile(f);
                      }}
                      style={{
                        transform: dx ? `translateX(${dx}px)` : undefined,
                      }}
                      className={`min-h-[48px] px-3 py-1.5 flex items-center gap-2.5 min-w-0 ${
                        selected ? 'bg-[var(--color-primary-light)]/50' : ''
                      }`}
                    >
                      {selectMode && (
                        <button
                          type="button"
                          onClick={() => handleOpen(f)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                              : 'border-[var(--color-border)]'
                          }`}
                        >
                          {selected && <Check className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpen(f)}
                        className="w-8 h-8 rounded-lg overflow-hidden shrink-0"
                      >
                        <LazyCoverImage file={f} compactIconSize="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpen(f)}
                        className="flex-1 min-w-0 text-start flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-bold text-[var(--color-text)] truncate">
                          {getFileTitle(f)}
                        </span>
                        <span className="text-[11px] font-semibold text-[var(--color-text-muted)] tabular-nums shrink-0">
                          {formatFileSize(f.size)}
                        </span>
                      </button>
                      {f.isFavorite && (
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => setMenuFile(f)}
                        aria-label={t.common.actions}
                        className="min-h-[42px] min-w-[38px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

      {/* Progressive Infinite Lazy Sentinel */}
      {slicedFiles.length < filteredAndSorted.length && (
        <div ref={sentinelRef} className="py-4 text-center text-xs font-bold text-[var(--color-text-muted)]">
          {t.common.loading}
        </div>
      )}

      {/* Multi-Select Bottom Action Bar */}
      {selectMode && (
        <div className="fixed bottom-20 inset-x-3 z-40 mx-auto max-w-2xl rounded-2xl bg-slate-900 text-white p-3 shadow-2xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => {
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
              className="min-h-[36px] min-w-[36px] rounded-lg bg-white/10 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="tabular-nums">
              {selectedIds.size} {t.library.selectedCount}
            </span>
            <button
              type="button"
              onClick={() =>
                setSelectedIds(
                  selectedIds.size === filteredAndSorted.length
                    ? new Set()
                    : new Set(filteredAndSorted.map((f) => f.id))
                )
              }
              className="text-[11px] underline text-sky-300"
            >
              {selectedIds.size === filteredAndSorted.length
                ? t.library.deselectAll
                : t.library.selectAll}
            </button>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {canWrite && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.library.bulkUpdateMetadata(Array.from(selectedIds), {
                        isFavorite: true,
                      });
                      await onChanged();
                    }}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkMetaOpen(true)}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{t.common.edit}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkTagOpen(true)}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                  {sections.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMoveTargets(Array.from(selectedIds));
                        setMoveSectionId(sections[0]?.id ?? '');
                      }}
                      className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setCollectionTargetIds(Array.from(selectedIds))}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <FolderHeart className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.library.bulkArchive(Array.from(selectedIds), true);
                      setSelectMode(false);
                      setSelectedIds(new Set());
                      await onChanged();
                    }}
                    className="min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={async () => {
                  const chosen = files.filter((f) => selectedIds.has(f.id));
                  const zipBlob = await services.library.exportFilesZip(chosen);
                  const url = URL.createObjectURL(zipBlob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `selected_files_${new Date().toISOString().slice(0, 10)}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[36px] px-2.5 rounded-lg bg-sky-600 text-[11px] font-bold inline-flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ZIP</span>
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={async () => {
                    await services.library.bulkTrash(Array.from(selectedIds));
                    setSelectMode(false);
                    setSelectedIds(new Set());
                    await onChanged();
                  }}
                  className="min-h-[36px] px-2.5 rounded-lg bg-red-600 text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Undo Snackbar after Swipe */}
      {undoToast && (
        <div className="fixed bottom-24 inset-x-4 z-40 mx-auto max-w-md rounded-2xl bg-slate-900 text-white px-4 py-3 shadow-xl flex items-center justify-between gap-3">
          <span className="text-xs font-bold">{undoToast.message}</span>
          {undoToast.fileId && (
            <button
              type="button"
              onClick={async () => {
                const fid = undoToast.fileId!;
                if (undoToast.undoKind === 'trash') {
                  await services.archive.restoreFromTrash(fid);
                } else if (undoToast.undoKind === 'favorite') {
                  await services.files.toggleFavorite(fid);
                } else if (undoToast.undoKind === 'archive') {
                  await services.archive.restoreArchivedFile(fid);
                }
                setUndoToast(null);
                await onChanged();
              }}
              className="min-h-[34px] px-3 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{t.library.undoAction}</span>
            </button>
          )}
        </div>
      )}

      {/* Single "⋮" Button Bottom Sheet */}
      {menuFile && (
        <div
          onClick={() => setMenuFile(null)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[88dvh] overflow-auto rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 pb-6 space-y-2 shadow-2xl"
          >
            <div className="mx-auto w-10 h-1 rounded-full bg-[var(--color-border)] mb-2" />
            <div className="px-2 pb-2 border-b border-[var(--color-border)] flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-[var(--color-text)] break-words">
                  {getFileTitle(menuFile)}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums mt-0.5">
                  {getExtensionBadge(menuFile)} · {formatFileSize(menuFile.size)} ·{' '}
                  {formatShortDate(menuFile.createdAt, lang)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuFile(null)}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  const f = menuFile;
                  setMenuFile(null);
                  handleOpen(f);
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <ExternalLink className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.common.open}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const id = menuFile.id;
                  setMenuFile(null);
                  await services.files.toggleFavorite(id);
                  await onChanged();
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Star
                  className={`w-4 h-4 ${
                    menuFile.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-[var(--color-text-muted)]'
                  }`}
                />
                <span>{t.common.favorites}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  const id = menuFile.id;
                  setMenuFile(null);
                  await services.files.togglePin(id);
                  await onChanged();
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Pin className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{menuFile.pinned ? t.common.unpin : t.common.pin}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const f = menuFile;
                  setMenuFile(null);
                  onOpenDetails(f);
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Edit3 className="w-4 h-4 text-[var(--color-primary)]" />
                <span>
                  {t.common.rename} / {t.library.fileDetails}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const f = menuFile;
                  setMenuFile(null);
                  onOpenDetails(f);
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Tag className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.common.tags}</span>
              </button>

              {canWrite && sections.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMoveTargets([menuFile.id]);
                    setMoveSectionId(menuFile.sectionId);
                    setMenuFile(null);
                  }}
                  className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <FolderInput className="w-4 h-4 text-[var(--color-primary)]" />
                  <span>{t.common.move}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const id = menuFile.id;
                  setMenuFile(null);
                  setCollectionTargetIds([id]);
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <FolderHeart className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.library.addToCollection}</span>
              </button>

              {showSolutionSupport && canWrite && files.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const f = menuFile;
                    setMenuFile(null);
                    setLinkSolutionTarget(f);
                  }}
                  className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{t.sections.linkSolution}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const f = menuFile;
                  setMenuFile(null);
                  handleShareFile(f);
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Share2 className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.common.share}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const f = menuFile;
                  setMenuFile(null);
                  handleDownloadFile(f);
                }}
                className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Download className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.common.download}</span>
              </button>

              {canWrite && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const f = menuFile;
                      setMenuFile(null);
                      if (getFileStatus(f) === 'archived') {
                        await services.archive.restoreArchivedFile(f.id);
                      } else {
                        await services.archive.archiveFile(f.id);
                      }
                      await onChanged();
                    }}
                    className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-[var(--color-text)] hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <Archive className="w-4 h-4 text-amber-600" />
                    <span>
                      {getFileStatus(menuFile) === 'archived'
                        ? t.library.restoreFromArchive
                        : t.library.archiveFile}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const f = menuFile;
                      setMenuFile(null);
                      setDeleteTarget(f);
                    }}
                    className="w-full min-h-[48px] px-3 rounded-2xl flex items-center gap-3 text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{t.common.delete}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t.common.delete}
        message={t.files.confirmDeleteFile}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await services.files.deleteFile(deleteTarget.id);
          setDeleteTarget(null);
          await onChanged();
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Move to section modal (single or bulk) */}
      {moveTargets.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!moveSectionId) return;
              for (const id of moveTargets) {
                await services.files.moveFile(id, moveSectionId);
              }
              setMoveTargets([]);
              setSelectMode(false);
              setSelectedIds(new Set());
              await onChanged();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-4"
          >
            <h3 className="text-sm font-bold">{t.files.moveFile}</h3>
            <select
              value={moveSectionId}
              onChange={(e) => setMoveSectionId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {pickLocalized(s.names)}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveTargets([])}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.move}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Tags Modal */}
      {bulkTagOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!bulkTagInput.trim()) return;
              await services.library.bulkUpdateMetadata(Array.from(selectedIds), {
                addTags: [bulkTagInput.trim()],
              });
              setBulkTagInput('');
              setBulkTagOpen(false);
              await onChanged();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-4"
          >
            <h3 className="text-sm font-bold">{t.common.tags}</h3>
            <input
              type="text"
              required
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder={t.common.addTag}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkTagOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.add}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Level & Subject Metadata Modal */}
      {bulkMetaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await services.library.bulkUpdateMetadata(Array.from(selectedIds), {
                ...(bulkLevel ? { levelCode: bulkLevel } : {}),
                ...(bulkSubjectId ? { subjectId: bulkSubjectId } : {}),
              });
              setBulkMetaOpen(false);
              await onChanged();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-3.5"
          >
            <h3 className="text-sm font-bold">{t.library.bulkActions}</h3>
            <select
              value={bulkLevel}
              onChange={(e) => setBulkLevel(e.target.value as MiddleSchoolLevel | '')}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
            >
              <option value="">{t.library.browseLevel}: --</option>
              <option value="1M">1M</option>
              <option value="2M">2M</option>
              <option value="3M">3M</option>
              <option value="4M">4M</option>
            </select>
            <select
              value={bulkSubjectId}
              onChange={(e) => setBulkSubjectId(e.target.value)}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
            >
              <option value="">{t.library.browseSubject}: --</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {pickLocalized(sub.names)}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkMetaOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Link Solution Modal (Section 3 Exams) */}
      {linkSolutionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-3">
            <h3 className="text-sm font-bold">{t.sections.selectSolutionFile}</h3>
            <div className="max-h-60 overflow-auto divide-y divide-[var(--color-border)]">
              {files
                .filter((cand) => cand.id !== linkSolutionTarget.id)
                .map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={async () => {
                      await services.files.linkSolution(linkSolutionTarget.id, cand.id);
                      setLinkSolutionTarget(null);
                      await onChanged();
                    }}
                    className="w-full py-2.5 px-2 text-start text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 truncate"
                  >
                    {getFileTitle(cand)}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setLinkSolutionTarget(null)}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] text-xs font-bold"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

      <AddToCollectionModal
        open={collectionTargetIds.length > 0}
        ctx={ctx}
        fileIds={collectionTargetIds}
        onClose={() => setCollectionTargetIds([])}
        onChanged={onChanged}
      />
    </div>
  );
};
