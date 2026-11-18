import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Edit3,
  GripVertical,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import {
  buildPresetLocalizedNames,
  PRESET_SUBJECT_SPECS,
  SUBJECT_COLOR_PALETTE,
  type PresetSubjectKey,
  type SubjectDependencies,
} from '@/src/services/SubjectsService';
import type { LocalizedText, SubjectRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { AVAILABLE_CARD_ICONS, DynamicIcon } from '@/src/components/common/DynamicIcon';
import { SubjectDeleteModal } from './SubjectDeleteModal';

interface SubjectManagerPanelProps {
  ctx: ServiceContext;
  initialEditSubjectId?: string | null;
  onChanged: () => Promise<void>;
}

export const SubjectManagerPanel: React.FC<SubjectManagerPanelProps> = ({
  ctx,
  initialEditSubjectId,
  onChanged,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [allSubjects, setAllSubjects] = useState<SubjectRecord[]>([]);
  const [trashedSubjects, setTrashedSubjects] = useState<SubjectRecord[]>([]);
  const [reviewDeps, setReviewDeps] = useState<Record<string, SubjectDependencies>>({});

  // Quick Add state
  const [customName, setCustomName] = useState('');
  const [busy, setBusy] = useState(false);

  // Edit modal state
  const [editingSubject, setEditingSubject] = useState<SubjectRecord | null>(null);
  const [editNames, setEditNames] = useState<LocalizedText>({ ar: '', en: '', fr: '' });
  const [editColor, setEditColor] = useState('#1e40af');
  const [editIcon, setEditIcon] = useState('BookOpen');

  // Safe Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<SubjectRecord | null>(null);
  const [deleteInitialMode, setDeleteInitialMode] = useState<'archive' | 'move' | 'delete'>('archive');

  // Drag reorder state
  const [dragId, setDragId] = useState<string | null>(null);

  const loadSubjects = async () => {
    const [list, trash] = await Promise.all([
      services.subjects.listForTeacher(ctx.academicYearId, ctx.ownerId, true),
      services.subjects.listTrashed(ctx.academicYearId, ctx.ownerId),
    ]);
    setAllSubjects(list);
    setTrashedSubjects(trash);

    const flagged = list.filter((s) => s.archivedNeedsDeleteReview);
    const depsMap: Record<string, SubjectDependencies> = {};
    for (const s of flagged) {
      depsMap[s.id] = await services.subjects.getDependencies(ctx.academicYearId, s.id);
    }
    setReviewDeps(depsMap);

    if (initialEditSubjectId) {
      const found = list.find((s) => s.id === initialEditSubjectId);
      if (found) openEditor(found);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, [ctx.academicYearId, ctx.ownerId, initialEditSubjectId]);

  const activeSubjects = allSubjects.filter((s) => s.isActive);
  const archivedSubjects = allSubjects.filter((s) => !s.isActive);
  const flaggedSubjects = archivedSubjects.filter((s) => s.archivedNeedsDeleteReview);

  const openEditor = (sub: SubjectRecord) => {
    setEditingSubject(sub);
    setEditNames({ ...sub.names });
    setEditColor(sub.color);
    setEditIcon(sub.icon);
  };

  const handleAddPreset = async (key: PresetSubjectKey) => {
    const spec = PRESET_SUBJECT_SPECS.find((p) => p.key === key);
    if (!spec || busy) return;
    setBusy(true);
    try {
      await services.subjects.addSubject(ctx, {
        names: buildPresetLocalizedNames(key),
        color: spec.color,
        icon: spec.icon,
      });
      await loadSubjects();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleAddCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customName.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const color = SUBJECT_COLOR_PALETTE[activeSubjects.length % SUBJECT_COLOR_PALETTE.length];
      await services.subjects.addSubject(ctx, {
        names: { ar: clean, en: clean, fr: clean },
        color,
        icon: 'BookOpen',
      });
      setCustomName('');
      await loadSubjects();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleMoveOrder = async (idx: number, delta: -1 | 1) => {
    const targetIdx = idx + delta;
    if (targetIdx < 0 || targetIdx >= activeSubjects.length) return;
    const next = [...activeSubjects];
    const [moved] = next.splice(idx, 1);
    next.splice(targetIdx, 0, moved);
    const orderedIds = [...next.map((s) => s.id), ...archivedSubjects.map((s) => s.id)];
    await services.subjects.reorderSubjects(ctx, orderedIds);
    await loadSubjects();
    await onChanged();
  };

  const handleDropReorder = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const next = [...activeSubjects];
    const fromIdx = next.findIndex((s) => s.id === dragId);
    const toIdx = next.findIndex((s) => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDragId(null);
      return;
    }
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDragId(null);
    await services.subjects.reorderSubjects(ctx, [
      ...next.map((s) => s.id),
      ...archivedSubjects.map((s) => s.id),
    ]);
    await loadSubjects();
    await onChanged();
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    await services.subjects.updateSubject(ctx, editingSubject.id, {
      names: editNames,
      color: editColor,
      icon: editIcon,
    });
    setEditingSubject(null);
    await loadSubjects();
    await onChanged();
  };

  const usedNamesNormalized = new Set(
    allSubjects.flatMap((s) => [s.names.ar, s.names.en, s.names.fr]).map((n) => n.trim().toLowerCase())
  );
  const availablePresets = PRESET_SUBJECT_SPECS.filter((spec) => {
    const pNames = buildPresetLocalizedNames(spec.key);
    return (
      !usedNamesNormalized.has(pNames.ar.toLowerCase()) &&
      !usedNamesNormalized.has(pNames.en.toLowerCase()) &&
      !usedNamesNormalized.has(pNames.fr.toLowerCase())
    );
  });

  return (
    <div className="space-y-4">
      {/* Review Banner for Archived Subjects Pending Permanent Delete (e.g. Physical Education) */}
      {flaggedSubjects.map((sub) => {
        const deps = reviewDeps[sub.id];
        return (
          <div
            key={`rev-${sub.id}`}
            className="rounded-2xl border-2 border-amber-400/70 bg-amber-50 dark:bg-amber-950/35 p-3.5 space-y-2.5"
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
                    <span>{deps.filesCount} {t.subjects.depFiles}</span>
                    <span>·</span>
                    <span>{deps.gradesCount} {t.subjects.depGrades}</span>
                    <span>·</span>
                    <span>{deps.classesCount} {t.subjects.depClasses}</span>
                    <span>·</span>
                    <span>{deps.examsCount} {t.subjects.depExams}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteInitialMode('delete');
                  setDeleteTarget(sub);
                }}
                className="min-h-[38px] px-3.5 rounded-xl bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.subjects.reviewBannerAction}</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await services.subjects.dismissDeleteReview(sub.id);
                  await loadSubjects();
                  await onChanged();
                }}
                className="min-h-[38px] px-3 rounded-xl border border-amber-400/80 text-xs font-bold text-amber-900 dark:text-amber-200"
              >
                {t.subjects.dismissReview}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await services.subjects.unarchiveSubject(ctx, sub.id);
                  await loadSubjects();
                  await onChanged();
                }}
                className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-[var(--color-primary)]"
              >
                {t.subjects.restoreSubject}
              </button>
            </div>
          </div>
        );
      })}

      {/* Add Custom Subject */}
      <form onSubmit={handleAddCustom} className="flex gap-2">
        <input
          type="text"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder={t.subjects.customSubjectName}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          className="flex-1 min-h-[44px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-xs font-semibold"
        />
        <button
          type="submit"
          disabled={!customName.trim() || busy}
          className="min-h-[44px] px-4 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-40 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.subjects.addSubject}</span>
        </button>
      </form>

      {/* Suggestion Chips */}
      {availablePresets.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
            {t.subjects.suggestionsTitle}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availablePresets.map((spec) => (
              <button
                key={spec.key}
                type="button"
                disabled={busy}
                onClick={() => handleAddPreset(spec.key)}
                className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-xs font-bold inline-flex items-center gap-1.5 hover:border-[var(--color-primary)] transition-colors"
              >
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${spec.color}22`, color: spec.color }}
                >
                  <DynamicIcon name={spec.icon} className="w-3.5 h-3.5" />
                </span>
                <span>+ {t.subjects.presets[spec.key]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Teacher Subjects (Reorderable) */}
      {activeSubjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-4 text-center text-xs font-semibold text-[var(--color-text-muted)]">
          {t.subjects.emptyNotice}
        </div>
      ) : (
        <div className="space-y-2">
          {activeSubjects.map((sub, idx) => (
            <div
              key={sub.id}
              draggable
              onDragStart={() => setDragId(sub.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDropReorder(sub.id)}
              onDragEnd={() => setDragId(null)}
              className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 flex items-center justify-between gap-2 ${
                dragId === sub.id ? 'opacity-60 ring-2 ring-[var(--color-primary)]' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <GripVertical className="w-4 h-4 text-[var(--color-text-muted)] shrink-0 cursor-grab" />
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${sub.color}24`, color: sub.color }}
                >
                  <DynamicIcon name={sub.icon} className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[var(--color-text)] truncate">
                    {pickLocalized(sub.names)}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] truncate">
                    {sub.names.ar} · {sub.names.en} · {sub.names.fr}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMoveOrder(idx, -1)}
                  className="min-h-[36px] min-w-[30px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-25"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === activeSubjects.length - 1}
                  onClick={() => handleMoveOrder(idx, 1)}
                  className="min-h-[36px] min-w-[30px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-25"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openEditor(sub)}
                  title={t.subjects.editSubject}
                  className="min-h-[36px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-primary)]"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await services.subjects.archiveSubject(ctx, sub.id);
                    await loadSubjects();
                    await onChanged();
                  }}
                  title={t.subjects.hideSubject}
                  className="min-h-[36px] min-w-[32px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteInitialMode('archive');
                    setDeleteTarget(sub);
                  }}
                  title={t.common.delete}
                  className="min-h-[36px] min-w-[32px] rounded-lg flex items-center justify-center text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archived Subjects */}
      {archivedSubjects.length > 0 && (
        <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
          <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
            {t.subjects.archivedTitle} ({archivedSubjects.length})
          </div>
          {archivedSubjects.map((sub) => (
            <div
              key={sub.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/60 px-3 py-2 flex items-center justify-between gap-2 opacity-80"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${sub.color}20`, color: sub.color }}
                >
                  <DynamicIcon name={sub.icon} className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold truncate">{pickLocalized(sub.names)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    await services.subjects.unarchiveSubject(ctx, sub.id);
                    await loadSubjects();
                    await onChanged();
                  }}
                  className="min-h-[36px] px-2.5 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <ArchiveRestore className="w-3.5 h-3.5" />
                  <span>{t.subjects.unhideSubject}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteInitialMode('delete');
                    setDeleteTarget(sub);
                  }}
                  className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 30-Day Trash */}
      {trashedSubjects.length > 0 && (
        <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
          <div className="text-[11px] font-bold text-[var(--color-text-muted)]">
            {t.subjects.trashTitle} ({trashedSubjects.length})
          </div>
          {trashedSubjects.map((sub) => {
            const elapsedDays = Math.floor(
              (Date.now() - Date.parse(sub.deletedAt || new Date().toISOString())) / 86400000
            );
            const remainingDays = Math.max(1, 30 - elapsedDays);
            return (
              <div
                key={sub.id}
                className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{pickLocalized(sub.names)}</div>
                  <div className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                    {remainingDays}d
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await services.subjects.restoreFromTrash(ctx, sub.id);
                      await loadSubjects();
                      await onChanged();
                    }}
                    className="min-h-[36px] px-2.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t.subjects.restoreSubject}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await services.subjects.purgeSubjectForever(ctx.academicYearId, sub.id);
                      await loadSubjects();
                      await onChanged();
                    }}
                    title={t.subjects.purgeForever}
                    className="min-h-[36px] px-2.5 rounded-xl bg-red-600 text-white text-[11px] font-bold"
                  >
                    {t.subjects.purgeForever}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Subject Names (AR / EN / FR) + Color + Icon Modal */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
          >
            <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-sm font-extrabold">{t.subjects.editSubject}</h3>
              <button
                type="button"
                onClick={() => setEditingSubject(null)}
                className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="flex-1 overflow-auto p-5 space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                  {t.sections.nameAr}
                </label>
                <input
                  type="text"
                  required
                  dir="rtl"
                  value={editNames.ar}
                  onChange={(e) => setEditNames((p) => ({ ...p, ar: e.target.value }))}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                  {t.sections.nameEn}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editNames.en}
                  onChange={(e) => setEditNames((p) => ({ ...p, en: e.target.value }))}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                  {t.sections.nameFr}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editNames.fr}
                  onChange={(e) => setEditNames((p) => ({ ...p, fr: e.target.value }))}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1.5">
                  {t.subjects.colorLabel}
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {SUBJECT_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-7 h-7 rounded-full border-2 ${
                        editColor === c ? 'border-[var(--color-text)] scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="w-9 h-7 rounded-lg border border-[var(--color-border)] bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1.5">
                  {t.subjects.iconLabel}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_CARD_ICONS.map((iconName) => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setEditIcon(iconName)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                        editIcon === iconName
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] bg-[var(--color-background)]'
                      }`}
                    >
                      <DynamicIcon name={iconName} className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <footer className="px-5 py-3.5 border-t border-[var(--color-border)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSubject(null)}
                className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.save}
              </button>
            </footer>
          </form>
        </div>
      )}

      <SubjectDeleteModal
        open={Boolean(deleteTarget)}
        ctx={ctx}
        subject={deleteTarget}
        otherActiveSubjects={activeSubjects.filter((s) => s.id !== deleteTarget?.id)}
        initialMode={deleteInitialMode}
        onClose={() => setDeleteTarget(null)}
        onResolved={async () => {
          await loadSubjects();
          await onChanged();
        }}
      />
    </div>
  );
};

interface SubjectManagerModalProps {
  open: boolean;
  ctx: ServiceContext;
  initialEditSubjectId?: string | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

export const SubjectManagerModal: React.FC<SubjectManagerModalProps> = ({
  open,
  ctx,
  initialEditSubjectId,
  onClose,
  onChanged,
}) => {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
            <h3 className="text-sm font-extrabold text-[var(--color-text)]">
              {t.subjects.manageSubjects}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-5">
          <SubjectManagerPanel
            ctx={ctx}
            initialEditSubjectId={initialEditSubjectId}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
};
