import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit2,
  FileSpreadsheet,
  LayoutGrid,
  Plus,
  Table2,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  ClassRoomRecord,
  FileRecord,
  GradeSubjectKey,
  MiddleSchoolLevel,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { ConfirmDialog } from '@/src/components/common/ConfirmDialog';
import { EmptyState } from '@/src/components/common/EmptyState';
import { FileList } from '@/src/components/files/FileList';
import { ExcelImportWizardModal } from '@/src/components/grades/ExcelImportWizardModal';
import { GradesTableWorkspace } from '@/src/components/grades/GradesTableWorkspace';
import { SeatingChartWorkspace } from '@/src/components/seating/SeatingChartWorkspace';

interface StudentListsViewProps {
  ctx: ServiceContext;
  user: UserRecord;
  schoolName: string;
  isArchiveYear: boolean;
  canWrite: boolean;
  subjects?: SubjectRecord[];
  initialLevel?: MiddleSchoolLevel;
  initialClassId?: string;
  onOpenFile: (file: FileRecord) => void;
  onClassesSynced: () => Promise<void>;
  onSubjectsChanged?: () => Promise<void>;
  onOpenInNotebook: (
    level: MiddleSchoolLevel,
    classId: string,
    term: 1 | 2 | 3 | 'year',
    subject: GradeSubjectKey
  ) => void;
}

const LEVELS: Array<{ code: MiddleSchoolLevel; ar: string; en: string; fr: string }> = [
  { code: '1M', ar: 'الأولى متوسط', en: '1st Year', fr: '1ère AM' },
  { code: '2M', ar: 'الثانية متوسط', en: '2nd Year', fr: '2ème AM' },
  { code: '3M', ar: 'الثالثة متوسط', en: '3rd Year', fr: '3ème AM' },
  { code: '4M', ar: 'الرابعة متوسط', en: '4th Year', fr: '4ème AM' },
];

