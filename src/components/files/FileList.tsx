import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  Eye,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Film,
  FolderInput,
  Image as ImageIcon,
  Link2,
  Music,
  Search,
  Star,
  Tag,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { normalizeSearchText } from '@/src/services/crypto';
import type { FileRecord, SectionNode } from '@/src/types/models';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { EmptyState } from '@/src/components/common/EmptyState';

interface FileListProps {
  files: FileRecord[];
  allSections?: SectionNode[];
  canWrite: boolean;
  showSolutionSupport?: boolean;
  onOpenFile: (file: FileRecord) => void;
  onChanged: () => void;
}

export const FileList: React.FC<FileListProps> = ({
  files,
  allSections = [],
  canWrite,
  showSolutionSupport = false,
  onOpenFile,
  onChanged,
}) => {
  const { t, pickLocalized } = useI18n();
  const [filterText, setFilterText] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'sequential' | 'newest' | 'name'>('sequential');
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState<FileRecord | null>(null);
  const [moveSectionId, setMoveSectionId] = useState('');
  const [tagTarget, setTagTarget] = useState<FileRecord | null>(null);
  const [tagValue, setTagValue] = useState('');
  const [linkTarget, setLinkTarget] = useState<FileRecord | null>(null);

  const fileMap = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(filterText);
    const list = files.filter((f) => {
      if (favOnly && !f.isFavorite) return false;
      if (!q) return true;
      return (
        normalizeSearchText(f.name).includes(q) ||
        f.tags.some((tg) => normalizeSearchText(tg).includes(q))
      );
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt.localeCompare(a.createdAt);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if ((a.termNumber ?? 0) !== (b.termNumber ?? 0)) {
        return (a.termNumber ?? 0) - (b.termNumber ?? 0);
      }
      return a.order - b.order;
    });
  }, [files, filterText, favOnly, sortBy]);

  const renderIcon = (f: FileRecord) => {
    const ext = f.extension.toLowerCase();
    if (f.externalUrl) return <Link2 className="w-5 h-5 text-purple-600" />;
    if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (['pdf', 'doc', 'docx'].includes(ext)) return <FileText className="w-5 h-5 text-blue-600" />;
    if (f.mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-amber-600" />;
    if (f.mimeType.startsWith('audio/')) return <Music className="w-5 h-5 text-pink-600" />;
    if (f.mimeType.startsWith('video/')) return <Film className="w-5 h-5 text-indigo-600" />;
    return <FileIcon className="w-5 h-5 text-[var(--color-primary)]" />;
  };

  const handleOpen = async (f: FileRecord) => {
    await services.files.markOpened(f.id);
    onOpenFile(f);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    await services.files.deleteFile(deleteTarget.id);
    setDeleteTarget(null);
    onChanged();
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    await services.files.renameFile(renameTarget.id, renameValue);
    setRenameTarget(null);
    onChanged();
  };

  const handleSaveMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveTarget || !moveSectionId) return;
    await services.files.moveFile(moveTarget.id, moveSectionId);
    setMoveTarget(null);
    onChanged();
  };

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagTarget || !tagValue.trim()) return;
    await services.files.updateTags(tagTarget.id, [...tagTarget.tags, tagValue.trim()]);
    setTagValue('');
    setTagTarget(null);
    onChanged();
  };

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder={t.files.searchFiles}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ps-9 pe-3 text-xs text-[var(--color-text)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setFavOnly((v) => !v)}
            className={`min-h-[42px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border ${
              favOnly
                ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300'
                : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${favOnly ? 'fill-current' : ''}`} />
            <span>{t.common.favorites}</span>
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'sequential' | 'newest' | 'name')}
            className="min-h-[42px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)]"
          >
            <option value="sequential">{t.files.sortSequential}</option>
            <option value="newest">{t.files.sortNewest}</option>
            <option value="name">{t.files.sortName}</option>
          </select>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title={t.common.noFiles} />
      ) : (
        <div className="divide-y divide-[var(--color-border)] rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden">
          {filtered.map((f) => {
            const linkedSol = f.linkedSolutionFileId ? fileMap.get(f.linkedSolutionFileId) : undefined;
            return (
              <div
                key={f.id}
                className="p-3.5 flex flex-col gap-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpen(f)}
                    className="w-11 h-11 rounded-2xl bg-[var(--color-background)] flex items-center justify-center shrink-0"
                  >
                    {renderIcon(f)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpen(f)}
                    className="flex-1 min-w-0 text-start"
                  >
                    <div className="text-sm font-bold text-[var(--color-text)] truncate">
                      {f.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      <span>{f.extension.toUpperCase()}</span>
                      <span>·</span>
                      <span>{(f.size / 1024).toFixed(1)} KB</span>
                      <span>·</span>
                      <span>{f.createdAt.slice(0, 10)}</span>
                      {f.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-[var(--color-primary)] font-semibold">
                            {f.tags.join(' / ')}
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={async () => {
                        await services.files.toggleFavorite(f.id);
                        onChanged();
                      }}
                      aria-label={t.common.favorites}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          f.isFavorite ? 'fill-amber-400 text-amber-500' : ''
                        }`}
                      />
                    </button>

                    {canWrite && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setTagTarget(f);
                            setTagValue('');
                          }}
                          aria-label={t.common.tags}
                          className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        >
                          <Tag className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTarget(f);
                            setRenameValue(f.name);
                          }}
                          aria-label={t.common.rename}
                          className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        {allSections.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setMoveTarget(f);
                              setMoveSectionId(f.sectionId);
                            }}
                            aria-label={t.common.move}
                            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                          >
                            <FolderInput className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(f)}
                          aria-label={t.common.delete}
                          className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {showSolutionSupport && (
                  <div className="flex flex-wrap items-center gap-2 ps-14">
                    {linkedSol ? (
                      <button
                        type="button"
                        onClick={() => handleOpen(linkedSol)}
                        className="min-h-[36px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
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
                        onClick={() => setLinkTarget(f)}
                        className="min-h-[36px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text)] inline-flex items-center gap-1.5"
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t.common.delete}
        message={t.files.confirmDeleteFile}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveRename}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-4"
          >
            <h3 className="text-sm font-bold">{t.files.renameFile}</h3>
            <input
              type="text"
              required
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
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

      {moveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveMove}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-4"
          >
            <h3 className="text-sm font-bold">{t.files.moveFile}</h3>
            <select
              value={moveSectionId}
              onChange={(e) => setMoveSectionId(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
            >
              {allSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {pickLocalized(s.names)}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveTarget(null)}
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

      {tagTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleAddTag}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-4"
          >
            <h3 className="text-sm font-bold">{t.common.tags}</h3>
            <input
              type="text"
              required
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder={t.common.addTag}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTagTarget(null)}
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

      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-3">
            <h3 className="text-sm font-bold">{t.sections.selectSolutionFile}</h3>
            <div className="max-h-60 overflow-auto divide-y divide-[var(--color-border)]">
              {files
                .filter((cand) => cand.id !== linkTarget.id)
                .map((cand) => (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={async () => {
                      await services.files.linkSolution(linkTarget.id, cand.id);
                      setLinkTarget(null);
                      onChanged();
                    }}
                    className="w-full py-2.5 px-2 text-start text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 truncate"
                  >
                    {cand.name}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setLinkTarget(null)}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] text-xs font-bold"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
