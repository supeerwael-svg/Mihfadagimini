import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpenCheck, Users } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type {
  ClassRoomRecord,
  GradeRecord,
  GradeSubjectKey,
  GradingConfigRecord,
  MiddleSchoolLevel,
  StudentRecord,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';
import { EmptyState } from '@/src/components/common/EmptyState';
import { GradesTableWorkspace } from './GradesTableWorkspace';

interface GradingNotebookViewProps {
  ctx: ServiceContext;
  user: UserRecord;
  schoolName: string;
  isArchiveYear: boolean;
  subjects?: SubjectRecord[];
  initialLevel?: MiddleSchoolLevel;
  initialClassId?: string;
  initialTerm?: 1 | 2 | 3 | 'year';
  initialSubject?: GradeSubjectKey;
  onOpenClassList: (level: MiddleSchoolLevel, classId: string) => void;
  onSubjectsChanged?: () => Promise<void>;
}

const LEVELS: Array<{ code: MiddleSchoolLevel; ar: string; en: string; fr: string }> = [
  { code: '1M', ar: 'الأولى متوسط', en: '1st Year', fr: '1ère AM' },
  { code: '2M', ar: 'الثانية متوسط', en: '2nd Year', fr: '2ème AM' },
  { code: '3M', ar: 'الثالثة متوسط', en: '3rd Year', fr: '3ème AM' },
  { code: '4M', ar: 'الرابعة متوسط', en: '4th Year', fr: '4ème AM' },
];

export const GradingNotebookView: React.FC<GradingNotebookViewProps> = ({
  ctx,
  user,
  schoolName,
  isArchiveYear,
  subjects: propSubjects,
  initialLevel = '1M',
  initialClassId,
  initialTerm = 1,
  initialSubject = '',
  onOpenClassList,
  onSubjectsChanged,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [subTab, setSubTab] = useState<'table' | 'summary'>('table');
  const [activeLevel, setActiveLevel] = useState<MiddleSchoolLevel>(initialLevel);
  const [allClasses, setAllClasses] = useState<ClassRoomRecord[]>([]);
  const [localSubjects, setLocalSubjects] = useState<SubjectRecord[]>(propSubjects ?? []);
  const [selectedClassId, setSelectedClassId] = useState<string>(initialClassId || '');
  const [termTab, setTermTab] = useState<1 | 2 | 3 | 'year'>(initialTerm);
  const [subjectKey, setSubjectKey] = useState<GradeSubjectKey>(initialSubject);

  // Summary state
  const [allStudents, setAllStudents] = useState<StudentRecord[]>([]);
  const [allGrades, setAllGrades] = useState<GradeRecord[]>([]);
  const [gradingConfig, setGradingConfig] = useState<GradingConfigRecord | null>(null);

  const activeSubjects = propSubjects ?? localSubjects;

  const loadAll = async () => {
    const [clsList, stList, grList, cfg, subList] = await Promise.all([
      services.classes.listByYear(ctx.academicYearId),
      services.adapter.queryByYear('students', ctx.academicYearId),
      services.grades.getAllGradesForYear(ctx.academicYearId),
      services.grades.getGradingConfig(ctx),
      services.subjects.listForTeacher(ctx.academicYearId, ctx.ownerId, false),
    ]);
    setAllClasses(clsList);
    setAllStudents(stList);
    setAllGrades(grList);
    setGradingConfig(cfg);
    setLocalSubjects(subList);

    if (!subList.some((s) => s.id === subjectKey)) {
      setSubjectKey(subList[0]?.id || '');
    }

    if (initialClassId && clsList.some((c) => c.id === initialClassId)) {
      const target = clsList.find((c) => c.id === initialClassId)!;
      setActiveLevel(target.levelCode);
      setSelectedClassId(target.id);
    } else {
      const inLevel = clsList.filter((c) => c.levelCode === activeLevel);
      if (!inLevel.some((c) => c.id === selectedClassId)) {
        setSelectedClassId(inLevel[0]?.id || clsList[0]?.id || '');
      }
    }
  };

  useEffect(() => {
    loadAll();
  }, [ctx.academicYearId, ctx.ownerId]);

  useEffect(() => {
    if (propSubjects) {
      setLocalSubjects(propSubjects);
      if (!propSubjects.some((s) => s.id === subjectKey)) {
        setSubjectKey(propSubjects[0]?.id || '');
      }
    }
  }, [propSubjects]);

  const levelClasses = useMemo(
    () => allClasses.filter((c) => c.levelCode === activeLevel),
    [allClasses, activeLevel]
  );

  const selectedClass = useMemo(
    () => allClasses.find((c) => c.id === selectedClassId) || levelClasses[0] || null,
    [allClasses, levelClasses, selectedClassId]
  );

  // Cross-class summary calculations
  const summaryRows = useMemo(() => {
    const activeTermForBelow10: 1 | 2 | 3 = termTab === 'year' ? 1 : termTab;
    return allClasses
      .filter((cls) => services.grades.canUserViewGrades(user, gradingConfig, cls))
      .map((cls) => {
        const clsStudents = allStudents.filter((s) => s.classRoomId === cls.id);
        const formula = services.grades.resolveFormula(gradingConfig, cls.levelCode, subjectKey);

        const termAvg = (term: 1 | 2 | 3): number | null => {
          const tGrades = new Map(
            allGrades
              .filter(
                (g) =>
                  g.classRoomId === cls.id &&
                  g.termNumber === term &&
                  g.subjectKey === subjectKey
              )
              .map((g) => [g.studentId, g])
          );
          const vals: number[] = [];
          for (const st of clsStudents) {
            const res = services.grades.calculateTermAverage(tGrades.get(st.id), formula);
            if (res.value !== null) vals.push(res.value);
          }
          if (vals.length === 0) return null;
          return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
        };

        const activeTermMap = new Map(
          allGrades
            .filter(
              (g) =>
                g.classRoomId === cls.id &&
                g.termNumber === activeTermForBelow10 &&
                g.subjectKey === subjectKey
            )
            .map((g) => [g.studentId, g])
        );

        const below10 = clsStudents
          .map((st) => {
            const res = services.grades.calculateTermAverage(activeTermMap.get(st.id), formula);
            return { student: st, avg: res.value };
          })
          .filter((x): x is { student: StudentRecord; avg: number } => x.avg !== null && x.avg < 10)
          .sort((a, b) => a.avg - b.avg);

        return {
          classRoom: cls,
          studentCount: clsStudents.length,
          t1: termAvg(1),
          t2: termAvg(2),
          t3: termAvg(3),
          below10,
        };
      });
  }, [allClasses, allStudents, allGrades, gradingConfig, subjectKey, termTab, user]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setSubTab('table')}
          className={`min-h-[42px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'table'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <BookOpenCheck className="w-4 h-4" />
          <span>{t.grades.classGradesTab}</span>
        </button>
        <button
          type="button"
          onClick={() => setSubTab('summary')}
          className={`min-h-[42px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 ${
            subTab === 'summary'
              ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--color-text-muted)]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{t.grades.summaryAllClasses}</span>
        </button>
      </div>

      {subTab === 'table' ? (
        <>
          {/* Level & Class selector */}
          <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2.5">
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-[var(--color-background)]">
              {LEVELS.map((lvl) => (
                <button
                  key={lvl.code}
                  type="button"
                  onClick={() => {
                    setActiveLevel(lvl.code);
                    const firstInLvl = allClasses.find((c) => c.levelCode === lvl.code);
                    if (firstInLvl) setSelectedClassId(firstInLvl.id);
                  }}
                  className={`min-h-[38px] rounded-xl text-xs font-bold ${
                    activeLevel === lvl.code
                      ? 'bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {lvl[lang]}
                </button>
              ))}
            </div>

            {levelClasses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {levelClasses.map((cls) => (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => setSelectedClassId(cls.id)}
                    className={`min-h-[40px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 border ${
                      selectedClass?.id === cls.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                        : 'border-[var(--color-border)] text-[var(--color-text)]'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>{cls.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedClass ? (
            <GradesTableWorkspace
              ctx={ctx}
              user={user}
              schoolName={schoolName}
              classRoom={selectedClass}
              allClasses={allClasses}
              subjects={activeSubjects}
              isArchiveYear={isArchiveYear}
              termTab={termTab}
              onChangeTermTab={setTermTab}
              subjectKey={subjectKey}
              onChangeSubject={setSubjectKey}
              crossLinkButton={{
                label: t.grades.openClassList,
                onClick: () => onOpenClassList(selectedClass.levelCode, selectedClass.id),
              }}
              onDataChanged={loadAll}
              onSubjectsChanged={async () => {
                await loadAll();
                if (onSubjectsChanged) await onSubjectsChanged();
              }}
            />
          ) : (
            <EmptyState title={t.sections.addClass} />
          )}
        </>
      ) : (
        <div className="space-y-4">
          {/* Dynamic subject selector for summary (hidden if only 1 active subject) */}
          {activeSubjects.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {activeSubjects.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubjectKey(sub.id)}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                    subjectKey === sub.id
                      ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                      : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)]'
                  }`}
                >
                  <DynamicIcon name={sub.icon} className="w-3.5 h-3.5" />
                  <span>{pickLocalized(sub.names)}</span>
                </button>
              ))}
            </div>
          )}

          {summaryRows.length === 0 ? (
            <EmptyState title={t.sections.addClass} />
          ) : (
            <>
              {/* Comparison Chart & Term Averages Table */}
              <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-4">
                <h3 className="text-sm font-extrabold">{t.grades.comparisonChart}</h3>
                <div className="space-y-2.5">
                  {summaryRows.map((row) => {
                    const activeVal =
                      (termTab === 2 ? row.t2 : termTab === 3 ? row.t3 : row.t1) ?? 0;
                    const pct = Math.min(100, Math.round((activeVal / 20) * 100));
                    return (
                      <div key={row.classRoom.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="font-bold">
                            {row.classRoom.name} ({row.studentCount} {t.grades.studentsCount})
                          </span>
                          <span className="text-[var(--color-text-muted)]">
                            T1: <strong>{row.t1?.toFixed(2) ?? '—'}</strong> · T2:{' '}
                            <strong>{row.t2?.toFixed(2) ?? '—'}</strong> · T3:{' '}
                            <strong>{row.t3?.toFixed(2) ?? '—'}</strong>
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-[var(--color-background)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor:
                                activeVal > 0 && activeVal < 10
                                  ? 'var(--color-warning)'
                                  : 'var(--color-primary)',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Students Below 10 per class */}
              <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-4 space-y-3">
                <h3 className="text-sm font-extrabold">{t.grades.below10List}</h3>
                {summaryRows.map((row) => (
                  <div key={row.classRoom.id} className="border-t border-[var(--color-border)] pt-2.5 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-extrabold text-[var(--color-primary)]">
                        {row.classRoom.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveLevel(row.classRoom.levelCode);
                          setSelectedClassId(row.classRoom.id);
                          setSubTab('table');
                        }}
                        className="text-[11px] font-bold text-[var(--color-primary)] underline"
                      >
                        {t.common.open}
                      </button>
                    </div>
                    {row.below10.length === 0 ? (
                      <p className="text-[11px] text-[var(--color-text-muted)]">—</p>
                    ) : (
                      <div className="divide-y divide-[var(--color-border)]">
                        {row.below10.map((b) => (
                          <div
                            key={b.student.id}
                            className="py-1.5 flex items-center justify-between text-xs tabular-nums"
                          >
                            <span>
                              {b.student.lastName} {b.student.firstName}
                            </span>
                            <span className="font-extrabold text-[var(--color-warning)]">
                              {b.avg.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
