import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit2,
  Plus,
  Table as TableIcon,
  Trash2,
  Users,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  ClassRoomRecord,
  FileRecord,
  MiddleSchoolLevel,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { EmptyState } from '@/src/components/common/EmptyState';
import { FileList } from '@/src/components/files/FileList';
import { FileUploadBar } from '@/src/components/files/FileUploadBar';

interface StudentListsViewProps {
  ctx: ServiceContext;
  canWrite: boolean;
  initialLevel?: MiddleSchoolLevel;
  onOpenFile: (file: FileRecord) => void;
  onClassesSynced: () => Promise<void>;
}

const LEVELS: Array<{ code: MiddleSchoolLevel; ar: string; en: string; fr: string }> = [
  { code: '1M', ar: 'الأولى متوسط', en: '1st Year', fr: '1ère AM' },
  { code: '2M', ar: 'الثانية متوسط', en: '2nd Year', fr: '2ème AM' },
  { code: '3M', ar: 'الثالثة متوسط', en: '3rd Year', fr: '3ème AM' },
  { code: '4M', ar: 'الرابعة متوسط', en: '4th Year', fr: '4ème AM' },
];

export const StudentListsView: React.FC<StudentListsViewProps> = ({
  ctx,
  canWrite,
  initialLevel = '1M',
  onOpenFile,
  onClassesSynced,
}) => {
  const { t, lang } = useI18n();
  const [activeLevel, setActiveLevel] = useState<MiddleSchoolLevel>(initialLevel);
  const [classes, setClasses] = useState<ClassRoomRecord[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassRoomRecord | null>(null);
  const [activeTerm, setActiveTerm] = useState<1 | 2 | 3>(1);
  const [termFiles, setTermFiles] = useState<FileRecord[]>([]);
  const [classStats, setClassStats] = useState<
    Record<string, { count: number; lastUpdated: string | null }>
  >({});
  const [termStats, setTermStats] = useState<
    Record<1 | 2 | 3, { count: number; lastUpdated: string | null }>
  >({
    1: { count: 0, lastUpdated: null },
    2: { count: 0, lastUpdated: null },
    3: { count: 0, lastUpdated: null },
  });

  const [newClassName, setNewClassName] = useState('');
  const [renameTarget, setRenameTarget] = useState<ClassRoomRecord | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClassRoomRecord | null>(null);
  const [copyToast, setCopyToast] = useState('');

  const loadLevelClasses = async (lvl: MiddleSchoolLevel) => {
    const list = await services.classes.listByYear(ctx.academicYearId, lvl);
    setClasses(list);

    const stats: Record<string, { count: number; lastUpdated: string | null }> = {};
    for (const c of list) {
      const s = await services.files.getFolderStats(
        ctx.academicYearId,
        Object.values(c.termSectionIds)
      );
      stats[c.id] = { count: s.count, lastUpdated: s.lastUpdated };
    }
    setClassStats(stats);

    if (selectedClass && !list.some((c) => c.id === selectedClass.id)) {
      setSelectedClass(list[0] ?? null);
    } else if (!selectedClass && list.length > 0) {
      setSelectedClass(list[0]);
    }
  };

  const loadSelectedClassTerms = async (cls: ClassRoomRecord | null, term: 1 | 2 | 3) => {
    if (!cls) {
      setTermFiles([]);
      return;
    }
    const [s1, s2, s3, files] = await Promise.all([
      services.files.getFolderStats(ctx.academicYearId, [cls.termSectionIds[1]]),
      services.files.getFolderStats(ctx.academicYearId, [cls.termSectionIds[2]]),
      services.files.getFolderStats(ctx.academicYearId, [cls.termSectionIds[3]]),
      services.files.listBySection(ctx.academicYearId, cls.termSectionIds[term]),
    ]);
    setTermStats({
      1: { count: s1.count, lastUpdated: s1.lastUpdated },
      2: { count: s2.count, lastUpdated: s2.lastUpdated },
      3: { count: s3.count, lastUpdated: s3.lastUpdated },
    });
    setTermFiles(files);
  };

  useEffect(() => {
    setSelectedClass(null);
    loadLevelClasses(activeLevel);
  }, [activeLevel, ctx.academicYearId]);

  useEffect(() => {
    loadSelectedClassTerms(selectedClass, activeTerm);
  }, [selectedClass, activeTerm, ctx.academicYearId]);

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const created = await services.classes.addClass(ctx, activeLevel, newClassName);
    setNewClassName('');
    await loadLevelClasses(activeLevel);
    setSelectedClass(created);
    await onClassesSynced();
  };

  const handleMoveClass = async (index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= classes.length) return;
    const next = [...classes];
    const [item] = next.splice(index, 1);
    next.splice(targetIdx, 0, item);
    await services.classes.reorderClasses(next.map((c) => c.id));
    await loadLevelClasses(activeLevel);
    await onClassesSynced();
  };

  const handleCopyToNextTerm = async () => {
    if (!selectedClass || activeTerm === 3) return;
    const nextTerm = (activeTerm + 1) as 2 | 3;
    const copied = await services.classes.copyTermFiles(ctx, selectedClass, activeTerm, nextTerm);
    setCopyToast(`${t.sections.copiedCount} (${copied})`);
    window.setTimeout(() => setCopyToast(''), 2500);
    setActiveTerm(nextTerm);
    await loadLevelClasses(activeLevel);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        {LEVELS.map((lvl) => (
          <button
            key={lvl.code}
            type="button"
            onClick={() => setActiveLevel(lvl.code)}
            className={`min-h-[42px] rounded-xl text-xs font-bold transition-colors ${
              activeLevel === lvl.code
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {lvl[lang]}
          </button>
        ))}
      </div>

      {canWrite && (
        <form onSubmit={handleAddClass} className="flex gap-2">
          <input
            type="text"
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
            placeholder={t.sections.classPlaceholder}
            className="flex-1 min-h-[44px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)]"
          />
          <button
            type="submit"
            className="min-h-[44px] px-4 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{t.common.add}</span>
          </button>
        </form>
      )}

      {classes.length === 0 ? (
        <EmptyState title={t.sections.addClass} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {classes.map((cls, idx) => {
            const st = classStats[cls.id] || { count: 0, lastUpdated: null };
            const isSelected = selectedClass?.id === cls.id;
            return (
              <div
                key={cls.id}
                className={`rounded-2xl border-2 p-3 transition-colors bg-[var(--color-surface)] ${
                  isSelected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/25'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedClass(cls)}
                    className="flex items-center gap-2.5 text-start flex-1 min-w-0"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-[var(--color-text)] truncate">
                        {cls.name}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                        {st.count} {t.common.filesCount}
                        {st.lastUpdated ? ` · ${st.lastUpdated.slice(0, 10)}` : ''}
                      </div>
                    </div>
                  </button>

                  {canWrite && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveClass(idx, -1)}
                        className="min-h-[34px] min-w-[30px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === classes.length - 1}
                        onClick={() => handleMoveClass(idx, 1)}
                        className="min-h-[34px] min-w-[30px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenameTarget(cls);
                          setRenameVal(cls.name);
                        }}
                        className="min-h-[34px] min-w-[30px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(cls)}
                        className="min-h-[34px] min-w-[30px] rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedClass && (
        <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TableIcon className="w-5 h-5 text-[var(--color-primary)]" />
              <h3 className="text-sm font-extrabold">{selectedClass.name}</h3>
            </div>
            {canWrite && activeTerm < 3 && termFiles.length > 0 && (
              <button
                type="button"
                onClick={handleCopyToNextTerm}
                className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{t.sections.copyToNextTerm}</span>
              </button>
            )}
          </div>

          {copyToast && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-xs font-bold">
              {copyToast}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[var(--color-background)]">
            {([1, 2, 3] as const).map((term) => {
              const label =
                term === 1 ? t.sections.term1 : term === 2 ? t.sections.term2 : t.sections.term3;
              return (
                <button
                  key={term}
                  type="button"
                  onClick={() => setActiveTerm(term)}
                  className={`min-h-[44px] px-2 rounded-xl text-xs font-bold transition-colors ${
                    activeTerm === term
                      ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  <div>{label}</div>
                  <div className="text-[10px] opacity-75 tabular-nums">
                    {termStats[term].count} {t.common.filesCount}
                  </div>
                </button>
              );
            })}
          </div>

          <FileUploadBar
            ctx={ctx}
            sectionId={selectedClass.termSectionIds[activeTerm]}
            accept=".xlsx,.xls,.csv"
            termNumber={activeTerm}
            disabled={!canWrite}
            onUploaded={() => {
              loadLevelClasses(activeLevel);
              loadSelectedClassTerms(selectedClass, activeTerm);
            }}
          />

          <FileList
            files={termFiles}
            canWrite={canWrite}
            onOpenFile={onOpenFile}
            onChanged={() => {
              loadLevelClasses(activeLevel);
              loadSelectedClassTerms(selectedClass, activeTerm);
            }}
          />
        </div>
      )}

      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renameVal.trim()) return;
              await services.classes.renameClass(renameTarget.id, renameVal);
              setRenameTarget(null);
              await loadLevelClasses(activeLevel);
              await onClassesSynced();
            }}
            className="w-full max-w-sm rounded-3xl bg-[var(--color-surface)] p-5 border border-[var(--color-border)] space-y-4"
          >
            <h3 className="text-sm font-bold">{t.common.rename}</h3>
            <input
              type="text"
              required
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            />
            <div className="flex justify-end gap-2">
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
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t.common.delete}
        message={`${t.common.delete}: ${deleteTarget?.name ?? ''}?`}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await services.classes.deleteClass(deleteTarget.id, ctx.academicYearId);
          setDeleteTarget(null);
          setSelectedClass(null);
          await loadLevelClasses(activeLevel);
          await onClassesSynced();
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
