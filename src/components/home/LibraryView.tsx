import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Clock,
  Folder,
  FolderHeart,
  HardDrive,
  Home,
  Pin,
  Plus,
  Search,
  Sliders,
  Sparkles,
  Star,
  Tag,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { getFileTitle } from '@/src/services/FilesService';
import type { SearchFacets, SearchFileHit } from '@/src/services/SearchService';
import type {
  AcademicYearRecord,
  FileRecord,
  FileTypeCategory,
  LibraryCollectionRecord,
  LibrarySearchFilters,
  MiddleSchoolLevel,
  SavedSearchRecord,
  SectionNode,
  SmartCollectionConfig,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { formatFileSize, getExtensionBadge } from '@/src/utils/fileFormat';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';
import { EmptyState } from '@/src/components/common/EmptyState';
import { FileUploadBar } from '@/src/components/files/FileUploadBar';
import { ArchiveAndStorageView } from '@/src/components/library/ArchiveAndStorageView';
import {
  CollectionDetailModal,
  CreateCollectionModal,
  SmartRulesModal,
} from '@/src/components/library/CollectionModals';
import { TagManagerModal } from '@/src/components/library/TagManagerModal';
import { VirtualizedFileBrowser } from '@/src/components/library/VirtualizedFileBrowser';

interface LibraryViewProps {
  ctx?: ServiceContext;
  user?: UserRecord;
  academicYearId: string;
  sections: SectionNode[];
  subjects?: SubjectRecord[];
  years?: AcademicYearRecord[];
  canWrite?: boolean;
  initialSubTab?: 'home' | 'browse' | 'collections' | 'archive';
  initialSearchQuery?: string;
  initialFilters?: LibrarySearchFilters;
  onSelectSection: (sec: SectionNode) => void;
  onOpenFile: (file: FileRecord, initialPage?: number) => void;
  onOpenDetails?: (file: FileRecord) => void;
  onOpenSearch?: () => void;
  onChanged?: () => void;
}

const LEVELS: MiddleSchoolLevel[] = ['1M', '2M', '3M', '4M'];
const TYPE_CATEGORIES: FileTypeCategory[] = [
  'pdf',
  'word',
  'excel',
  'ppt',
  'image',
  'audio',
  'video',
  'other',
];

export const LibraryView: React.FC<LibraryViewProps> = ({
  ctx: propCtx,
  user: propUser,
  academicYearId,
  sections,
  subjects: propSubjects = [],
  years: propYears = [],
  canWrite = true,
  initialSubTab,
  initialSearchQuery,
  initialFilters,
  onSelectSection,
  onOpenFile,
  onOpenDetails,
  onOpenSearch,
  onChanged,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [subTab, setSubTab] = useState<'home' | 'browse' | 'collections' | 'archive'>(
    initialSubTab || 'home'
  );
  const [refreshTick, setRefreshTick] = useState(0);

  // Fallback auth/years/all-sections if caller passes minimal props
  const [fallbackUser, setFallbackUser] = useState<UserRecord | null>(propUser ?? null);
  const [allSections, setAllSections] = useState<SectionNode[]>(sections);
  const [years, setYears] = useState<AcademicYearRecord[]>(propYears);
  const [subjects, setSubjects] = useState<SubjectRecord[]>(propSubjects);

  // Home data
  const [allFiles, setAllFiles] = useState<FileRecord[]>([]);
  const [continueReading, setContinueReading] = useState<FileRecord[]>([]);
  const [pinnedFiles, setPinnedFiles] = useState<FileRecord[]>([]);
  const [favorites, setFavorites] = useState<FileRecord[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<FileRecord[]>([]);
  const [recentlyOpened, setRecentlyOpened] = useState<FileRecord[]>([]);
  const [smartConfigs, setSmartConfigs] = useState<SmartCollectionConfig[]>([]);
  const [collections, setCollections] = useState<LibraryCollectionRecord[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearchRecord[]>([]);

  // Browse / Search state
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [filters, setFilters] = useState<LibrarySearchFilters>(initialFilters || {});
  const [yearScopeAll, setYearScopeAll] = useState(false);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [browseHits, setBrowseHits] = useState<SearchFileHit[]>([]);
  const [facets, setFacets] = useState<SearchFacets | null>(null);
  const [activeSmartFiles, setActiveSmartFiles] = useState<{
    title: string;
    files: FileRecord[];
  } | null>(null);
  const [savedSearchToast, setSavedSearchToast] = useState('');

  // Modals
  const [showTagManager, setShowTagManager] = useState(false);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [showSmartRules, setShowSmartRules] = useState(false);
  const [activeCollection, setActiveCollection] = useState<LibraryCollectionRecord | null>(null);
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadTargetSectionId, setUploadTargetSectionId] = useState('');
  const triggerLibraryUploadRef = useRef<(() => void) | null>(null);

  const ctx: ServiceContext = propCtx ?? {
    ownerId: propUser?.id || fallbackUser?.id || 'teacher',
    schoolId: propUser?.schoolId || fallbackUser?.schoolId || 'school_default',
    academicYearId,
  };

  const activeUser: UserRecord = propUser ??
    fallbackUser ?? {
      id: ctx.ownerId,
      username: 'teacher',
      displayName: '',
      subjectSpecialty: '',
      passwordHash: '',
      passwordSalt: '',
      role: canWrite ? 'primary_admin' : 'teacher_read',
      assignedClasses: [],
      sectionPermissions: {},
      isOnlineSimulated: false,
      lastSeenAt: '',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId,
    };

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
      if (initialSearchQuery) setSubTab('browse');
    }
  }, [initialSearchQuery]);

  useEffect(() => {
    if (initialFilters !== undefined) {
      setFilters(initialFilters);
    }
  }, [initialFilters]);

  useEffect(() => {
    if (!propUser) {
      services.auth.getCurrentUser().then((u) => {
        if (u) setFallbackUser(u);
      });
    }
    services.sections.getAllForYear(academicYearId).then((all) => {
      if (all.length > 0) setAllSections(all);
      else setAllSections(sections);
    });
    if (propYears.length === 0) {
      services.school.getActiveSchool().then((sch) => {
        if (sch) services.years.listYears(sch.id).then(setYears);
      });
    } else {
      setYears(propYears);
    }
    if (propSubjects.length === 0) {
      services.subjects
        .listForTeacher(academicYearId, activeUser.id, false)
        .then(setSubjects);
    } else {
      setSubjects(propSubjects);
    }
  }, [academicYearId, propUser, propYears, propSubjects, sections]);

  const reloadAll = () => {
    setRefreshTick((n) => n + 1);
    onChanged?.();
  };

  useEffect(() => {
    Promise.all([
      services.library.getAccessibleFiles({ user: activeUser, academicYearId }),
      services.files.listContinueReading(academicYearId, 8),
      services.files.listPinned(academicYearId),
      services.files.listFavorites(academicYearId),
      services.files.listAllForYear(academicYearId),
      services.files.listRecentlyOpened(academicYearId, 10),
      services.library.getSmartCollectionConfigs(academicYearId),
      services.library.listCollections(academicYearId),
      services.search.listSavedSearches(academicYearId),
    ]).then(([accessible, cont, pin, fav, allYr, rec, smart, cols, saved]) => {
      setAllFiles(accessible);
      setContinueReading(cont);
      setPinnedFiles(pin);
      setFavorites(fav);
      setRecentlyAdded(
        [...allYr].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
      );
      setRecentlyOpened(rec);
      setSmartConfigs(smart);
      setCollections(cols);
      setSavedSearches(saved);
    });
  }, [academicYearId, activeUser.id, refreshTick]);

  // Execute Browse search/facet query
  useEffect(() => {
    const scopeYear =
      yearScopeAll || filters.yearId === 'all'
        ? 'all'
        : filters.yearId || academicYearId;
    services.search
      .searchLibrary({
        user: activeUser,
        academicYearId: scopeYear,
        query: searchQuery,
        filters,
        lang,
      })
      .then((res) => {
        setBrowseHits(res.hits);
        setFacets(res.facets);
      });
  }, [academicYearId, activeUser.id, searchQuery, filters, yearScopeAll, lang, refreshTick]);

  const browseFiles = useMemo(() => {
    if (activeSmartFiles) return activeSmartFiles.files;
    return browseHits.map((h) => h.file);
  }, [activeSmartFiles, browseHits]);

  const hitsByFileId = useMemo(() => {
    const map = new Map<string, SearchFileHit>();
    for (const h of browseHits) map.set(h.file.id, h);
    return map;
  }, [browseHits]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.sectionId) count++;
    if (filters.levelCode) count++;
    if (filters.subjectId) count++;
    if (filters.termNumber) count++;
    if (filters.yearId || yearScopeAll) count++;
    if (filters.fileCategory) count++;
    if (filters.tag) count++;
    if (filters.sizeRange && filters.sizeRange !== 'all') count++;
    if (filters.dateRange && filters.dateRange !== 'all') count++;
    if (filters.status && filters.status !== 'active') count++;
    if (filters.favoritesOnly) count++;
    if (filters.hasQrOnly) count++;
    return count;
  }, [filters, yearScopeAll]);

  const smartLabels: Record<SmartCollectionConfig['ruleId'], string> = {
    this_week: t.library.smartThisWeek,
    not_opened_6m: t.library.smartInactive6m,
    large_files: t.library.smartLargeFiles,
    unclassified: t.library.smartUnclassified,
    duplicates: t.library.smartDuplicates,
    favorites_by_subject: t.library.smartFavSubject,
  };

  const handleOpenSmartRule = (cfg: SmartCollectionConfig) => {
    const matched = services.library.evaluateSmartCollection(cfg, allFiles);
    setActiveSmartFiles({
      title: smartLabels[cfg.ruleId],
      files: matched,
    });
    setSubTab('browse');
  };

  const writableSections = useMemo(
    () =>
      allSections.filter(
        (s) =>
          !s.isHidden &&
          s.featureType !== 'student_lists' &&
          s.featureType !== 'grading_notebook' &&
          s.featureType !== 'daily_journal' &&
          s.featureType !== 'forum_chat' &&
          services.auth.getEffectivePermission(activeUser, s.id).write
      ),
    [allSections, activeUser]
  );

  useEffect(() => {
    if (!uploadTargetSectionId && writableSections[0]) {
      setUploadTargetSectionId(writableSections[0].id);
    }
  }, [writableSections, uploadTargetSectionId]);

  const handleOpen = async (f: FileRecord, initialPage?: number) => {
    await services.files.markOpened(f.id);
    onOpenFile(f, initialPage);
  };

  const handleSaveCurrentSearch = async (pinnedToHome: boolean) => {
    const label = searchQuery.trim() || Object.values(filters).filter(Boolean).join(' · ');
    if (!label) return;
    await services.search.saveSearch(ctx, {
      title: label,
      query: searchQuery,
      filters: {
        ...filters,
        yearId: yearScopeAll ? 'all' : filters.yearId,
      },
      pinnedToHome,
    });
    setSavedSearchToast(pinnedToHome ? t.library.pinToHome : t.library.saveThisSearch);
    reloadAll();
    setTimeout(() => setSavedSearchToast(''), 2500);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Sub-navigation Tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        {(
          [
            { id: 'home', label: t.library.homeTab, icon: Home },
            { id: 'browse', label: t.library.browseTab, icon: Folder },
            { id: 'collections', label: t.library.collectionsTab, icon: FolderHeart },
            { id: 'archive', label: t.library.archiveTab, icon: Archive },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id !== 'browse') setActiveSmartFiles(null);
                setSubTab(tab.id);
              }}
              className={`min-h-[42px] px-1 rounded-xl text-[11px] font-bold flex flex-col sm:flex-row items-center justify-center gap-1 transition-colors ${
                active
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ==================== HOME SUB-TAB ==================== */}
      {subTab === 'home' && (
        <div className="space-y-4">
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="w-full min-h-[48px] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 flex items-center gap-2.5 text-xs font-semibold text-[var(--color-text-muted)]"
            >
              <Search className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
              <span className="truncate">{t.home.globalSearchPlaceholder}</span>
            </button>
          )}

          {/* Continue Reading (PDF Progress) */}
          {continueReading.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>{t.library.continueReading}</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {continueReading.map((f) => {
                  const pct =
                    f.pageCount && f.lastReadPage
                      ? Math.min(100, Math.round((f.lastReadPage / f.pageCount) * 100))
                      : 0;
                  return (
                    <button
                      key={`cr-${f.id}`}
                      type="button"
                      onClick={() => handleOpen(f, f.lastReadPage || 1)}
                      className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-start space-y-2"
                    >
                      <div className="text-xs font-extrabold text-[var(--color-text)] line-clamp-1">
                        {getFileTitle(f)}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)] tabular-nums">
                        <span>
                          {t.library.lastPageRead}: {f.lastReadPage}
                          {f.pageCount ? ` / ${f.pageCount}` : ''}
                        </span>
                        <span className="font-bold text-[var(--color-primary)]">{pct}%</span>
                      </div>
                      {f.pageCount && (
                        <div className="h-1.5 rounded-full bg-[var(--color-background)] overflow-hidden">
                          <div
                            className="h-full bg-[var(--color-primary)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Pinned & Favorites */}
          {(pinnedFiles.length > 0 || favorites.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pinnedFiles.length > 0 && (
                <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span className="inline-flex items-center gap-1.5">
                      <Pin className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>{t.library.pinnedFiles}</span>
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {pinnedFiles.length}
                    </span>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {pinnedFiles.slice(0, 4).map((f) => (
                      <button
                        key={`pin-${f.id}`}
                        type="button"
                        onClick={() => handleOpen(f)}
                        className="w-full py-2 text-start flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-bold truncate">{getFileTitle(f)}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 tabular-nums">
                          {getExtensionBadge(f)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {favorites.length > 0 && (
                <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span className="inline-flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>{t.common.favorites}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFilters({ favoritesOnly: true });
                        setSubTab('browse');
                      }}
                      className="text-[11px] font-bold text-[var(--color-primary)] tabular-nums"
                    >
                      {favorites.length} →
                    </button>
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {favorites.slice(0, 4).map((f) => (
                      <button
                        key={`fav-${f.id}`}
                        type="button"
                        onClick={() => handleOpen(f)}
                        className="w-full py-2 text-start flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-bold truncate">{getFileTitle(f)}</span>
                        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 tabular-nums">
                          {formatFileSize(f.size)}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Smart Collections */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-[var(--color-text-muted)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>{t.library.smartCollections}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSmartRules(true)}
                className="text-[11px] font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
              >
                <Sliders className="w-3 h-3" />
                <span>{t.library.editSmartRules}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {smartConfigs.map((cfg) => {
                const count = services.library.evaluateSmartCollection(cfg, allFiles).length;
                return (
                  <button
                    key={cfg.ruleId}
                    type="button"
                    onClick={() => handleOpenSmartRule(cfg)}
                    className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 text-start hover:border-[var(--color-primary)] transition-colors"
                  >
                    <div className="text-lg font-extrabold text-[var(--color-primary)] tabular-nums">
                      {count}
                    </div>
                    <div className="text-xs font-bold text-[var(--color-text)] line-clamp-1">
                      {smartLabels[cfg.ruleId]}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Browse By Quick Selectors */}
          <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
            <h3 className="text-xs font-extrabold text-[var(--color-text-muted)]">
              {t.library.browseBy}
            </h3>

            {/* Level chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-[var(--color-text-muted)] me-1">
                {t.library.browseLevel}:
              </span>
              {LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => {
                    setActiveSmartFiles(null);
                    setFilters({ levelCode: lvl });
                    setSubTab('browse');
                  }}
                  className="min-h-[32px] px-2.5 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-xs font-bold"
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Subject chips */}
            {subjects.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-[var(--color-text-muted)] me-1">
                  {t.library.browseSubject}:
                </span>
                {subjects.map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => {
                      setActiveSmartFiles(null);
                      setFilters({ subjectId: sub.id });
                      setSubTab('browse');
                    }}
                    className="min-h-[32px] px-2.5 rounded-xl text-xs font-bold border"
                    style={{
                      backgroundColor: `${sub.color}18`,
                      borderColor: `${sub.color}44`,
                      color: sub.color,
                    }}
                  >
                    {pickLocalized(sub.names)}
                  </button>
                ))}
              </div>
            )}

            {/* Term chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-[var(--color-text-muted)] me-1">
                {t.library.browseTerm}:
              </span>
              {([1, 2, 3] as const).map((tm) => (
                <button
                  key={tm}
                  type="button"
                  onClick={() => {
                    setActiveSmartFiles(null);
                    setFilters({ termNumber: tm });
                    setSubTab('browse');
                  }}
                  className="min-h-[32px] px-2.5 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-xs font-bold"
                >
                  {tm === 1 ? t.sections.term1 : tm === 2 ? t.sections.term2 : t.sections.term3}
                </button>
              ))}
            </div>
          </section>

          {/* Recently Added & Recently Opened */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2">
              <div className="text-xs font-extrabold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>{t.library.recentlyAdded}</span>
              </div>
              {recentlyAdded.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-3 text-center">
                  {t.common.noFiles}
                </p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {recentlyAdded.slice(0, 5).map((f) => (
                    <button
                      key={`ra-${f.id}`}
                      type="button"
                      onClick={() => handleOpen(f)}
                      className="w-full py-2 text-start flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold truncate">{getFileTitle(f)}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 tabular-nums">
                        {formatFileSize(f.size)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2">
              <div className="text-xs font-extrabold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t.library.recentlyOpened}</span>
              </div>
              {recentlyOpened.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-3 text-center">
                  {t.common.noFiles}
                </p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {recentlyOpened.slice(0, 5).map((f) => (
                    <button
                      key={`ro-${f.id}`}
                      type="button"
                      onClick={() => handleOpen(f)}
                      className="w-full py-2 text-start flex items-center justify-between gap-2"
                    >
                      <span className="text-xs font-bold truncate">{getFileTitle(f)}</span>
                      <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 tabular-nums">
                        {f.lastOpenedAt?.slice(0, 10)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Section Tree Quick Shortcuts */}
          <section className="space-y-2">
            <h3 className="text-xs font-extrabold text-[var(--color-text-muted)]">
              {t.library.browseSection}
            </h3>
            <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => onSelectSection(sec)}
                  className="w-full min-h-[54px] px-4 py-2.5 flex items-center gap-3 text-start hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${sec.accentColor}1F`, color: sec.accentColor }}
                  >
                    <DynamicIcon name={sec.icon} className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold text-[var(--color-text)] truncate">
                    {pickLocalized(sec.names)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ==================== BROWSE SUB-TAB ==================== */}
      {subTab === 'browse' && (
        <div className="space-y-3">
          {activeSmartFiles && (
            <div className="rounded-2xl bg-[var(--color-primary-light)] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-extrabold text-[var(--color-primary)]">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>
                  {activeSmartFiles.title} ({activeSmartFiles.files.length})
                </span>
              </span>
              <button
                type="button"
                onClick={() => setActiveSmartFiles(null)}
                className="min-h-[30px] px-2 rounded-lg bg-[var(--color-surface)] text-[var(--color-text)] text-[11px]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Save / Pin Search bar strip */}
          {(searchQuery.trim() || activeFiltersCount > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSaveCurrentSearch(false)}
                  className="min-h-[32px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] font-bold"
                >
                  {t.library.saveThisSearch}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveCurrentSearch(true)}
                  className="min-h-[32px] px-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] font-bold inline-flex items-center gap-1"
                >
                  <Pin className="w-3 h-3" />
                  <span>{t.library.pinToHome}</span>
                </button>
              </div>
              {savedSearchToast && (
                <span className="font-bold text-emerald-600">✓ {savedSearchToast}</span>
              )}
            </div>
          )}

          {/* Collapsible Faceted Filter Drawer */}
          {showFiltersDrawer && (
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold">{t.library.filters}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFilters({});
                    setYearScopeAll(false);
                    setActiveSmartFiles(null);
                  }}
                  className="text-xs font-bold text-[var(--color-primary)]"
                >
                  {t.library.clearFilters}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <select
                  value={filters.sectionId || ''}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, sectionId: e.target.value || undefined }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="">
                    {t.library.browseSection}: {t.common.all}
                  </option>
                  {allSections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {pickLocalized(s.names)} ({facets?.bySection[s.id] ?? 0})
                    </option>
                  ))}
                </select>

                <select
                  value={filters.levelCode || ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      levelCode: (e.target.value as MiddleSchoolLevel) || undefined,
                    }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="">
                    {t.library.browseLevel}: {t.common.all}
                  </option>
                  {LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl} ({facets?.byLevel[lvl] ?? 0})
                    </option>
                  ))}
                </select>

                <select
                  value={filters.subjectId || ''}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, subjectId: e.target.value || undefined }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="">
                    {t.library.browseSubject}: {t.common.all}
                  </option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {pickLocalized(sub.names)} ({facets?.bySubject[sub.id] ?? 0})
                    </option>
                  ))}
                </select>

                <select
                  value={filters.termNumber ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      termNumber: e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : undefined,
                    }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="">
                    {t.library.browseTerm}: {t.common.all}
                  </option>
                  <option value={1}>
                    {t.sections.term1} ({facets?.byTerm['1'] ?? 0})
                  </option>
                  <option value={2}>
                    {t.sections.term2} ({facets?.byTerm['2'] ?? 0})
                  </option>
                  <option value={3}>
                    {t.sections.term3} ({facets?.byTerm['3'] ?? 0})
                  </option>
                </select>

                <select
                  value={filters.fileCategory || ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      fileCategory: (e.target.value as FileTypeCategory) || undefined,
                    }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="">
                    {t.library.browseType}: {t.common.all}
                  </option>
                  {TYPE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.toUpperCase()} ({facets?.byCategory[cat] ?? 0})
                    </option>
                  ))}
                </select>

                <select
                  value={filters.sizeRange || 'all'}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      sizeRange: e.target.value as LibrarySearchFilters['sizeRange'],
                    }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="all">{t.library.sizeAll}</option>
                  <option value="small">
                    {t.library.sizeSmall} ({facets?.bySizeRange.small ?? 0})
                  </option>
                  <option value="medium">
                    {t.library.sizeMedium} ({facets?.bySizeRange.medium ?? 0})
                  </option>
                  <option value="large">
                    {t.library.sizeLarge} ({facets?.bySizeRange.large ?? 0})
                  </option>
                </select>

                <select
                  value={filters.dateRange || 'all'}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      dateRange: e.target.value as LibrarySearchFilters['dateRange'],
                    }))
                  }
                  className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                >
                  <option value="all">{t.library.dateAll}</option>
                  <option value="week">{t.library.dateWeek}</option>
                  <option value="month">{t.library.dateMonth}</option>
                  <option value="6months">{t.library.date6Months}</option>
                </select>

                {years.length > 0 && (
                  <select
                    value={yearScopeAll ? 'all' : filters.yearId || academicYearId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'all') {
                        setYearScopeAll(true);
                        setFilters((f) => ({ ...f, yearId: 'all' }));
                      } else {
                        setYearScopeAll(false);
                        setFilters((f) => ({
                          ...f,
                          yearId: val === academicYearId ? undefined : val,
                        }));
                      }
                    }}
                    className="min-h-[38px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 font-semibold"
                  >
                    <option value={academicYearId}>{t.library.currentYearScope}</option>
                    <option value="all">{t.library.allYearsScope}</option>
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                <label className="inline-flex items-center gap-1.5 font-bold">
                  <input
                    type="checkbox"
                    checked={filters.status === 'all_with_archived'}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        status: e.target.checked ? 'all_with_archived' : 'active',
                      }))
                    }
                  />
                  <span>{t.library.includeArchived}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-bold">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.favoritesOnly)}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, favoritesOnly: e.target.checked || undefined }))
                    }
                  />
                  <span>{t.library.favoritesOnly}</span>
                </label>
                <label className="inline-flex items-center gap-1.5 font-bold">
                  <input
                    type="checkbox"
                    checked={Boolean(filters.hasQrOnly)}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, hasQrOnly: e.target.checked || undefined }))
                    }
                  />
                  <span>{t.library.hasQrOnly}</span>
                </label>
              </div>
            </div>
          )}

          <VirtualizedFileBrowser
            ctx={ctx}
            user={activeUser}
            files={browseFiles}
            hitsByFileId={hitsByFileId}
            sections={allSections}
            subjects={subjects}
            canWrite={canWrite}
            searchQuery={searchQuery}
            onSearchQueryChange={(q) => {
              setActiveSmartFiles(null);
              setSearchQuery(q);
            }}
            favoritesOnly={Boolean(filters.favoritesOnly)}
            onFavoritesOnlyChange={(val) =>
              setFilters((f) => ({ ...f, favoritesOnly: val || undefined }))
            }
            activeFiltersCount={activeFiltersCount}
            onToggleFiltersDrawer={() => setShowFiltersDrawer((v) => !v)}
            onOpenFile={onOpenFile}
            onOpenDetails={(f) => {
              if (onOpenDetails) onOpenDetails(f);
              else handleOpen(f);
            }}
            onChanged={reloadAll}
          />
        </div>
      )}

      {/* ==================== COLLECTIONS & TAGS SUB-TAB ==================== */}
      {subTab === 'collections' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold">{t.library.customCollections}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTagManager(true)}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Tag className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.library.manageTags}</span>
              </button>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setShowCreateCollection(true)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.library.newCollection}</span>
                </button>
              )}
            </div>
          </div>

          {collections.length === 0 ? (
            <EmptyState title={t.library.customCollections} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {collections.map((col) => (
                <div
                  key={col.id}
                  className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setActiveCollection(col)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-start"
                  >
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: col.coverColor }}
                    >
                      <FolderHeart className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold truncate">{col.name}</div>
                      <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                        {col.fileIds.length} {t.common.filesCount}
                      </div>
                    </div>
                  </button>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={async () => {
                        await services.library.deleteCollection(col.id);
                        reloadAll();
                      }}
                      className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Saved Searches Management */}
          {savedSearches.length > 0 && (
            <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2.5">
              <h4 className="text-xs font-extrabold text-[var(--color-text-muted)]">
                {t.library.savedSearches}
              </h4>
              <div className="divide-y divide-[var(--color-border)]">
                {savedSearches.map((ss) => (
                  <div key={ss.id} className="py-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery(ss.query);
                        setFilters(ss.filters);
                        setSubTab('browse');
                      }}
                      className="text-xs font-bold text-start truncate flex-1"
                    >
                      {ss.title}
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await services.search.togglePinSavedSearch(ss.id);
                          reloadAll();
                        }}
                        className={`min-h-[34px] min-w-[34px] rounded-xl flex items-center justify-center ${
                          ss.pinnedToHome
                            ? 'text-[var(--color-primary)] bg-[var(--color-primary-light)]'
                            : 'text-[var(--color-text-muted)]'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await services.search.deleteSavedSearch(ss.id);
                          reloadAll();
                        }}
                        className="min-h-[34px] min-w-[34px] rounded-xl flex items-center justify-center text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ==================== ARCHIVE & STORAGE SUB-TAB ==================== */}
      {subTab === 'archive' && (
        <ArchiveAndStorageView
          ctx={ctx}
          canWrite={canWrite}
          years={years}
          onOpenFile={(f) => handleOpen(f)}
          onChanged={reloadAll}
        />
      )}

      {/* Floating + Action Button staying cleanly above BottomNav */}
      {canWrite && writableSections.length > 0 && subTab !== 'archive' && (
        <button
          type="button"
          onClick={() => {
            if (subTab === 'collections') setShowCreateCollection(true);
            else setShowUploadPicker(true);
          }}
          aria-label={t.files.uploadPrompt}
          className="fixed bottom-24 end-4 z-30 w-13 h-13 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Quick Upload-to-Library Modal */}
      {showUploadPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-extrabold">
                <UploadCloud className="w-5 h-5 text-[var(--color-primary)]" />
                <span className="truncate">{t.files.uploadPrompt}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadPicker(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.library.browseSection}
              </label>
              <select
                value={uploadTargetSectionId}
                onChange={(e) => setUploadTargetSectionId(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
              >
                {writableSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {pickLocalized(s.names)}
                  </option>
                ))}
              </select>
            </div>
            {uploadTargetSectionId && (
              <FileUploadBar
                ctx={ctx}
                sectionId={uploadTargetSectionId}
                sectionName={pickLocalized(
                  writableSections.find((s) => s.id === uploadTargetSectionId)?.names || {
                    ar: '',
                    en: '',
                    fr: '',
                  }
                )}
                subjects={subjects}
                triggerUploadRef={triggerLibraryUploadRef}
                onUploaded={() => {
                  setShowUploadPicker(false);
                  reloadAll();
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <TagManagerModal
        open={showTagManager}
        ctx={ctx}
        onClose={() => setShowTagManager(false)}
        onChanged={reloadAll}
      />

      <CreateCollectionModal
        open={showCreateCollection}
        ctx={ctx}
        onClose={() => setShowCreateCollection(false)}
        onCreated={reloadAll}
      />

      <CollectionDetailModal
        collection={activeCollection}
        allFiles={allFiles}
        onClose={() => setActiveCollection(null)}
        onOpenFile={(f) => handleOpen(f)}
        onChanged={reloadAll}
      />

      <SmartRulesModal
        open={showSmartRules}
        academicYearId={academicYearId}
        subjects={subjects}
        onClose={() => setShowSmartRules(false)}
        onSaved={reloadAll}
      />
    </div>
  );
};
