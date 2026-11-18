import React, { useState } from 'react';
import { User } from 'lucide-react';
import { triggerRipple } from '@/src/hooks/useRipple';
import { useI18n } from '@/src/i18n/I18nContext';
import type {
  AcademicYearRecord,
  ClassRoomRecord,
  SchoolRecord,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';

interface IdentityCardProps {
  user: UserRecord;
  school: SchoolRecord;
  year: AcademicYearRecord;
  classes: ClassRoomRecord[];
  subjects?: SubjectRecord[];
  onSaveIdentity: (patch: {
    displayName: string;
    schoolName: string;
    assignedClasses: string[];
  }) => Promise<void>;
  onSaveClassSubjects?: (updates: Array<{ classId: string; subjectIds: string[] }>) => Promise<void>;
}

export const IdentityCard: React.FC<IdentityCardProps> = ({
  user,
  school,
  year,
  classes,
  subjects = [],
  onSaveIdentity,
  onSaveClassSubjects,
}) => {
  const { t, pickLocalized } = useI18n();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [schoolName, setSchoolName] = useState(school.name);
  const [classesInput, setClassesInput] = useState(
    (user.assignedClasses.length > 0 ? user.assignedClasses : classes.map((c) => c.name)).join(', ')
  );
  const [classSubjectsMap, setClassSubjectsMap] = useState<Record<string, string[]>>({});

  const displayedClasses =
    classes.length > 0
      ? Array.from(new Set([...classes.map((c) => c.name), ...user.assignedClasses]))
      : user.assignedClasses;

  const openEditor = () => {
    setDisplayName(user.displayName);
    setSchoolName(school.name);
    setClassesInput(displayedClasses.join(', '));
    const map: Record<string, string[]> = {};
    for (const cls of classes) {
      map[cls.id] = [...(cls.subjectIds ?? [])];
    }
    setClassSubjectsMap(map);
    setEditing(true);
  };

  const toggleClassSubject = (classId: string, subjectId: string) => {
    setClassSubjectsMap((prev) => {
      const current = prev[classId] ?? [];
      const exists = current.includes(subjectId);
      return {
        ...prev,
        [classId]: exists ? current.filter((id) => id !== subjectId) : [...current, subjectId],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedClasses = classesInput
      .split(/[,،\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await onSaveIdentity({
      displayName: displayName.trim() || user.displayName,
      schoolName: schoolName.trim() || school.name,
      assignedClasses: parsedClasses,
    });
    if (onSaveClassSubjects && classes.length > 0) {
      const updates = classes.map((cls) => ({
        classId: cls.id,
        subjectIds: classSubjectsMap[cls.id] ?? [],
      }));
      await onSaveClassSubjects(updates);
    }
    setEditing(false);
  };

  const rows: Array<{ label: string; value: string; tabular?: boolean }> = [
    { label: t.home.teacherName, value: user.displayName },
    { label: t.home.schoolName, value: school.name },
    {
      label: t.home.assignedClasses,
      value: displayedClasses.length > 0 ? displayedClasses.join(' · ') : '—',
      tabular: true,
    },
    { label: t.home.academicYear, value: year.label, tabular: true },
  ];

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          triggerRipple(e);
          openEditor();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openEditor();
        }}
        className="ripple-surface cursor-pointer rounded-[28px] p-5 text-white shadow-[0_10px_28px_rgba(30,64,175,0.22)] transition-transform active:scale-[0.99] select-none"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
        }}
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-white/16 border border-white/25 flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-white" />
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-baseline gap-2 text-[13px] sm:text-sm min-w-0">
                <span className="font-bold text-white shrink-0">{r.label}:</span>
                <span
                  className={`font-normal text-white/85 truncate ${
                    r.tabular ? 'tabular-nums' : ''
                  }`}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
          >
            <div className="px-6 pt-5 pb-3 border-b border-[var(--color-border)]">
              <h3 className="text-base font-extrabold text-[var(--color-text)]">
                {t.home.editIdentity}
              </h3>
            </div>
            <div className="flex-1 overflow-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {t.home.teacherName}
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[48px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {t.home.schoolName}
                </label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className="w-full min-h-[48px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                  {t.home.assignedClasses} (1M1, 2M2, 3M3)
                </label>
                <input
                  type="text"
                  value={classesInput}
                  onChange={(e) => setClassesInput(e.target.value)}
                  className="w-full min-h-[48px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
                />
              </div>

              {classes.length > 0 && subjects.length > 0 && (
                <div className="pt-2 border-t border-[var(--color-border)] space-y-2.5">
                  <div className="text-xs font-extrabold text-[var(--color-text)]">
                    {t.subjects.linkedSubjects}
                  </div>
                  <div className="space-y-2">
                    {classes.map((cls) => {
                      const selectedIds = classSubjectsMap[cls.id] ?? [];
                      return (
                        <div
                          key={cls.id}
                          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-2.5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-[var(--color-text)]">
                              {cls.name}
                            </span>
                            {selectedIds.length === 0 && (
                              <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">
                                {t.subjects.allActiveSubjects}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {subjects.map((sub) => {
                              const active = selectedIds.includes(sub.id);
                              return (
                                <button
                                  key={sub.id}
                                  type="button"
                                  onClick={() => toggleClassSubject(cls.id, sub.id)}
                                  className={`min-h-[32px] px-2.5 rounded-xl border text-[11px] font-bold transition-colors ${
                                    active
                                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                                  }`}
                                >
                                  {pickLocalized(sub.names)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[48px] px-5 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)]"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[48px] px-6 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
