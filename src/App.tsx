/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Download, Pin, Search, Trash2 } from 'lucide-react';
import { I18nProvider, useI18n } from '@/src/i18n/I18nContext';
import { initializeAppServices, services } from '@/src/services';
import type { SubjectDependencies } from '@/src/services/SubjectsService';
import type {
  AcademicYearRecord,
  ClassRoomRecord,
  FileRecord,
  LibrarySearchFilters,
  SavedSearchRecord,
  SchoolRecord,
  SectionNode,
  SubjectRecord,
  ThemeConfigRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { LoginScreen } from '@/src/components/auth/LoginScreen';
import { SchoolGatewayPage } from '@/src/components/auth/SchoolGatewayPage';
import { OfflineIndicator } from '@/src/components/common/OfflineIndicator';
import { FileDetailsModal } from '@/src/components/files/FileDetailsModal';
import { FilePreviewModal } from '@/src/components/files/FilePreviewModal';
import { ForumAndChatView } from '@/src/components/forum/ForumAndChatView';
import { GradingNotebookView } from '@/src/components/grades/GradingNotebookView';
import { BottomNav, type NavTab } from '@/src/components/home/BottomNav';
import { GlobalSearchModal } from '@/src/components/home/GlobalSearchModal';
import { IdentityCard } from '@/src/components/home/IdentityCard';
import { LibraryView } from '@/src/components/home/LibraryView';
import { QuickAccessGrid } from '@/src/components/home/QuickAccessGrid';
import { TopAppBar } from '@/src/components/home/TopAppBar';
import { SectionExplorer, type GradeNavTarget } from '@/src/components/sections/SectionExplorer';
import { StudentListsView } from '@/src/components/sections/StudentListsView';
import { SettingsView } from '@/src/components/settings/SettingsView';
import { SubjectDeleteModal } from '@/src/components/subjects/SubjectDeleteModal';
import { SubjectOnboardingModal } from '@/src/components/subjects/SubjectOnboardingModal';

type AppStage = 'loading' | 'login' | 'school_gateway' | 'portfolio';

const PortfolioShell: React.FC = () => {
  const { t, pickLocalized } = useI18n();
  const [stage, setStage] = useState<AppStage>('loading');
  const [user, setUser] = useState<UserRecord | null>(null);
  const [school, setSchool] = useState<SchoolRecord | null>(null);
  const [years, setYears] = useState<AcademicYearRecord[]>([]);
  const [activeYear, setActiveYear] = useState<AcademicYearRecord | null>(null);
  const [themeConfig, setThemeConfig] = useState<ThemeConfigRecord | null>(null);
  const [mainSections, setMainSections] = useState<SectionNode[]>([]);
  const [teacherDocs, setTeacherDocs] = useState<SectionNode[]>([]);
  const [allYearSections, setAllYearSections] = useState<SectionNode[]>([]);
  const [classes, setClasses] = useState<ClassRoomRecord[]>([]);
  const [activeSubjects, setActiveSubjects] = useState<SubjectRecord[]>([]);
  const [reviewSubjects, setReviewSubjects] = useState<SubjectRecord[]>([]);
  const [reviewDeps, setReviewDeps] = useState<Record<string, SubjectDependencies>>({});
  const [needsSubjectOnboarding, setNeedsSubjectOnboarding] = useState(false);
  const [deleteReviewTarget, setDeleteReviewTarget] = useState<SubjectRecord | null>(null);
  const [pinnedSearches, setPinnedSearches] = useState<SavedSearchRecord[]>([]);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [openSection, setOpenSection] = useState<SectionNode | null>(null);
  const [gradeNavTarget, setGradeNavTarget] = useState<GradeNavTarget | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [previewInitialPage, setPreviewInitialPage] = useState<number | undefined>(undefined);
  const [detailsFile, setDetailsFile] = useState<FileRecord | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryJump, setLibraryJump] = useState<{
    subTab?: 'home' | 'browse' | 'collections' | 'archive';
    query?: string;
    filters?: LibrarySearchFilters;
  } | null>(null);
  const [showHiddenCards, setShowHiddenCards] = useState(false);
  const [backupReminderDue, setBackupReminderDue] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  const loadPortfolioState = useCallback(async (currentUser: UserRecord | null) => {
    const sch = await services.school.getActiveSchool();
    if (!sch) return;
    setSchool(sch);

    const [allYears, viewingYear] = await Promise.all([
      services.years.listYears(sch.id),
      services.years.getCurrentViewingYear(sch.id),
    ]);
    setYears(allYears);
    setActiveYear(viewingYear);

    if (currentUser && viewingYear) {
      const ctx: ServiceContext = {
        ownerId: currentUser.id,
        schoolId: sch.id,
        academicYearId: viewingYear.id,
      };
      const [
        theme,
        mains,
        docs,
        allSecs,
        clsList,
        backupDue,
        stStats,
        allSubjs,
        onboardingDone,
        savedList,
      ] = await Promise.all([
        services.theme.getConfig(currentUser.id, ctx),
        services.sections.getMainSections(viewingYear.id, true),
        services.sections.getChildren(viewingYear.id, `${viewingYear.id}__sec_02`, true),
        services.sections.getAllForYear(viewingYear.id),
        services.classes.listByYear(viewingYear.id),
        services.backup.isBackupReminderDue(7),
        services.files.getStorageStats(),
        services.subjects.listForTeacher(viewingYear.id, currentUser.id, true),
        services.subjects.hasCompletedOnboarding(viewingYear.id, currentUser.id),
        services.search.listSavedSearches(viewingYear.id),
      ]);

      const activeList = allSubjs.filter((s) => s.isActive);
      const flaggedList = allSubjs.filter((s) => !s.isActive && s.archivedNeedsDeleteReview);
      const depsMap: Record<string, SubjectDependencies> = {};
      for (const s of flaggedList) {
        depsMap[s.id] = await services.subjects.getDependencies(viewingYear.id, s.id);
      }

      services.theme.applyThemeToDOM(theme);
      setThemeConfig(theme);
      setMainSections(mains);
      setTeacherDocs(docs);
      setAllYearSections(allSecs);
      setClasses(clsList);
      setActiveSubjects(activeList);
      setReviewSubjects(flaggedList);
      setReviewDeps(depsMap);
      setPinnedSearches(savedList.filter((s) => s.pinnedToHome));
      setNeedsSubjectOnboarding(!onboardingDone && !viewingYear.isArchived);
      setBackupReminderDue(backupDue);
      setStorageWarning(stStats.isNearFull);
    }
  }, []);

  const boot = useCallback(async () => {
    await initializeAppServices();
    const current = await services.auth.getCurrentUser();
    setUser(current);
    await loadPortfolioState(current);
    setStage(current ? 'school_gateway' : 'login');
  }, [loadPortfolioState]);

  useEffect(() => {
    boot();
  }, [boot]);

  const handleAuthenticated = async (loggedIn: UserRecord) => {
    setUser(loggedIn);
    await loadPortfolioState(loggedIn);
    setStage('school_gateway');
  };

  const handleLogout = async () => {
    await services.auth.logout();
    setUser(null);
    setOpenSection(null);
    setActiveTab('home');
    setStage('login');
  };

  const handleOpenPreview = (file: FileRecord, initialPage?: number) => {
    setPreviewInitialPage(initialPage);
    setPreviewFile(file);
  };

  if (stage === 'loading' || !school || !activeYear) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[var(--color-background)] text-sm font-bold text-[var(--color-text-muted)]">
        {t.common.loading}
      </div>
    );
  }

  if (stage === 'login' || !user) {
    return (
      <>
        <OfflineIndicator />
        <LoginScreen academicYearId={activeYear.id} onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  if (stage === 'school_gateway') {
    return (
      <>
        <OfflineIndicator />
        <SchoolGatewayPage
          user={user}
          school={school}
          year={activeYear}
          onEnterPortfolio={() => setStage('portfolio')}
          onLogout={handleLogout}
        />
      </>
    );
  }

  const ctx: ServiceContext = {
    ownerId: user.id,
    schoolId: school.id,
    academicYearId: activeYear.id,
  };

  const canWrite = !activeYear.isArchived && user.role !== 'teacher_read' && user.role !== 'banned';
  const canComment = !activeYear.isArchived && user.role !== 'banned';

  const visibleMainForUser = mainSections.filter(
    (s) => services.auth.getEffectivePermission(user, s.id).view
  );
  const visibleTeacherDocs = teacherDocs.filter(
    (s) => services.auth.getEffectivePermission(user, s.id).view
  );
  const otherMainSections = visibleMainForUser.filter((s) => !s.id.endsWith('__sec_02'));

  const jumpToSectionSlug = async (slug: string, navTarget?: GradeNavTarget) => {
    const all = await services.sections.getAllForYear(activeYear.id);
    const match = all.find((s) => s.id === slug || s.id.endsWith(`__${slug}`));
    if (match) {
      setGradeNavTarget(navTarget ?? null);
      setOpenSection(match);
    }
  };

  const syncClasses = async () => {
    const cls = await services.classes.listByYear(activeYear.id);
    setClasses(cls);
    const updatedUser = await services.auth.updateProfile(user.id, {
      assignedClasses: cls.map((c) => c.name),
    });
    if (updatedUser) setUser(updatedUser);
  };

  return (
    <div className="min-h-dvh bg-[var(--color-background)] text-[var(--color-text)] pb-24">
      <OfflineIndicator />
      <TopAppBar isArchiveYear={activeYear.isArchived} yearLabel={activeYear.label} />

      <main className="mx-auto max-w-6xl p-4 space-y-4">
        {storageWarning && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 px-4 py-3 text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{t.files.storageWarning}</span>
          </div>
        )}

        {backupReminderDue && activeTab === 'home' && !openSection && (
          <div className="rounded-2xl bg-[var(--color-primary-light)] border border-[var(--color-primary)]/30 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-[var(--color-text)]">
              {t.home.backupReminder}
            </span>
            <button
              type="button"
              onClick={async () => {
                const blob = await services.backup.exportZipBackup();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `teachers_portfolio_${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                setBackupReminderDue(false);
              }}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.home.backupNow}</span>
            </button>
          </div>
        )}

        {activeTab === 'home' &&
          !openSection &&
          reviewSubjects.map((sub) => {
            const deps = reviewDeps[sub.id];
            return (
              <div
                key={`home-rev-${sub.id}`}
                className="rounded-3xl border-2 border-amber-400/70 bg-amber-50 dark:bg-amber-950/35 p-4 space-y-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                      {t.subjects.reviewBannerTitle}: {pickLocalized(sub.names)}
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                      {t.subjects.reviewBannerBody}
                    </p>
                    {deps && (
                      <div className="flex flex-wrap gap-2 pt-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                        <span>
                          {deps.filesCount} {t.subjects.depFiles}
                        </span>
                        <span>·</span>
                        <span>
                          {deps.gradesCount} {t.subjects.depGrades}
                        </span>
                        <span>·</span>
                        <span>
                          {deps.classesCount} {t.subjects.depClasses}
                        </span>
                        <span>·</span>
                        <span>
                          {deps.examsCount} {t.subjects.depExams}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDeleteReviewTarget(sub)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.subjects.reviewBannerAction}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.subjects.dismissDeleteReview(sub.id);
                      await loadPortfolioState(user);
                    }}
                    className="min-h-[38px] px-3 rounded-xl border border-amber-400/80 text-xs font-bold text-amber-900 dark:text-amber-200"
                  >
                    {t.subjects.dismissReview}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.subjects.unarchiveSubject(ctx, sub.id);
                      await loadPortfolioState(user);
                    }}
                    className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-[var(--color-primary)]"
                  >
                    {t.subjects.restoreSubject}
                  </button>
                </div>
              </div>
            );
          })}

        {openSection ? (
          <SectionExplorer
            ctx={ctx}
            user={user}
            schoolName={school.name}
            currentSection={openSection}
            isArchiveYear={activeYear.isArchived}
            gradeNavTarget={gradeNavTarget}
            subjects={activeSubjects}
            onNavigateSection={(sec) => {
              setGradeNavTarget(null);
              setOpenSection(sec);
            }}
            onJumpToSectionSlug={jumpToSectionSlug}
            onOpenFile={handleOpenPreview}
            onOpenDetails={(file) => setDetailsFile(file)}
            onStructureChanged={() => loadPortfolioState(user)}
            onClassesSynced={syncClasses}
            onSubjectsChanged={() => loadPortfolioState(user)}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <>
                <IdentityCard
                  user={user}
                  school={school}
                  year={activeYear}
                  classes={classes}
                  subjects={activeSubjects}
                  onSaveIdentity={async ({ displayName, schoolName, assignedClasses }) => {
                    const [u, s] = await Promise.all([
                      services.auth.updateProfile(user.id, { displayName, assignedClasses }),
                      services.school.updateSchool(school.id, { name: schoolName }),
                    ]);
                    if (u) setUser(u);
                    if (s) setSchool(s);
                  }}
                  onSaveClassSubjects={async (updates) => {
                    for (const item of updates) {
                      await services.classes.updateClassSubjects(item.classId, item.subjectIds);
                    }
                    const cls = await services.classes.listByYear(activeYear.id);
                    setClasses(cls);
                  }}
                />

                {pinnedSearches.length > 0 && (
                  <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2">
                    <div className="text-[11px] font-extrabold text-[var(--color-text-muted)] flex items-center gap-1.5">
                      <Pin className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                      <span>{t.library.pinnedSearches}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pinnedSearches.map((ps) => (
                        <button
                          key={ps.id}
                          type="button"
                          onClick={() => {
                            setLibraryJump({
                              subTab: 'browse',
                              query: ps.query,
                              filters: ps.filters,
                            });
                            setActiveTab('library');
                          }}
                          className="min-h-[34px] px-3 rounded-xl bg-[var(--color-primary-light)]/70 text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <Search className="w-3 h-3" />
                          <span>{ps.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <QuickAccessGrid
                  teacherDocs={visibleTeacherDocs}
                  otherSections={otherMainSections}
                  themeConfig={themeConfig}
                  canWrite={canWrite}
                  showHidden={showHiddenCards}
                  onToggleShowHidden={() => setShowHiddenCards((v) => !v)}
                  onSelectSection={(sec) => setOpenSection(sec)}
                  onReorder={async (orderedIds) => {
                    await services.sections.reorderNodes(orderedIds);
                    await loadPortfolioState(user);
                  }}
                  onAddCustomSection={async (names) => {
                    await services.sections.addNode(ctx, {
                      parentId: null,
                      kind: 'custom',
                      featureType: 'standard',
                      names,
                      icon: 'Folder',
                      accentColor: themeConfig?.primaryColor || '#1e40af',
                    });
                    await loadPortfolioState(user);
                  }}
                  onOpenSearch={() => setSearchOpen(true)}
                  onOpenSchoolGateway={() => setStage('school_gateway')}
                />
              </>
            )}

            {activeTab === 'forum' && (
              <ForumAndChatView
                ctx={ctx}
                user={user}
                canComment={canComment}
                canWrite={canWrite}
              />
            )}

            {activeTab === 'classes' && (
              <StudentListsView
                ctx={ctx}
                user={user}
                schoolName={school.name}
                isArchiveYear={activeYear.isArchived}
                canWrite={canWrite}
                subjects={activeSubjects}
                initialLevel={gradeNavTarget?.level ?? '1M'}
                initialClassId={gradeNavTarget?.classId}
                onOpenFile={handleOpenPreview}
                onClassesSynced={syncClasses}
                onSubjectsChanged={() => loadPortfolioState(user)}
                onOpenInNotebook={(level, classId, term, subject) => {
                  setGradeNavTarget({ level, classId, term, subject });
                  setActiveTab('grading');
                }}
              />
            )}

            {activeTab === 'grading' && (
              <GradingNotebookView
                ctx={ctx}
                user={user}
                schoolName={school.name}
                isArchiveYear={activeYear.isArchived}
                subjects={activeSubjects}
                initialLevel={gradeNavTarget?.level}
                initialClassId={gradeNavTarget?.classId}
                initialTerm={gradeNavTarget?.term}
                initialSubject={gradeNavTarget?.subject}
                onSubjectsChanged={() => loadPortfolioState(user)}
                onOpenClassList={(level, classId) => {
                  setGradeNavTarget({ level, classId });
                  setActiveTab('classes');
                }}
              />
            )}

            {activeTab === 'library' && (
              <LibraryView
                ctx={ctx}
                user={user}
                academicYearId={activeYear.id}
                sections={visibleMainForUser.filter((s) => !s.isHidden)}
                subjects={activeSubjects}
                years={years}
                canWrite={canWrite}
                initialSubTab={libraryJump?.subTab}
                initialSearchQuery={libraryJump?.query}
                initialFilters={libraryJump?.filters}
                onSelectSection={(sec) => setOpenSection(sec)}
                onOpenFile={handleOpenPreview}
                onOpenDetails={(file) => setDetailsFile(file)}
                onOpenSearch={() => setSearchOpen(true)}
                onChanged={() => loadPortfolioState(user)}
              />
            )}

            {activeTab === 'settings' && themeConfig && (
              <SettingsView
                ctx={ctx}
                user={user}
                themeConfig={themeConfig}
                years={years}
                activeViewingYear={activeYear}
                mainSections={mainSections}
                customizableCards={[...teacherDocs, ...otherMainSections]}
                subjects={activeSubjects}
                onThemeUpdated={(cfg) => setThemeConfig(cfg)}
                onYearChanged={() => loadPortfolioState(user)}
                onSubjectsChanged={() => loadPortfolioState(user)}
                onFullReload={boot}
                onOpenSchoolGateway={() => setStage('school_gateway')}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setGradeNavTarget(null);
          setOpenSection(null);
          setLibraryJump(null);
          setActiveTab(tab);
        }}
      />

      <GlobalSearchModal
        open={searchOpen}
        academicYearId={activeYear.id}
        ctx={ctx}
        user={user}
        onClose={() => setSearchOpen(false)}
        onSelectSection={(sec) => {
          setActiveTab('home');
          setOpenSection(sec);
        }}
        onSelectFile={handleOpenPreview}
        onNavigateTab={(tab) => {
          if (tab === 'journal') {
            jumpToSectionSlug('sec_12_journal');
          } else {
            setOpenSection(null);
            setActiveTab('forum');
          }
        }}
        onOpenInLibrary={(query, includeArchived) => {
          setOpenSection(null);
          setLibraryJump({
            subTab: 'browse',
            query,
            filters: { status: includeArchived ? 'all_with_archived' : 'active' },
          });
          setActiveTab('library');
        }}
        onSavedSearchChanged={() => loadPortfolioState(user)}
      />

      <FilePreviewModal
        file={previewFile}
        initialPage={previewInitialPage}
        onClose={() => {
          setPreviewFile(null);
          setPreviewInitialPage(undefined);
        }}
        onOpenDetails={(f) => {
          setPreviewFile(null);
          setPreviewInitialPage(undefined);
          setDetailsFile(f);
        }}
      />

      <FileDetailsModal
        file={detailsFile}
        ctx={ctx}
        sections={allYearSections}
        subjects={activeSubjects}
        canWrite={canWrite}
        onClose={() => setDetailsFile(null)}
        onOpenViewer={(f, pg) => {
          setDetailsFile(null);
          handleOpenPreview(f, pg);
        }}
        onUpdated={() => loadPortfolioState(user)}
      />

      <SubjectOnboardingModal
        open={stage === 'portfolio' && needsSubjectOnboarding}
        ctx={ctx}
        onCompleted={() => loadPortfolioState(user)}
      />

      <SubjectDeleteModal
        open={Boolean(deleteReviewTarget)}
        ctx={ctx}
        subject={deleteReviewTarget}
        otherActiveSubjects={activeSubjects.filter((s) => s.id !== deleteReviewTarget?.id)}
        initialMode="delete"
        onClose={() => setDeleteReviewTarget(null)}
        onResolved={() => loadPortfolioState(user)}
      />
    </div>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <PortfolioShell />
    </I18nProvider>
  );
}
