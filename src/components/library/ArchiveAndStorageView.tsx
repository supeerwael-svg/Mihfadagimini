import React, { useEffect, useState } from 'react';
import {
  Archive,
  CopyCheck,
  Download,
  HardDrive,
  ImageDown,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { StorageBreakdown, YearArchiveSummary } from '@/src/services/ArchiveService';
import { getFileTitle } from '@/src/services/FilesService';
import type { DuplicateGroup } from '@/src/services/LibraryService';
import type { AcademicYearRecord, FileRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { formatFileSize, formatShortDate } from '@/src/utils/fileFormat';
import { EmptyState } from '@/src/components/common/EmptyState';

interface ArchiveAndStorageViewProps {
  ctx: ServiceContext;
  canWrite: boolean;
  years: AcademicYearRecord[];
  onOpenFile: (f: FileRecord) => void;
  onChanged: () => Promise<void> | void;
}

type SubPanel = 'storage' | 'archived' | 'trash' | 'duplicates' | 'suggestions' | 'years';

export const ArchiveAndStorageView: React.FC<ArchiveAndStorageViewProps> = ({
  ctx,
  canWrite,
  years,
  onOpenFile,
  onChanged,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [panel, setPanel] = useState<SubPanel>('storage');
  const [breakdown, setBreakdown] = useState<StorageBreakdown | null>(null);
  const [archivedFiles, setArchivedFiles] = useState<FileRecord[]>([]);
  const [trashedFiles, setTrashedFiles] = useState<FileRecord[]>([]);
  const [dupGroups, setDupGroups] = useState<DuplicateGroup[]>([]);
  const [suggestions, setSuggestions] = useState<FileRecord[]>([]);
  const [yearSummaries, setYearSummaries] = useState<YearArchiveSummary[]>([]);
  const [actionMsg, setActionMsg] = useState('');

  const loadAll = async () => {
    const [bd, arch, tr, dups, sugg, sums] = await Promise.all([
      services.archive.getStorageBreakdown(ctx.schoolId),
      services.archive.listArchivedFiles(ctx.academicYearId),
      services.archive.listTrashedFiles(ctx.academicYearId),
      services.library.listDuplicateGroups(ctx.academicYearId),
      services.archive.getAutoArchiveSuggestions(ctx.academicYearId, 180),
      Promise.all(years.map((y) => services.archive.getYearArchiveSummary(y.id))),
    ]);
    setBreakdown(bd);
    setArchivedFiles(arch);
    setTrashedFiles(tr);
    setDupGroups(dups);
    setSuggestions(sugg);
    setYearSummaries(sums.filter((s): s is YearArchiveSummary => Boolean(s)));
  };

  useEffect(() => {
    loadAll();
  }, [ctx.academicYearId, ctx.schoolId, years.length]);

  const handleCompressImages = async () => {
    const res = await services.archive.compressLargeImagesToFreeSpace(ctx.academicYearId);
    setActionMsg(
      `${res.compressedCount} ${t.common.filesCount} · ${formatFileSize(res.savedBytes)}`
    );
    await loadAll();
    await onChanged();
  };

  const handleExportYearZip = async (yearId: string, label: string) => {
    const blob = await services.archive.exportYearZip(yearId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio_year_${label.replace(/[/\\]/g, '_')}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {actionMsg && (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-4 py-2.5 text-xs font-bold">
          {actionMsg}
        </div>
      )}

      {/* Horizontal pill-free navigation tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'storage', label: t.library.storageManager },
            { id: 'archived', label: `${t.library.archivedFiles} (${archivedFiles.length})` },
            { id: 'trash', label: `${t.library.trashBin} (${trashedFiles.length})` },
            { id: 'duplicates', label: `${t.library.duplicatesReview} (${dupGroups.length})` },
            { id: 'suggestions', label: `${t.library.autoArchiveTitle} (${suggestions.length})` },
            { id: 'years', label: t.library.archiveYearSummary },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPanel(item.id)}
            className={`min-h-[40px] px-3 rounded-xl text-xs font-bold whitespace-nowrap border shrink-0 ${
              panel === item.id
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)] border-[var(--color-primary)]'
                : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {panel === 'storage' && breakdown && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-extrabold">
                <HardDrive className="w-4 h-4 text-[var(--color-primary)]" />
                <span>{t.library.storageManager}</span>
              </div>
              <span className="text-sm font-extrabold text-[var(--color-primary)] tabular-nums">
                {formatFileSize(breakdown.totalBytes)}
              </span>
            </div>

            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {breakdown.compressibleImagesCount > 0 && (
                  <button
                    type="button"
                    onClick={handleCompressImages}
                    className="min-h-[42px] px-3.5 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <ImageDown className="w-4 h-4" />
                    <span>
                      {t.library.compressImagesFreeSpace} ({breakdown.compressibleImagesCount})
                    </span>
                  </button>
                )}
                {breakdown.duplicateGroupsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setPanel('duplicates')}
                    className="min-h-[42px] px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <CopyCheck className="w-4 h-4" />
                    <span>
                      {t.library.reclaimableSpace}:{' '}
                      {formatFileSize(breakdown.duplicateReclaimableBytes)}
                    </span>
                  </button>
                )}
              </div>
            )}

            {/* Breakdown by Type */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)]">
              <div className="text-xs font-extrabold text-[var(--color-text-muted)]">
                {t.library.byFileType}
              </div>
              {breakdown.byCategory.map((item) => {
                const pct =
                  breakdown.totalBytes > 0
                    ? Math.max(4, Math.round((item.bytes / breakdown.totalBytes) * 100))
                    : 0;
                return (
                  <div key={item.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold tabular-nums">
                      <span className="uppercase">{item.category}</span>
                      <span>
                        {item.count} · {formatFileSize(item.bytes)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-background)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--color-primary)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Breakdown by Section */}
            <div className="space-y-1.5 pt-2 border-t border-[var(--color-border)]">
              <div className="text-xs font-extrabold text-[var(--color-text-muted)]">
                {t.library.bySection}
              </div>
              {breakdown.bySection.slice(0, 6).map((item) => (
                <div
                  key={item.sectionId}
                  className="flex items-center justify-between text-xs py-1 tabular-nums"
                >
                  <span className="font-semibold truncate">
                    {item.section ? pickLocalized(item.section.names) : item.sectionId}
                  </span>
                  <span className="text-[var(--color-text-muted)] shrink-0">
                    {item.count} · {formatFileSize(item.bytes)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Largest files */}
          <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2">
            <div className="text-xs font-extrabold text-[var(--color-text-muted)]">
              {t.library.largestFiles}
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {breakdown.largestFiles.slice(0, 10).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onOpenFile(f)}
                  className="w-full py-2.5 flex items-center justify-between gap-2 text-start"
                >
                  <span className="text-xs font-bold truncate">{getFileTitle(f)}</span>
                  <span className="text-xs font-extrabold text-[var(--color-primary)] tabular-nums shrink-0">
                    {formatFileSize(f.size)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {panel === 'archived' &&
        (archivedFiles.length === 0 ? (
          <EmptyState title={t.common.noFiles} />
        ) : (
          <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
            {archivedFiles.map((f) => (
              <div key={f.id} className="p-3.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenFile(f)}
                  className="flex-1 min-w-0 text-start"
                >
                  <div className="text-sm font-bold truncate">{getFileTitle(f)}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                    {formatFileSize(f.size)} · {formatShortDate(f.archivedAt || f.updatedAt, lang)}
                  </div>
                </button>
                {canWrite && (
                  <button
                    type="button"
                    onClick={async () => {
                      await services.archive.restoreArchivedFile(f.id);
                      await loadAll();
                      await onChanged();
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.library.restoreFromArchive}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}

      {panel === 'trash' && (
        <div className="space-y-3">
          {canWrite && trashedFiles.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  await services.archive.emptyTrash(ctx.academicYearId);
                  await loadAll();
                  await onChanged();
                }}
                className="min-h-[40px] px-3.5 rounded-xl bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.library.emptyTrash}</span>
              </button>
            </div>
          )}

          {trashedFiles.length === 0 ? (
            <EmptyState title={t.subjects.trashEmpty} />
          ) : (
            <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
              {trashedFiles.map((f) => (
                <div key={f.id} className="p-3.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{getFileTitle(f)}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {formatFileSize(f.size)} · {formatShortDate(f.trashedAt || f.updatedAt, lang)}
                    </div>
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          await services.archive.restoreFromTrash(f.id);
                          await loadAll();
                          await onChanged();
                        }}
                        className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t.library.restoreFile}</span>
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await services.archive.purgeFileForever(f.id);
                          await loadAll();
                          await onChanged();
                        }}
                        className="min-h-[38px] px-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 text-xs font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {panel === 'duplicates' &&
        (dupGroups.length === 0 ? (
          <EmptyState title={t.common.noFiles} />
        ) : (
          <div className="space-y-3">
            {dupGroups.map((g) => (
              <div
                key={g.key}
                className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[var(--color-text)] truncate">
                    {getFileTitle(g.files[0])} ({g.files.length})
                  </span>
                  <span className="text-xs font-bold text-amber-600 tabular-nums shrink-0">
                    +{formatFileSize(g.wastedBytes)}
                  </span>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={async () => {
                      await services.library.mergeDuplicateGroup(
                        g.files[0].id,
                        g.files.slice(1).map((x) => x.id)
                      );
                      await loadAll();
                      await onChanged();
                    }}
                    className="w-full min-h-[42px] rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <CopyCheck className="w-4 h-4" />
                    <span>{t.library.mergeKeepLatest}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}

      {panel === 'suggestions' &&
        (suggestions.length === 0 ? (
          <EmptyState title={t.common.noFiles} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--color-text-muted)]">
                <Sparkles className="w-3.5 h-3.5 inline me-1 text-amber-500" />
                {t.library.autoArchiveDesc}
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={async () => {
                    await services.library.bulkArchive(
                      suggestions.map((f) => f.id),
                      true
                    );
                    await loadAll();
                    await onChanged();
                  }}
                  className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold shrink-0"
                >
                  {t.library.archiveFile} ({suggestions.length})
                </button>
              )}
            </div>
            <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
              {suggestions.map((f) => (
                <div key={f.id} className="p-3.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold truncate">{getFileTitle(f)}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {formatShortDate(f.lastOpenedAt || f.createdAt, lang)} ·{' '}
                      {formatFileSize(f.size)}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={async () => {
                        await services.archive.archiveFile(f.id);
                        await loadAll();
                        await onChanged();
                      }}
                      className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>{t.library.archiveFile}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

      {panel === 'years' && (
        <div className="space-y-3">
          {yearSummaries.map((sum) => (
            <div
              key={sum.year.id}
              className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold tabular-nums">{sum.year.label}</span>
                <span className="text-xs font-bold text-[var(--color-primary)]">
                  {sum.year.isArchived ? t.settings.archiveBadge : t.settings.activeBadge}
                </span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)] tabular-nums">
                {sum.fileCount} {t.common.filesCount} · {formatFileSize(sum.totalBytes)} ·{' '}
                {sum.sectionsCount} {t.home.sectionsHeading}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleExportYearZip(sum.year.id, sum.year.label)}
                  className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.library.exportYearZip}</span>
                </button>
                {canWrite && !sum.year.isArchived && sum.year.id !== ctx.academicYearId && (
                  <button
                    type="button"
                    onClick={async () => {
                      await services.archive.archiveAcademicYear(sum.year.id);
                      await loadAll();
                      await onChanged();
                    }}
                    className="min-h-[40px] px-3 rounded-xl bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{t.library.archiveThisYear}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
