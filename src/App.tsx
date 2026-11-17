/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { I18nProvider, useI18n } from '@/src/i18n/I18nContext';
import { initializeAppServices, services } from '@/src/services';
import type {
  AcademicYearRecord,
  ClassRoomRecord,
  FileRecord,
  SchoolRecord,
  SectionNode,
  ThemeConfigRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { LoginScreen } from '@/src/components/auth/LoginScreen';
import { SchoolGatewayPage } from '@/src/components/auth/SchoolGatewayPage';
import { OfflineIndicator } from '@/src/components/common/OfflineIndicator';
import { FilePreviewModal } from '@/src/components/files/FilePreviewModal';
import { ForumAndChatView } from '@/src/components/forum/ForumAndChatView';
import { BottomNav, type NavTab } from '@/src/components/home/BottomNav';
import { GlobalSearchModal } from '@/src/components/home/GlobalSearchModal';
import { IdentityCard } from '@/src/components/home/IdentityCard';
import { LibraryView } from '@/src/components/home/LibraryView';
import { QuickAccessGrid } from '@/src/components/home/QuickAccessGrid';
import { TopAppBar } from '@/src/components/home/TopAppBar';
import { DailyJournalView } from '@/src/components/journal/DailyJournalView';
import { SectionExplorer } from '@/src/components/sections/SectionExplorer';
import { SettingsView } from '@/src/components/settings/SettingsView';

type AppStage = 'loading' | 'login' | 'school_gateway' | 'portfolio';

const PortfolioShell: React.FC = () => {
  const { t } = useI18n();
  const [stage, setStage] = useState<AppStage>('loading');
  const [user, setUser] = useState<UserRecord | null>(null);
  const [school, setSchool] = useState<SchoolRecord | null>(null);
  const [years, setYears] = useState<AcademicYearRecord[]>([]);
  const [activeYear, setActiveYear] = useState<AcademicYearRecord | null>(null);
  const [themeConfig, setThemeConfig] = useState<ThemeConfigRecord | null>(null);
  const [mainSections, setMainSections] = useState<SectionNode[]>([]);
  const [sectionCounts, setSectionCounts] = useState<
    Record<string, { count: number; totalBytes: number }>
  >({});
  const [classes, setClasses] = useState<ClassRoomRecord[]>([]);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [openSection, setOpenSection] = useState<SectionNode | null>(null);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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
      const [theme, mains, clsList, backupDue, stStats] = await Promise.all([
        services.theme.getConfig(currentUser.id, ctx),
        services.sections.getMainSections(viewingYear.id, true),
        services.classes.listByYear(viewingYear.id),
        services.backup.isBackupReminderDue(7),
        services.files.getStorageStats(),
      ]);

      services.theme.applyThemeToDOM(theme);
      setThemeConfig(theme);
      setMainSections(mains);
      setClasses(clsList);
      setBackupReminderDue(backupDue);
      setStorageWarning(stStats.isNearFull);

      const counts: Record<string, { count: number; totalBytes: number }> = {};
      for (const sec of mains) {
        const desc = await services.sections.getDescendantIds(viewingYear.id, sec.id);
        const res = await services.files.getFolderStats(viewingYear.id, desc);
        counts[sec.id] = { count: res.count, totalBytes: res.totalBytes };
      }
      setSectionCounts(counts);
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

  return (
    <div className="min-h-dvh bg-[var(--color-background)] text-[var(--color-text)] pb-24">
      <OfflineIndicator />
      <TopAppBar
        onOpenSearch={() => setSearchOpen(true)}
        onOpenSchoolGateway={() => setStage('school_gateway')}
        isArchiveYear={activeYear.isArchived}
        yearLabel={activeYear.label}
      />

      <main className="mx-auto max-w-6xl px-4 pt-4 space-y-5">
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
              className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.home.backupNow}</span>
            </button>
          </div>
        )}

        {openSection ? (
          <SectionExplorer
            ctx={ctx}
            user={user}
            currentSection={openSection}
            isArchiveYear={activeYear.isArchived}
            onNavigateSection={(sec) => setOpenSection(sec)}
            onOpenFile={(file) => setPreviewFile(file)}
            onStructureChanged={() => loadPortfolioState(user)}
            onClassesSynced={async () => {
              const cls = await services.classes.listByYear(activeYear.id);
              setClasses(cls);
              const updatedUser = await services.auth.updateProfile(user.id, {
                assignedClasses: cls.map((c) => c.name),
              });
              if (updatedUser) setUser(updatedUser);
            }}
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
                  onSaveIdentity={async ({ displayName, schoolName, assignedClasses }) => {
                    const [u, s] = await Promise.all([
                      services.auth.updateProfile(user.id, { displayName, assignedClasses }),
                      services.school.updateSchool(school.id, { name: schoolName }),
                    ]);
                    if (u) setUser(u);
                    if (s) setSchool(s);
                  }}
                />

                <QuickAccessGrid
                  sections={visibleMainForUser}
                  fileCounts={sectionCounts}
                  themeConfig={themeConfig}
                  canWrite={canWrite}
                  showHidden={showHiddenCards}
                  onToggleShowHidden={() => setShowHiddenCards((v) => !v)}
                  onSelectSection={(sec) => setOpenSection(sec)}
                  onReorder={async (orderedIds) => {
                    await services.sections.reorderNodes(orderedIds);
                    await loadPortfolioState(user);
                  }}
                  onTogglePin={async (id) => {
                    await services.sections.togglePin(id);
                    await loadPortfolioState(user);
                  }}
                  onToggleHide={async (id) => {
                    await services.sections.toggleHide(id);
                    await loadPortfolioState(user);
                  }}
                  onAddCustomSection={async (names) => {
                    await services.sections.addNode(ctx, {
                      parentId: null,
                      kind: 'custom',
                      featureType: 'standard',
                      names,
                      icon: 'Folder',
                      accentColor: themeConfig?.primaryColor || '#0f766e',
                    });
                    await loadPortfolioState(user);
                  }}
                />
              </>
            )}

            {activeTab === 'library' && (
              <LibraryView
                academicYearId={activeYear.id}
                sections={visibleMainForUser.filter((s) => !s.isHidden)}
                onSelectSection={(sec) => setOpenSection(sec)}
                onOpenFile={(file) => setPreviewFile(file)}
              />
            )}

            {activeTab === 'journal' && <DailyJournalView ctx={ctx} canWrite={canWrite} />}

            {activeTab === 'forum' && (
              <ForumAndChatView
                ctx={ctx}
                user={user}
                canComment={canComment}
                canWrite={canWrite}
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
                onThemeUpdated={(cfg) => setThemeConfig(cfg)}
                onYearChanged={() => loadPortfolioState(user)}
                onFullReload={boot}
                onLogout={handleLogout}
              />
            )}
          </>
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setOpenSection(null);
          setActiveTab(tab);
        }}
      />

      <GlobalSearchModal
        open={searchOpen}
        academicYearId={activeYear.id}
        onClose={() => setSearchOpen(false)}
        onSelectSection={(sec) => {
          setActiveTab('home');
          setOpenSection(sec);
        }}
        onSelectFile={(file) => setPreviewFile(file)}
        onNavigateTab={(tab) => {
          setOpenSection(null);
          setActiveTab(tab);
        }}
      />

      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
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
