import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  CalendarPlus,
  Download,
  Globe,
  HardDrive,
  LogOut,
  Palette,
  RotateCcw,
  Shield,
  Upload,
} from 'lucide-react';
import { THEME_PALETTES } from '@/src/db/seedDefaults';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { StorageStats } from '@/src/services/FilesService';
import type {
  AcademicYearRecord,
  FileRecord,
  LanguageCode,
  SectionNode,
  ThemeConfigRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { AVAILABLE_CARD_ICONS, DynamicIcon } from '@/src/components/common/DynamicIcon';
import { PWAInstallButton } from '@/src/components/common/PWAInstallButton';
import { AdminDashboardModal } from './AdminDashboardModal';

interface SettingsViewProps {
  ctx: ServiceContext;
  user: UserRecord;
  themeConfig: ThemeConfigRecord;
  years: AcademicYearRecord[];
  activeViewingYear: AcademicYearRecord;
  mainSections: SectionNode[];
  onThemeUpdated: (cfg: ThemeConfigRecord) => void;
  onYearChanged: () => Promise<void>;
  onFullReload: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  ctx,
  user,
  themeConfig,
  years,
  activeViewingYear,
  mainSections,
  onThemeUpdated,
  onYearChanged,
  onFullReload,
  onLogout,
}) => {
  const { t, lang, setLanguage, pickLocalized } = useI18n();
  const [storage, setStorage] = useState<StorageStats | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // New Academic Year Gateway state
  const [newYearLabel, setNewYearLabel] = useState('2027/2028');
  const [copyMode, setCopyMode] = useState<'structure_only' | 'structure_with_files'>('structure_only');
  const [yearFiles, setYearFiles] = useState<FileRecord[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [statusMsg, setStatusMsg] = useState('');

  // Per-card customization
  const [customSectionSlug, setCustomSectionSlug] = useState('');

  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    services.files.getStorageStats().then(setStorage);
    services.backup.getLastBackupDate().then(setLastBackup);
    services.files.listAllForYear(activeViewingYear.id).then(setYearFiles);
  }, [activeViewingYear.id]);

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
            {mainSections.map((s) => (
              <option key={s.id} value={getSlug(s.id)}>
                {pickLocalized(s.names)}
              </option>
            ))}
          </select>

          {customSectionSlug && (
            <div className="space-y-2.5 rounded-2xl bg-[var(--color-background)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{t.settings.customColor}</span>
                <input
                  type="color"
                  value={
                    themeConfig.cardOverrides[customSectionSlug]?.accentColor ||
                    mainSections.find((s) => getSlug(s.id) === customSectionSlug)?.accentColor ||
                    '#0f766e'
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
