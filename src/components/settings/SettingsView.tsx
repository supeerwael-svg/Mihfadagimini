import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  BookOpen,
  Building2,
  Calculator,
  CalendarPlus,
  Download,
  Globe,
  HardDrive,
  LogOut,
  Palette,
  RotateCcw,
  Search,
  Shield,
  Upload,
} from 'lucide-react';
import { THEME_PALETTES } from '@/src/db/seedDefaults';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { DEFAULT_FORMULA_RULE } from '@/src/services/GradesService';
import type { YearArchiveSummary } from '@/src/services/ArchiveService';
import type { StorageStats } from '@/src/services/FilesService';
import type { IndexStatusInfo } from '@/src/services/SearchService';
import { formatFileSize } from '@/src/utils/fileFormat';
import type {
  AcademicYearRecord,
  FileRecord,
  GradeSubjectKey,
  GradingConfigRecord,
  GradingFormulaRule,
  LanguageCode,
  MiddleSchoolLevel,
  SectionNode,
  SubjectRecord,
  ThemeConfigRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { AVAILABLE_CARD_ICONS, DynamicIcon } from '@/src/components/common/DynamicIcon';
import { PWAInstallButton } from '@/src/components/common/PWAInstallButton';
import { SubjectManagerPanel } from '@/src/components/subjects/SubjectManagerPanel';
import { AdminDashboardModal } from './AdminDashboardModal';
import { SeatingCriteriaSettings } from './SeatingCriteriaSettings';

interface SettingsViewProps {
  ctx: ServiceContext;
  user: UserRecord;
  themeConfig: ThemeConfigRecord;
  years: AcademicYearRecord[];
  activeViewingYear: AcademicYearRecord;
  mainSections: SectionNode[];
  customizableCards?: SectionNode[];
  subjects?: SubjectRecord[];
  onThemeUpdated: (cfg: ThemeConfigRecord) => void;
  onYearChanged: () => Promise<void>;
  onSubjectsChanged?: () => Promise<void>;
  onFullReload: () => Promise<void>;
  onOpenSchoolGateway?: () => void;
  onLogout: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  ctx,
  user,
  themeConfig,
  years,
  activeViewingYear,
  mainSections,
  customizableCards,
  subjects: propSubjects,
  onThemeUpdated,
  onYearChanged,
  onSubjectsChanged,
  onFullReload,
  onOpenSchoolGateway,
  onLogout,
}) => {
  const { t, lang, setLanguage, pickLocalized } = useI18n();
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatusInfo | null>(null);
  const [rebuildingIndex, setRebuildingIndex] = useState(false);
  const [rebuildProgress, setRebuildProgress] = useState<{ done: number; total: number } | null>(null);
  const [yearArchiveSummary, setYearArchiveSummary] = useState<YearArchiveSummary | null>(null);

  // New Academic Year Gateway state
  const [newYearLabel, setNewYearLabel] = useState('2027/2028');
  const [copyMode, setCopyMode] = useState<'structure_only' | 'structure_with_files'>('structure_only');
  const [yearFiles, setYearFiles] = useState<FileRecord[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState('');

  // Per-card customization
  const [customSectionSlug, setCustomSectionSlug] = useState('');

  // Grading formula configuration state
  const [gradingConfig, setGradingConfig] = useState<GradingConfigRecord | null>(null);
  const [ruleLevelScope, setRuleLevelScope] = useState<'default' | MiddleSchoolLevel>('default');
  const [ruleSubjectScope, setRuleSubjectScope] = useState<'all' | GradeSubjectKey>('all');
  const [localSubjects, setLocalSubjects] = useState<SubjectRecord[]>(propSubjects ?? []);

  const activeSubjects = propSubjects ?? localSubjects;

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadSubjects = async () => {
    const list = await services.subjects.listForTeacher(ctx.academicYearId, ctx.ownerId, false);
    setLocalSubjects(list);
  };

  useEffect(() => {
    services.files.getStorageStats().then(setStorage);
    services.backup.getLastBackupDate().then(setLastBackup);
    services.files.listAllForYear(activeViewingYear.id).then(setYearFiles);
    services.grades.getGradingConfig(ctx).then(setGradingConfig);
    services.search.getIndexStatus(activeViewingYear.id).then(setIndexStatus);
    services.archive.getYearArchiveSummary(activeViewingYear.id).then(setYearArchiveSummary);
    loadSubjects();
  }, [activeViewingYear.id, ctx.academicYearId, ctx.ownerId]);

  useEffect(() => {
    if (propSubjects) {
      setLocalSubjects(propSubjects);
    }
  }, [propSubjects]);

  const activeRuleKey = (() => {
    if (ruleLevelScope !== 'default' && ruleSubjectScope !== 'all') {
      return `${ruleLevelScope}__${ruleSubjectScope}`;
    }
    if (ruleLevelScope !== 'default') return ruleLevelScope;
    if (ruleSubjectScope !== 'all') return ruleSubjectScope;
    return 'default';
  })();

  const activeRule: GradingFormulaRule = (() => {
    if (!gradingConfig) return DEFAULT_FORMULA_RULE;
    if (gradingConfig.rules[activeRuleKey]) return gradingConfig.rules[activeRuleKey];
    if (ruleLevelScope !== 'default' && ruleSubjectScope !== 'all') {
      return (
        gradingConfig.rules[ruleSubjectScope] ||
        gradingConfig.rules[ruleLevelScope] ||
        gradingConfig.rules.default ||
        DEFAULT_FORMULA_RULE
      );
    }
    return gradingConfig.rules.default || DEFAULT_FORMULA_RULE;
  })();

  const handleUpdateFormulaRule = async (patch: Partial<GradingFormulaRule>) => {
    if (!gradingConfig) return;
    const nextRule: GradingFormulaRule = {
      ...activeRule,
      ...patch,
      key: activeRuleKey,
    };
    const saved = await services.grades.saveGradingConfig({
      ...gradingConfig,
      rules: {
        ...gradingConfig.rules,
        [activeRuleKey]: nextRule,
      },
    });
    setGradingConfig(saved);
  };

  const handleSaveTheme = async (patch: Partial<ThemeConfigRecord>) => {
    const saved = await services.theme.saveConfig({ ...themeConfig, ...patch });
    onThemeUpdated(saved);
  };

  const handleExportZip = async () => {
    const blob = await services.backup.exportZipBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teachers_portfolio_backup_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setLastBackup(new Date().toISOString());
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await services.backup.importBackupFile(file);
    setStatusMsg(`${res.recordsCount} records · ${res.filesCount} files`);
    await onFullReload();
  };

  const handleOpenNewYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearLabel.trim()) return;
    await services.years.createNewGateway(ctx, {
      label: newYearLabel,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
      sourceYearId: activeViewingYear.id,
      copyMode,
      selectedFileIds,
    });
    await onYearChanged();
  };

  const getSlug = (id: string) => (id.includes('__') ? id.split('__')[1] : id);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-[var(--color-text)]">{t.settings.title}</h2>
        <button
          type="button"
          onClick={onLogout}
          className="min-h-[42px] px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold text-red-600 inline-flex items-center gap-1.5"
        >
          <LogOut className="w-4 h-4" />
          <span>{t.auth.logout}</span>
        </button>
      </div>

      {statusMsg && (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-4 py-3 text-xs font-bold">
          {statusMsg}
        </div>
      )}

      {/* Install PWA */}
      <PWAInstallButton />

      {onOpenSchoolGateway && (
        <button
          type="button"
          onClick={onOpenSchoolGateway}
          className="w-full min-h-[48px] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] px-5 font-bold text-sm text-[var(--color-text)] flex items-center justify-between"
        >
          <span className="inline-flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-[var(--color-primary)]" />
            <span>{t.school.pageTitle}</span>
          </span>
          <span className="text-xs text-[var(--color-primary)] font-bold">{t.common.open}</span>
        </button>
      )}

      {/* Admin Dashboard Trigger */}
      {user.role === 'primary_admin' && (
        <button
          type="button"
          onClick={() => setShowAdminModal(true)}
          className="w-full min-h-[52px] rounded-3xl bg-[var(--color-primary)] text-[var(--color-on-primary)] px-5 font-extrabold text-sm flex items-center justify-between shadow-sm"
        >
          <span className="inline-flex items-center gap-2.5">
            <Shield className="w-5 h-5" />
            <span>{t.settings.adminDashboard}</span>
          </span>
          <span className="text-xs opacity-90">{t.common.open}</span>
        </button>
      )}

      {/* Language & Direction */}
      <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <Globe className="w-4 h-4 text-[var(--color-primary)]" />
          <span>{t.settings.language}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([
            { code: 'ar', label: 'العربية (RTL)' },
            { code: 'en', label: 'English (LTR)' },
            { code: 'fr', label: 'Français (LTR)' },
          ] as Array<{ code: LanguageCode; label: string }>).map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLanguage(l.code)}
              className={`min-h-[44px] rounded-2xl text-xs font-bold border transition-colors ${
                lang === l.code
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text)]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      {/* My Subjects Management */}
      <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3.5">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
          <span>{t.subjects.mySubjects}</span>
        </div>
        <SubjectManagerPanel
          ctx={ctx}
          onChanged={async () => {
            await loadSubjects();
            if (onSubjectsChanged) await onSubjectsChanged();
          }}
        />
      </section>

      {/* Appearance & Theme */}
      <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <Palette className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.settings.appearance}</span>
          </div>
          <button
            type="button"
            onClick={async () => {
              const reset = await services.theme.resetToDefault(themeConfig);
              onThemeUpdated(reset);
            }}
            className="min-h-[36px] px-3 rounded-xl text-xs font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.settings.resetTheme}</span>
          </button>
        </div>

        {/* Ready-made Palettes (9) */}
        <div>
          <div className="text-xs font-bold text-[var(--color-text-muted)] mb-2">
            {t.settings.palettes}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {THEME_PALETTES.map((pal) => {
              const active = themeConfig.paletteId === pal.id && themeConfig.primaryColor === pal.primary;
              return (
                <button
                  key={pal.id}
                  type="button"
                  onClick={() =>
                    handleSaveTheme({ paletteId: pal.id, primaryColor: pal.primary })
                  }
                  className={`min-h-[48px] p-2 rounded-2xl border text-start flex items-center gap-2 ${
                    active
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/40'
                      : 'border-[var(--color-border)]'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-full shrink-0"
                    style={{ backgroundColor: pal.primary }}
                  />
                  <span className="text-[11px] font-bold leading-tight line-clamp-2">
                    {pickLocalized(pal.names)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Color Picker */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-[var(--color-text)]">
            {t.settings.customColor}
          </span>
          <input
            type="color"
            value={themeConfig.primaryColor}
            onChange={(e) =>
              handleSaveTheme({ paletteId: 'custom', primaryColor: e.target.value })
            }
            className="w-12 h-10 rounded-xl border border-[var(--color-border)] cursor-pointer bg-transparent"
          />
        </div>

        {/* Light / Dark / System */}
        <div>
          <div className="text-xs font-bold text-[var(--color-text-muted)] mb-2">
            {t.settings.themeMode}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'light', label: t.settings.light },
              { id: 'dark', label: t.settings.dark },
              { id: 'system', label: t.settings.system },
            ] as const).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSaveTheme({ mode: m.id })}
                className={`min-h-[42px] rounded-xl text-xs font-bold border ${
                  themeConfig.mode === m.id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'border-[var(--color-border)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Font Size Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>{t.settings.fontSize}</span>
            <span className="tabular-nums">{themeConfig.fontSizePx}px</span>
          </div>
          <input
            type="range"
            min={14}
            max={20}
            step={1}
            value={themeConfig.fontSizePx}
            onChange={(e) => handleSaveTheme({ fontSizePx: Number(e.target.value) })}
            className="w-full accent-[var(--color-primary)]"
          />
        </div>

        {/* Per-Card Accent Color & Icon */}
        <div className="pt-2 border-t border-[var(--color-border)] space-y-2.5">
          <div className="text-xs font-bold text-[var(--color-text-muted)]">
            {t.settings.cardCustomization}
          </div>
          <select
            value={customSectionSlug}
            onChange={(e) => setCustomSectionSlug(e.target.value)}
            className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold"
          >
            <option value="">--</option>
            {(customizableCards && customizableCards.length > 0 ? customizableCards : mainSections).map(
              (s) => (
                <option key={s.id} value={getSlug(s.id)}>
                  {pickLocalized(s.names)}
                </option>
              )
            )}
          </select>

          {customSectionSlug && (
            <div className="space-y-2.5 rounded-2xl bg-[var(--color-background)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{t.settings.customColor}</span>
                <input
                  type="color"
                  value={
                    themeConfig.cardOverrides[customSectionSlug]?.accentColor ||
                    (customizableCards && customizableCards.length > 0
                      ? customizableCards
                      : mainSections
                    ).find((s) => getSlug(s.id) === customSectionSlug)?.accentColor ||
                    '#1e40af'
                  }
                  onChange={async (e) => {
                    const updated = await services.theme.updateCardOverride(
                      themeConfig,
                      customSectionSlug,
                      { accentColor: e.target.value }
                    );
                    onThemeUpdated(updated);
                  }}
                  className="w-10 h-8 rounded-lg border border-[var(--color-border)]"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_CARD_ICONS.map((iconName) => {
                  const active =
                    themeConfig.cardOverrides[customSectionSlug]?.icon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={async () => {
                        const updated = await services.theme.updateCardOverride(
                          themeConfig,
                          customSectionSlug,
                          { icon: iconName }
                        );
                        onThemeUpdated(updated);
                      }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                        active
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                      }`}
                    >
                      <DynamicIcon name={iconName} className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Settings -> Grading Formula Configuration */}
      {gradingConfig && (
        <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Calculator className="w-4 h-4 text-[var(--color-primary)]" />
              <span>{t.grades.formulaSettingsTitle}</span>
            </div>
            <button
              type="button"
              onClick={async () => {
                const reset = await services.grades.resetGradingConfig(gradingConfig);
                setGradingConfig(reset);
                setRuleLevelScope('default');
                setRuleSubjectScope('all');
              }}
              className="min-h-[36px] px-3 rounded-xl text-xs font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.grades.resetFormula}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.grades.levelScope}
              </label>
              <select
                value={ruleLevelScope}
                onChange={(e) =>
                  setRuleLevelScope(e.target.value as 'default' | MiddleSchoolLevel)
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold"
              >
                <option value="default">{t.grades.allLevelsDefault}</option>
                <option value="1M">1M</option>
                <option value="2M">2M</option>
                <option value="3M">3M</option>
                <option value="4M">4M</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.grades.subjectScope}
              </label>
              <select
                value={
                  ruleSubjectScope === 'all' || activeSubjects.some((s) => s.id === ruleSubjectScope)
                    ? ruleSubjectScope
                    : 'all'
                }
                onChange={(e) =>
                  setRuleSubjectScope(e.target.value as 'all' | GradeSubjectKey)
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold"
              >
                <option value="all">{t.grades.allSubjectsDefault}</option>
                {activeSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {pickLocalized(sub.names)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.grades.weightContinuous}
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={activeRule.continuousWeight}
                onChange={(e) =>
                  handleUpdateFormulaRule({
                    continuousWeight: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.grades.weightAssignment}
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={activeRule.assignmentWeight}
                onChange={(e) =>
                  handleUpdateFormulaRule({
                    assignmentWeight: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.grades.weightExam}
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={activeRule.examWeight}
                onChange={(e) =>
                  handleUpdateFormulaRule({
                    examWeight: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.grades.maxGradeLabel}
              </label>
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                value={activeRule.maxGrade}
                onChange={(e) =>
                  handleUpdateFormulaRule({
                    maxGrade: Math.max(1, Number(e.target.value) || 20),
                  })
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
              {t.grades.termWeightsLabel}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([0, 1, 2] as const).map((idx) => (
                <input
                  key={idx}
                  type="number"
                  min={0}
                  step={0.5}
                  value={activeRule.annualTermWeights[idx]}
                  onChange={(e) => {
                    const next: [number, number, number] = [...activeRule.annualTermWeights] as [
                      number,
                      number,
                      number,
                    ];
                    next[idx] = Math.max(0, Number(e.target.value) || 0);
                    handleUpdateFormulaRule({ annualTermWeights: next });
                  }}
                  className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold tabular-nums text-center"
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--color-background)] px-3 py-2 text-xs text-[var(--color-text-muted)] tabular-nums">
            <span className="font-bold text-[var(--color-text)]">{t.grades.formulaInUse} </span>
            ({activeRule.continuousWeight}×{t.grades.continuous} + {activeRule.assignmentWeight}×
            {t.grades.assignment} + {activeRule.examWeight}×{t.grades.exam}) /{' '}
            {activeRule.continuousWeight + activeRule.assignmentWeight + activeRule.examWeight}
          </div>
        </section>
      )}

      {/* Settings -> Seating Evaluation Criteria */}
      {user.role !== 'teacher_read' && user.role !== 'banned' && (
        <SeatingCriteriaSettings ctx={ctx} />
      )}

      {/* Academic-Year Gateway */}
      <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3.5">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <Archive className="w-4 h-4 text-[var(--color-primary)]" />
          <span>{t.settings.academicGateway}</span>
        </div>

        <div className="space-y-2">
          {years.map((yr) => (
            <button
              key={yr.id}
              type="button"
              onClick={async () => {
                await services.years.setViewingYear(yr.id);
                await onYearChanged();
              }}
              className={`w-full min-h-[48px] px-4 rounded-2xl border flex items-center justify-between text-xs font-bold ${
                yr.id === activeViewingYear.id
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/50 text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-text)]'
              }`}
            >
              <span className="tabular-nums text-sm">{yr.label}</span>
              <span>{yr.isArchived ? t.settings.archiveBadge : t.settings.activeBadge}</span>
            </button>
          ))}
        </div>

        {yearArchiveSummary && (
          <div className="rounded-2xl bg-[var(--color-background)] border border-[var(--color-border)] p-3 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-extrabold">{t.library.archiveYearSummary}</span>
              <span className="font-bold tabular-nums text-[var(--color-text-muted)]">
                {yearArchiveSummary.fileCount} {t.common.filesCount} ·{' '}
                {formatFileSize(yearArchiveSummary.totalBytes)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const blob = await services.archive.exportYearZip(activeViewingYear.id);
                  if (!blob) return;
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `year_${activeViewingYear.label.replace(/\//g, '-')}.zip`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] font-bold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                <span>{t.library.exportYearZip}</span>
              </button>
              {user.role === 'primary_admin' && !activeViewingYear.isArchived && (
                <button
                  type="button"
                  onClick={async () => {
                    await services.archive.archiveAcademicYear(activeViewingYear.id);
                    await onYearChanged();
                  }}
                  className="min-h-[38px] px-3 rounded-xl bg-amber-600 text-white font-bold inline-flex items-center gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{t.library.archiveThisYear}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {user.role === 'primary_admin' && (
          <form onSubmit={handleOpenNewYear} className="pt-3 border-t border-[var(--color-border)] space-y-3">
            <input
              type="text"
              required
              value={newYearLabel}
              onChange={(e) => setNewYearLabel(e.target.value)}
              placeholder={t.settings.newYearLabel}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm tabular-nums"
            />
            <div className="space-y-1.5 text-xs font-semibold">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={copyMode === 'structure_only'}
                  onChange={() => setCopyMode('structure_only')}
                  className="accent-[var(--color-primary)]"
                />
                <span>{t.settings.copyStructureOnly}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={copyMode === 'structure_with_files'}
                  onChange={() => setCopyMode('structure_with_files')}
                  className="accent-[var(--color-primary)]"
                />
                <span>{t.settings.copyWithFiles}</span>
              </label>
            </div>

            {copyMode === 'structure_with_files' && yearFiles.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-xl border border-[var(--color-border)] p-2 space-y-1">
                {yearFiles.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(f.id)}
                      onChange={(e) => {
                        setSelectedFileIds((prev) =>
                          e.target.checked ? [...prev, f.id] : prev.filter((id) => id !== f.id)
                        );
                      }}
                    />
                    <span className="truncate">{f.name}</span>
                  </label>
                ))}
              </div>
            )}

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center justify-center gap-2"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>{t.settings.openNewYear}</span>
            </button>
          </form>
        )}
      </section>

      {/* Storage & Backup */}
      <section className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-extrabold">
          <HardDrive className="w-4 h-4 text-[var(--color-primary)]" />
          <span>{t.settings.storageAndBackup}</span>
        </div>

        {storage && (
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between tabular-nums">
              <span className="text-[var(--color-text-muted)]">{t.settings.usedStorage}</span>
              <span className="font-bold">
                {(storage.usageBytes / (1024 * 1024)).toFixed(2)} MB /{' '}
                {(storage.quotaBytes / (1024 * 1024)).toFixed(0)} MB ({storage.percentUsed}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--color-background)] overflow-hidden">
              <div
                className={`h-full ${storage.isNearFull ? 'bg-red-600' : 'bg-[var(--color-primary)]'}`}
                style={{ width: `${Math.max(2, storage.percentUsed)}%` }}
              />
            </div>
            {storage.isNearFull && (
              <p className="text-red-600 font-bold">{t.files.storageWarning}</p>
            )}
            {storage.persisted && (
              <p className="text-emerald-600 font-semibold">{t.settings.persistentStorage}</p>
            )}
            {lastBackup && (
              <p className="text-[var(--color-text-muted)] tabular-nums">
                {t.common.date}: {lastBackup.slice(0, 16).replace('T', ' ')}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleExportZip}
            className="min-h-[46px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{t.settings.exportZip}</span>
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept=".zip,.json"
            onChange={handleImportBackup}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-bold inline-flex items-center justify-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>{t.settings.importBackup}</span>
          </button>
        </div>

        {/* Local Search Index Status */}
        {indexStatus && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2 text-xs">
            <div className="flex items-center justify-between font-extrabold">
              <span className="inline-flex items-center gap-1.5">
                <Search className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.library.searchIndexStatus}</span>
              </span>
              <span className="tabular-nums text-[var(--color-primary)]">
                {indexStatus.indexedFiles} / {indexStatus.totalIndexableFiles}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-text-muted)]">
              <span>
                {t.library.scannedNeedOcr}:{' '}
                <strong className="tabular-nums">{indexStatus.scannedUnsearchableCount}</strong>
              </span>
              {indexStatus.lastIndexedAt && (
                <span className="tabular-nums">
                  {indexStatus.lastIndexedAt.slice(0, 16).replace('T', ' ')}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={rebuildingIndex}
              onClick={async () => {
                setRebuildingIndex(true);
                setRebuildProgress({ done: 0, total: indexStatus.totalIndexableFiles });
                try {
                  const updated = await services.search.rebuildIndex(
                    activeViewingYear.id,
                    (done, total) => setRebuildProgress({ done, total })
                  );
                  setIndexStatus(updated);
                } finally {
                  setRebuildingIndex(false);
                  setRebuildProgress(null);
                }
              }}
              className="w-full min-h-[42px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <RotateCcw className={`w-4 h-4 ${rebuildingIndex ? 'animate-spin' : ''}`} />
              <span>
                {rebuildingIndex && rebuildProgress
                  ? `${t.library.rebuildingIndex} (${rebuildProgress.done}/${rebuildProgress.total})`
                  : t.library.rebuildIndex}
              </span>
            </button>
          </div>
        )}
      </section>

      <AdminDashboardModal
        open={showAdminModal}
        ctx={ctx}
        currentUser={user}
        mainSections={mainSections}
        onClose={() => setShowAdminModal(false)}
      />
    </div>
  );
};