export const StudentListsView: React.FC<StudentListsViewProps> = ({
  ctx,
  user,
  schoolName,
  isArchiveYear,
  canWrite,
  subjects: propSubjects,
  initialLevel = '1M',
  initialClassId,
  onOpenFile,
  onClassesSynced,
  onSubjectsChanged,
  onOpenInNotebook,
}) => {
  const { t, lang } = useI18n();
  const [activeLevel, setActiveLevel] = useState<MiddleSchoolLevel>(initialLevel);
  const [allYearClasses, setAllYearClasses] = useState<ClassRoomRecord[]>([]);
  const [classes, setClasses] = useState<ClassRoomRecord[]>([]);
  const [localSubjects, setLocalSubjects] = useState<SubjectRecord[]>(propSubjects ?? []);
  const [selectedClass, setSelectedClass] = useState<ClassRoomRecord | null>(null);
  const [termTab, setTermTab] = useState<1 | 2 | 3 | 'year'>(1);
  const [subjectKey, setSubjectKey] = useState<GradeSubjectKey>('');
  const [classViewTab, setClassViewTab] = useState<'grades' | 'seating'>('grades');

  const activeSubjects = propSubjects ?? localSubjects;

  const [termFiles, setTermFiles] = useState<FileRecord[]>([]);
  const [classStats, setClassStats] = useState<
    Record<string, { fileCount: number; studentCount: number; lastUpdated: string | null }>
  >({});

  const [newClassName, setNewClassName] = useState('');
  const [renameTarget, setRenameTarget] = useState<ClassRoomRecord | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ClassRoomRecord | null>(null);
  const [copyToast, setCopyToast] = useState('');
  const [wizardFile, setWizardFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);

  const activeTermNum: 1 | 2 | 3 = termTab === 'year' ? 1 : termTab;

  const loadLevelClasses = async (lvl: MiddleSchoolLevel, preferClassId?: string) => {
    const [allCls, list, subList] = await Promise.all([
      services.classes.listByYear(ctx.academicYearId),
      services.classes.listByYear(ctx.academicYearId, lvl),
      services.subjects.listForTeacher(ctx.academicYearId, ctx.ownerId, false),
    ]);
    setAllYearClasses(allCls);
    setClasses(list);
    setLocalSubjects(subList);
    if (!subList.some((s) => s.id === subjectKey)) {
      setSubjectKey(subList[0]?.id || '');
    }

    const stats: Record<
      string,
      { fileCount: number; studentCount: number; lastUpdated: string | null }
    > = {};
    for (const c of list) {
      const [s, sts] = await Promise.all([
        services.files.getFolderStats(ctx.academicYearId, Object.values(c.termSectionIds)),
        services.students.listByClass(ctx.academicYearId, c.id),
      ]);
      stats[c.id] = {
        fileCount: s.count,
        studentCount: sts.length,
        lastUpdated: s.lastUpdated,
      };
    }
    setClassStats(stats);

    if (preferClassId) {
      const found = list.find((c) => c.id === preferClassId);
      if (found) {
        setSelectedClass(found);
        return;
      }
    }
    if (selectedClass && list.some((c) => c.id === selectedClass.id)) {
      setSelectedClass(list.find((c) => c.id === selectedClass.id) ?? null);
    } else {
      setSelectedClass(list[0] ?? null);
    }
  };

  const loadSelectedTermFiles = async (cls: ClassRoomRecord | null, term: 1 | 2 | 3) => {
    if (!cls) {
      setTermFiles([]);
      return;
    }
    const files = await services.files.listBySection(ctx.academicYearId, cls.termSectionIds[term]);
    setTermFiles(files);
  };

  useEffect(() => {
    loadLevelClasses(activeLevel, initialClassId);
  }, [activeLevel, ctx.academicYearId, ctx.ownerId, initialClassId]);

  useEffect(() => {
    if (propSubjects) {
      setLocalSubjects(propSubjects);
      if (!propSubjects.some((s) => s.id === subjectKey)) {
        setSubjectKey(propSubjects[0]?.id || '');
      }
    }
  }, [propSubjects]);

  useEffect(() => {
    loadSelectedTermFiles(selectedClass, activeTermNum);
  }, [selectedClass, activeTermNum, ctx.academicYearId]);

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const created = await services.classes.addClass(ctx, activeLevel, newClassName);
    setNewClassName('');
    await loadLevelClasses(activeLevel, created.id);
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
    if (!selectedClass || activeTermNum === 3) return;
    const nextTerm = (activeTermNum + 1) as 2 | 3;
    const copied = await services.classes.copyTermFiles(ctx, selectedClass, activeTermNum, nextTerm);
    setCopyToast(`${t.sections.copiedCount} (${copied})`);
    window.setTimeout(() => setCopyToast(''), 2500);
    setTermTab(nextTerm);
    await loadLevelClasses(activeLevel);
  };

  const handleExcelUploadWithWizard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClass) return;
    await services.files.uploadFiles(ctx, selectedClass.termSectionIds[activeTermNum], [file], {
      termNumber: activeTermNum,
      compressImages: false,
    });
    e.target.value = '';
    await loadLevelClasses(activeLevel);
    await loadSelectedTermFiles(selectedClass, activeTermNum);
    setWizardFile({ blob: file, name: file.name });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        {LEVELS.map((lvl) => (
          <button
            key={lvl.code}
            type="button"
            onClick={() => {
              setSelectedClass(null);
              setActiveLevel(lvl.code);
            }}
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
            const st = classStats[cls.id] || {
              fileCount: 0,
              studentCount: 0,
              lastUpdated: null,
            };
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
                        {st.studentCount} {t.grades.studentsCount} · {st.fileCount} {t.common.filesCount}
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
        <div className="space-y-4">
          {services.seating.canAccessSeating(user, selectedClass) && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setClassViewTab('grades')}
                className={`min-h-[44px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  classViewTab === 'grades'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <Table2 className="w-4 h-4" />
                <span>{t.seating.gradesAndListTab}</span>
              </button>
              <button
                type="button"
                onClick={() => setClassViewTab('seating')}
                className={`min-h-[44px] rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
                  classViewTab === 'seating'
                    ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>{t.seating.seatingChartTab}</span>
              </button>
            </div>
          )}

          {classViewTab === 'seating' && services.seating.canAccessSeating(user, selectedClass) ? (
            <SeatingChartWorkspace
              key={`seating-${selectedClass.id}-${workspaceRefreshKey}`}
              ctx={ctx}
              user={user}
              schoolName={schoolName}
              classRoom={selectedClass}
              subjects={activeSubjects}
              termNumber={activeTermNum}
              subjectKey={subjectKey || activeSubjects[0]?.id || ''}
              isArchiveYear={isArchiveYear}
              onChangeTerm={(tm) => setTermTab(tm)}
              onChangeSubject={setSubjectKey}
              onChanged={() => loadLevelClasses(activeLevel)}
            />
          ) : (
            /* Shared Single-Source-of-Truth Grades Table */
            <GradesTableWorkspace
              key={`${selectedClass.id}-${workspaceRefreshKey}`}
              ctx={ctx}
              user={user}
              schoolName={schoolName}
              classRoom={selectedClass}
              allClasses={allYearClasses}
              subjects={activeSubjects}
              isArchiveYear={isArchiveYear}
              termTab={termTab}
              onChangeTermTab={setTermTab}
              subjectKey={subjectKey}
              onChangeSubject={setSubjectKey}
              crossLinkButton={{
                label: t.grades.openInNotebook,
                onClick: () =>
                  onOpenInNotebook(
                    selectedClass.levelCode,
                    selectedClass.id,
                    termTab,
                    subjectKey || activeSubjects[0]?.id || ''
                  ),
              }}
              onDataChanged={() => loadLevelClasses(activeLevel)}
              onSubjectsChanged={async () => {
                await loadLevelClasses(activeLevel);
                if (onSubjectsChanged) await onSubjectsChanged();
              }}
            />
          )}

          {/* Original Uploaded Excel Files (Attached for Reference + Wizard Re-Run) */}
          <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[var(--color-primary)]" />
                <h4 className="text-xs font-extrabold">{t.grades.attachedReferenceFiles}</h4>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {canWrite && activeTermNum < 3 && termFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyToNextTerm}
                    className="min-h-[38px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t.sections.copyToNextTerm}</span>
                  </button>
                )}

                {canWrite && (
                  <label className="min-h-[40px] px-3.5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                    <UploadCloud className="w-4 h-4" />
                    <span>Excel / CSV + Wizard</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleExcelUploadWithWizard}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {copyToast && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-xs font-bold">
                {copyToast}
              </div>
            )}

            <FileList
              files={termFiles}
              canWrite={canWrite}
              onOpenFile={onOpenFile}
              onChanged={() => {
                loadLevelClasses(activeLevel);
                loadSelectedTermFiles(selectedClass, activeTermNum);
              }}
            />

            {canWrite && termFiles.some((f) => f.blob) && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {termFiles
                  .filter((f) => f.blob)
                  .map((f) => (
                    <button
                      key={`wiz-${f.id}`}
                      type="button"
                      onClick={() => f.blob && setWizardFile({ blob: f.blob, name: f.name })}
                      className="min-h-[34px] px-3 rounded-xl border border-[var(--color-border)] text-[11px] font-bold text-[var(--color-primary)]"
                    >
                      {t.grades.importWizardTitle}: {f.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
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

      {wizardFile && selectedClass && (
        <ExcelImportWizardModal
          open={Boolean(wizardFile)}
          blob={wizardFile.blob}
          fileName={wizardFile.name}
          ctx={ctx}
          user={user}
          classRoom={selectedClass}
          termNumber={activeTermNum}
          subjectKey={subjectKey || activeSubjects[0]?.id || ''}
          maxGrade={20}
          initialMode="create_or_update"
          onClose={() => setWizardFile(null)}
          onImported={async () => {
            setWorkspaceRefreshKey((k) => k + 1);
            await loadLevelClasses(activeLevel);
          }}
        />
      )}
    </div>
  );
};
