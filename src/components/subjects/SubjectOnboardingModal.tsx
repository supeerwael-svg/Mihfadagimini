import React, { useState } from 'react';
import { BookOpen, Check, Plus } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import {
  buildPresetLocalizedNames,
  PRESET_SUBJECT_SPECS,
  SUBJECT_COLOR_PALETTE,
  type PresetSubjectKey,
} from '@/src/services/SubjectsService';
import type { LocalizedText } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { DynamicIcon } from '@/src/components/common/DynamicIcon';

interface SubjectOnboardingModalProps {
  open: boolean;
  ctx: ServiceContext;
  onCompleted: () => Promise<void>;
}

interface PendingSubjectDraft {
  tempId: string;
  presetKey?: PresetSubjectKey;
  names: LocalizedText;
  color: string;
  icon: string;
}

export const SubjectOnboardingModal: React.FC<SubjectOnboardingModalProps> = ({
  open,
  ctx,
  onCompleted,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  // Explicitly zero pre-selected subjects by default
  const [selectedPresets, setSelectedPresets] = useState<PresetSubjectKey[]>([]);
  const [customDrafts, setCustomDrafts] = useState<PendingSubjectDraft[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const togglePreset = (key: PresetSubjectKey) => {
    setSelectedPresets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleAddCustomDraft = () => {
    const clean = customInput.trim();
    if (!clean) return;
    const color = SUBJECT_COLOR_PALETTE[customDrafts.length % SUBJECT_COLOR_PALETTE.length];
    setCustomDrafts((prev) => [
      ...prev,
      {
        tempId: `custom_${Date.now()}_${prev.length}`,
        names: { ar: clean, en: clean, fr: clean },
        color,
        icon: 'BookOpen',
      },
    ]);
    setCustomInput('');
  };

  const totalSelected = selectedPresets.length + customDrafts.length;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      for (const key of selectedPresets) {
        const spec = PRESET_SUBJECT_SPECS.find((p) => p.key === key);
        if (!spec) continue;
        await services.subjects.addSubject(ctx, {
          names: buildPresetLocalizedNames(key),
          color: spec.color,
          icon: spec.icon,
        });
      }
      for (const draft of customDrafts) {
        await services.subjects.addSubject(ctx, {
          names: draft.names,
          color: draft.color,
          icon: draft.icon,
        });
      }
      await services.subjects.markOnboardingCompleted(ctx.academicYearId, ctx.ownerId);
      setSelectedPresets([]);
      setCustomDrafts([]);
      await onCompleted();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await services.subjects.markOnboardingCompleted(ctx.academicYearId, ctx.ownerId);
      await onCompleted();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-[var(--color-text)]">
              {t.subjects.onboardingTitle}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-relaxed">
              {t.subjects.onboardingSubtitle}
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {PRESET_SUBJECT_SPECS.map((spec) => {
              const selected = selectedPresets.includes(spec.key);
              const label = t.subjects.presets[spec.key];
              return (
                <button
                  key={spec.key}
                  type="button"
                  onClick={() => togglePreset(spec.key)}
                  className={`min-h-[54px] p-2.5 rounded-2xl border-2 flex items-center gap-2.5 text-start transition-all ${
                    selected
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]/45 shadow-sm'
                      : 'border-[var(--color-border)] bg-[var(--color-background)]'
                  }`}
                >
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${spec.color}22`, color: spec.color }}
                  >
                    <DynamicIcon name={spec.icon} className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-bold text-[var(--color-text)] flex-1 leading-tight">
                    {label}
                  </span>
                  {selected && (
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary)] text-[var(--color-on-primary)] flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-1 border-t border-[var(--color-border)] space-y-2.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomDraft();
                  }
                }}
                placeholder={t.subjects.customSubjectName}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="flex-1 min-h-[46px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 text-xs font-semibold text-[var(--color-text)]"
              />
              <button
                type="button"
                onClick={handleAddCustomDraft}
                disabled={!customInput.trim()}
                className="min-h-[46px] px-4 rounded-2xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-extrabold inline-flex items-center gap-1 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>{t.common.add}</span>
              </button>
            </div>

            {customDrafts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customDrafts.map((d) => (
                  <button
                    key={d.tempId}
                    type="button"
                    onClick={() =>
                      setCustomDrafts((prev) => prev.filter((item) => item.tempId !== d.tempId))
                    }
                    className="min-h-[36px] px-3 rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary-light)]/50 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <span>{pickLocalized(d.names)}</span>
                    <span className="text-[var(--color-text-muted)]">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="px-5 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-2 bg-[var(--color-background)]/50">
          <button
            type="button"
            disabled={saving}
            onClick={handleSkip}
            className="min-h-[46px] px-4 rounded-2xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-muted)]"
          >
            {t.subjects.onboardingSkip}
          </button>

          <button
            type="button"
            disabled={saving || totalSelected === 0}
            onClick={handleConfirm}
            className="min-h-[46px] px-5 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-extrabold disabled:opacity-45 tabular-nums"
          >
            {saving
              ? t.common.loading
              : `${t.subjects.onboardingConfirm} (${totalSelected})`}
          </button>
        </footer>
      </div>
    </div>
  );
};
