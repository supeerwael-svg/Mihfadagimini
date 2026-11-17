import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Edit3,
  Eye,
  EyeOff,
  Folder,
  FolderPlus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  FileRecord,
  LocalizedText,
  SectionNode,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';
import { FileList } from '@/src/components/files/FileList';
import { FileUploadBar } from '@/src/components/files/FileUploadBar';
import { DailyJournalView } from '@/src/components/journal/DailyJournalView';
import { ForumAndChatView } from '@/src/components/forum/ForumAndChatView';
import { SeminarsView } from './SeminarsView';
import { StudentListsView } from './StudentListsView';

interface SectionExplorerProps {
  ctx: ServiceContext;
  user: UserRecord;
  currentSection: SectionNode;
  isArchiveYear: boolean;
  onNavigateSection: (sec: SectionNode | null) => void;
  onOpenFile: (file: FileRecord) => void;
  onStructureChanged: () => Promise<void>;
  onClassesSynced: () => Promise<void>;
}

export const SectionExplorer: React.FC<SectionExplorerProps> = ({
  ctx,
  user,
  currentSection,
  isArchiveYear,
  onNavigateSection,
  onOpenFile,
  onStructureChanged,
  onClassesSynced,
}) => {
  const { t, dir, pickLocalized } = useI18n();
  const [breadcrumb, setBreadcrumb] = useState<SectionNode[]>([]);
  const [children, setChildren] = useState<SectionNode[]>([]);
  const [allSections, setAllSections] = useState<SectionNode[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [childStats, setChildStats] = useState<
    Record<string, { count: number; totalBytes: number }>
  >({});

  // Editing modals
  const [showAddChild, setShowAddChild] = useState(false);
  const [newNames, setNewNames] = useState<LocalizedText>({ ar: '', en: '', fr: '' });
  const [renameTarget, setRenameTarget] = useState<SectionNode | null>(null);
  const [renameNames, setRenameNames] = useState<LocalizedText>({ ar: '', en: '', fr: '' });
  const [deleteTarget, setDeleteTarget] = useState<SectionNode | null>(null);
  const [deleteMode, setDeleteMode] = useState<'move_files' | 'delete_files'>('move_files');
  const [moveTargetId, setMoveTargetId] = useState('');

  const perm = services.auth.getEffectivePermission(user, currentSection.id);
  const canWrite = !isArchiveYear && perm.write;
  const canComment = !isArchiveYear && perm.comment;

  const loadSectionData = async () => {
    const [crumb, kids, all, secFiles] = await Promise.all([
      services.sections.getBreadcrumb(ctx.academicYearId, currentSection.id),
      services.sections.getChildren(ctx.academicYearId, currentSection.id, true),
      services.sections.getAllForYear(ctx.academicYearId),
      services.files.listBySection(ctx.academicYearId, currentSection.id),
    ]);
    setBreadcrumb(crumb);
    setChildren(kids);
    setAllSections(all);
    setFiles(secFiles);

    const st: Record<string, { count: number; totalBytes: number }> = {};
    for (const k of kids) {
      const desc = await services.sections.getDescendantIds(ctx.academicYearId, k.id);
      const res = await services.files.getFolderStats(ctx.academicYearId, desc);
      st[k.id] = { count: res.count, totalBytes: res.totalBytes };
    }
    setChildStats(st);
  };

  useEffect(() => {
    loadSectionData();
  }, [currentSection.id, ctx.academicYearId]);

  const handleAddChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNames.ar.trim()) return;
    await services.sections.addNode(ctx, {
      parentId: currentSection.id,
      kind: 'subsection',
      featureType: currentSection.featureType,
      names: {
        ar: newNames.ar.trim(),
        en: newNames.en.trim() || newNames.ar.trim(),
        fr: newNames.fr.trim() || newNames.ar.trim(),
      },
      icon: 'Folder',
      accentColor: currentSection.accentColor,
    });
    setNewNames({ ar: '', en: '', fr: '' });
    setShowAddChild(false);
    await loadSectionData();
    await onStructureChanged();
  };

  const handleSaveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const updated = await services.sections.renameNode(renameTarget.id, renameNames);
    setRenameTarget(null);
    if (updated && updated.id === currentSection.id) {
      onNavigateSection(updated);
    }
    await loadSectionData();
    await onStructureChanged();
  };

  const handleRestoreDefault = async (node: SectionNode) => {
    const updated = await services.sections.restoreDefaultNames(node.id);
    if (updated && updated.id === currentSection.id) {
      onNavigateSection(updated);
    }
    await loadSectionData();
    await onStructureChanged();
  };

  const handleReorderChild = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= children.length) return;
    const next = [...children];
    const [item] = next.splice(index, 1);
    next.splice(targetIdx, 0, item);
    await services.sections.reorderNodes(next.map((c) => c.id));
    await loadSectionData();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const deletedCurrent = deleteTarget.id === currentSection.id;
    await services.sections.deleteNodeSafely(
      ctx.academicYearId,
      deleteTarget.id,
      deleteMode,
      moveTargetId || undefined
    );
    setDeleteTarget(null);
    await onStructureChanged();
    if (deletedCurrent) {
      const parent = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2] : null;
      onNavigateSection(parent);
    } else {
      await loadSectionData();
    }
  };

  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const isLeafOrStandard =
    currentSection.featureType !== 'student_lists' &&
    currentSection.featureType !== 'daily_journal' &&
    currentSection.featureType !== 'seminars' &&
    currentSection.featureType !== 'forum_chat';

  return (
    <div className="space-y-4">
      {/* Header & Breadcrumb */}
      <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              const parent = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2] : null;
              onNavigateSection(parent);
            }}
            className="min-h-[42px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <BackIcon className="w-4 h-4" />
            <span>{t.common.back}</span>
          </button>

          {canWrite && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setRenameTarget(currentSection);
                  setRenameNames({ ...currentSection.names });
                }}
                title={t.sections.editNames}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold inline-flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.common.rename}</span>
              </button>
              <button
                type="button"
                onClick={() => handleRestoreDefault(currentSection)}
                title={t.common.restoreDefault}
                className="min-h-[40px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.common.restoreDefault}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const fallbackTarget = allSections.find((s) => s.id !== currentSection.id);
                  setMoveTargetId(fallbackTarget?.id ?? '');
                  setDeleteTarget(currentSection);
                }}
                title={t.common.delete}
                className="min-h-[40px] min-w-[40px] rounded-xl border border-[var(--color-border)] flex items-center justify-center text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          {breadcrumb.map((node, idx) => (
            <React.Fragment key={node.id}>
              {idx > 0 && <span>/</span>}
              <button
                type="button"
                onClick={() => onNavigateSection(node)}
                className={`font-bold ${
                  idx === breadcrumb.length - 1
                    ? 'text-[var(--color-primary)]'
                    : 'hover:text-[var(--color-text)]'
                }`}
              >
                {pickLocalized(node.names)}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Specialized Section Engines */}
      {currentSection.featureType === 'student_lists' && (
        <StudentListsView
          ctx={ctx}
          canWrite={canWrite}
          initialLevel={currentSection.levelCode ?? '1M'}
          onOpenFile={onOpenFile}
          onClassesSynced={onClassesSynced}
        />
      )}

      {currentSection.featureType === 'daily_journal' && (
        <DailyJournalView ctx={ctx} canWrite={canWrite} />
      )}

      {currentSection.featureType === 'seminars' && (
        <SeminarsView
          ctx={ctx}
          sectionId={currentSection.id}
          canWrite={canWrite}
          onOpenFile={onOpenFile}
        />
      )}

      {currentSection.featureType === 'forum_chat' && (
        <ForumAndChatView
          ctx={ctx}
          user={user}
          canComment={canComment}
          canWrite={canWrite}
        />
      )}

      {/* Standard / Assignments & Exams / Audio-Visual Folder Navigation */}
      {isLeafOrStandard && (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold text-[var(--color-text)]">
              {pickLocalized(currentSection.names)}
            </h3>
            {canWrite && (
              <button
                type="button"
                onClick={() => setShowAddChild((v) => !v)}
                className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <FolderPlus className="w-4 h-4" />
                <span>{t.sections.addSubfolder}</span>
              </button>
            )}
          </div>

          {showAddChild && (
            <form
              onSubmit={handleAddChild}
              className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-2.5"
            >
              <input
                type="text"
                required
                value={newNames.ar}
                onChange={(e) => setNewNames((p) => ({ ...p, ar: e.target.value }))}
                placeholder={t.sections.nameAr}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newNames.en}
                  onChange={(e) => setNewNames((p) => ({ ...p, en: e.target.value }))}
                  placeholder={t.sections.nameEn}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                />
                <input
                  type="text"
                  value={newNames.fr}
                  onChange={(e) => setNewNames((p) => ({ ...p, fr: e.target.value }))}
                  placeholder={t.sections.nameFr}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddChild(false)}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-bold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="min-h-[38px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                >
                  {t.common.add}
                </button>
              </div>
            </form>
          )}

          {children.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {children.map((child, idx) => {
                const st = childStats[child.id] || { count: 0, totalBytes: 0 };
                return (
                  <div
                    key={child.id}
                    className={`rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3 flex items-center justify-between gap-2 ${
                      child.isHidden ? 'opacity-50' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onNavigateSection(child)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-start"
                    >
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${child.accentColor}1F`,
                          color: child.accentColor,
                        }}
                      >
                        <DynamicIcon name={child.icon || 'Folder'} className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[var(--color-text)] truncate">
                          {pickLocalized(child.names)}
                        </div>
                        <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                          {st.count} {t.common.filesCount}
                          {st.totalBytes > 0 ? ` · ${(st.totalBytes / 1024).toFixed(0)} KB` : ''}
                        </div>
                      </div>
                    </button>

                    {canWrite && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleReorderChild(idx, -1)}
                          className="min-h-[36px] min-w-[28px] flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === children.length - 1}
                          onClick={() => handleReorderChild(idx, 1)}
                          className="min-h-[36px] min-w-[28px] flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await services.sections.toggleHide(child.id);
                            await loadSectionData();
                          }}
                          className="min-h-[36px] min-w-[28px] flex items-center justify-center text-[var(--color-text-muted)]"
                        >
                          {child.isHidden ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenameTarget(child);
                            setRenameNames({ ...child.names });
                          }}
                          className="min-h-[36px] min-w-[28px] flex items-center justify-center text-[var(--color-text-muted)]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const fallbackTarget = allSections.find((s) => s.id !== child.id);
                            setMoveTargetId(fallbackTarget?.id ?? '');
                            setDeleteTarget(child);
                          }}
                          className="min-h-[36px] min-w-[28px] flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3 pt-2">
            <FileUploadBar
              ctx={ctx}
              sectionId={currentSection.id}
              termNumber={currentSection.termNumber}
              allowExternalUrl={currentSection.featureType === 'audiovisual'}
              disabled={!canWrite}
              onUploaded={loadSectionData}
            />

            <FileList
              files={files}
              allSections={allSections}
              canWrite={canWrite}
              showSolutionSupport={currentSection.featureType === 'assignments_exams'}
              onOpenFile={onOpenFile}
              onChanged={loadSectionData}
            />
          </div>
        </>
      )}

      {/* Rename AR / EN / FR Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveRename}
            className="w-full max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3.5 shadow-2xl"
          >
            <h3 className="text-sm font-extrabold">{t.sections.editNames}</h3>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.sections.nameAr}
              </label>
              <input
                type="text"
                required
                value={renameNames.ar}
                onChange={(e) => setRenameNames((p) => ({ ...p, ar: e.target.value }))}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.sections.nameEn}
              </label>
              <input
                type="text"
                required
                value={renameNames.en}
                onChange={(e) => setRenameNames((p) => ({ ...p, en: e.target.value }))}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.sections.nameFr}
              </label>
              <input
                type="text"
                required
                value={renameNames.fr}
                onChange={(e) => setRenameNames((p) => ({ ...p, fr: e.target.value }))}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
              />
            </div>
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={async () => {
                  await handleRestoreDefault(renameTarget);
                  setRenameTarget(null);
                }}
                className="min-h-[40px] px-3 rounded-xl text-xs font-bold text-[var(--color-primary)] inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.common.restoreDefault}</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="min-h-[40px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
                >
                  {t.common.save}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Safe Delete Section Modal (Move or Delete Files) */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-extrabold text-[var(--color-text)]">
              {t.sections.deleteConfirmTitle}: {pickLocalized(deleteTarget.names)}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t.sections.deleteConfirmBody}
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold">
                <input
                  type="radio"
                  checked={deleteMode === 'move_files'}
                  onChange={() => setDeleteMode('move_files')}
                  className="accent-[var(--color-primary)]"
                />
                <span>{t.sections.moveFilesOption}</span>
              </label>
              {deleteMode === 'move_files' && (
                <select
                  value={moveTargetId}
                  onChange={(e) => setMoveTargetId(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                >
                  {allSections
                    .filter((s) => s.id !== deleteTarget.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {pickLocalized(s.names)}
                      </option>
                    ))}
                </select>
              )}
              <label className="flex items-center gap-2 text-xs font-bold text-red-600">
                <input
                  type="radio"
                  checked={deleteMode === 'delete_files'}
                  onChange={() => setDeleteMode('delete_files')}
                  className="accent-red-600"
                />
                <span>{t.sections.deleteFilesOption}</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="min-h-[42px] px-5 rounded-xl bg-red-600 text-white text-xs font-bold"
              >
                {t.common.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
