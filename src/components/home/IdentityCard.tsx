import React, { useState } from 'react';
import { Calendar, Edit2, School as SchoolIcon, User, Users } from 'lucide-react';
import { triggerRipple } from '@/src/hooks/useRipple';
import { useI18n } from '@/src/i18n/I18nContext';
import type {
  AcademicYearRecord,
  ClassRoomRecord,
  SchoolRecord,
  UserRecord,
} from '@/src/types/models';

interface IdentityCardProps {
  user: UserRecord;
  school: SchoolRecord;
  year: AcademicYearRecord;
  classes: ClassRoomRecord[];
  onSaveIdentity: (patch: {
    displayName: string;
    schoolName: string;
    assignedClasses: string[];
  }) => Promise<void>;
}

export const IdentityCard: React.FC<IdentityCardProps> = ({
  user,
  school,
  year,
  classes,
  onSaveIdentity,
}) => {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [schoolName, setSchoolName] = useState(school.name);
  const [classesInput, setClassesInput] = useState(
    (user.assignedClasses.length > 0 ? user.assignedClasses : classes.map((c) => c.name)).join(', ')
  );

  const displayedClasses =
    classes.length > 0
      ? Array.from(new Set([...classes.map((c) => c.name), ...user.assignedClasses]))
      : user.assignedClasses;

  const openEditor = () => {
    setDisplayName(user.displayName);
    setSchoolName(school.name);
    setClassesInput(displayedClasses.join(', '));
    setEditing(true);
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
    setEditing(false);
  };

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
        className="ripple-surface cursor-pointer rounded-[28px] p-5 text-[var(--color-on-primary)] shadow-md transition-transform active:scale-[0.99] select-none"
        style={{
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-14 h-14 rounded-full bg-white/18 border border-white/25 flex items-center justify-center shrink-0">
              <User className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] opacity-80 font-semibold">{t.home.teacherName}</div>
              <h2 className="text-lg font-extrabold truncate">{user.displayName}</h2>
              {user.subjectSpecialty && (
                <p className="text-xs opacity-85 truncate">{user.subjectSpecialty}</p>
              )}
            </div>
          </div>

          <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
            <Edit2 className="w-4 h-4" />
          </span>
        </div>

        <div className="mt-4 pt-3.5 border-t border-white/20 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <SchoolIcon className="w-4 h-4 opacity-85 shrink-0" />
            <span className="opacity-80 shrink-0">{t.home.schoolName}:</span>
            <span className="font-bold truncate">{school.name}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 opacity-85 shrink-0" />
            <span className="opacity-80 shrink-0">{t.home.assignedClasses}:</span>
            <span className="font-bold truncate tabular-nums">
              {displayedClasses.length > 0 ? displayedClasses.join(' · ') : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Calendar className="w-4 h-4 opacity-85 shrink-0" />
            <span className="opacity-80 shrink-0">{t.home.academicYear}:</span>
            <span className="font-bold tabular-nums truncate">{year.label}</span>
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-base font-extrabold text-[var(--color-text)]">
              {t.home.editIdentity}
            </h3>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">
                {t.home.teacherName}
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
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
                className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
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
                className="w-full min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-sm text-[var(--color-text)]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text)]"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
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
