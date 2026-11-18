import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Plus, Sparkles, Tag, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { PreparedUploadCandidate } from '@/src/services/FilesService';
import type { TagWithStats } from '@/src/services/LibraryService';
import type {
  ExamKind,
  LanguageCode,
  MiddleSchoolLevel,
  SubjectRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { formatFileSize, getExtensionBadge } from '@/src/utils/fileFormat';

interface UploadMetadataModalProps {
  open: boolean;
  ctx: ServiceContext;
  sectionId: string;
  sectionName: string;
  initialCandidates: PreparedUploadCandidate[];
  subjects: SubjectRecord[];
  defaultTermNumber?: 1 | 2 | 3;
  examKind?: ExamKind;
  onCancel: () => void;
  onConfirm: () => void;
}

const LEVELS: MiddleSchoolLevel[] = ['1M', '2M', '3M', '4M'];

export const UploadMetadataModal: React.FC<UploadMetadataModalProps> = ({
  open,
  ctx,
  sectionId,
  sectionName,
  initialCandidates,
  subjects,
  defaultTermNumber,
  examKind,
  onCancel,
  onConfirm,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [candidates, setCandidates] = useState<PreparedUploadCandidate[]>(initialCandidates);
  const [levelCode, setLevelCode] = useState<MiddleSchoolLevel | ''>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [termNumber, setTermNumber] = useState<1 | 2 | 3 | ''>(defaultTermNumber ?? '');
  const [description, setDescription] = useState('');
  const [authorSource, setAuthorSource] = useState('');
  const [docLang, setDocLang] = useState<LanguageCode>(lang);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [hasQrMap, setHasQrMap] = useState(false);
  const [existingTags, setExistingTags] = useState<TagWithStats[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCandidates(initialCandidates);
    setDescription('');
    setAuthorSource('');
    setDocLang(lang);
    setTags([]);
    setTagInput('');
    setHasQrMap(false);

    Promise.all([
      services.files.inferSectionDefaults(ctx.academicYearId, sectionId),
      services.library.listTags(ctx.academicYearId),
    ]).then(([defaults, tagStats]) => {
      setLevelCode(defaults.levelCode ?? '');
      setSubjectId(defaults.subjectId ?? (subjects.length === 1 ? subjects[0].id : ''));
      setTermNumber(defaultTermNumber ?? defaults.termNumber ?? '');
      setExistingTags(tagStats);
    });
  }, [open, initialCandidates, ctx.academicYearId, sectionId, defaultTermNumber, lang, subjects]);

  if (!open) return null;

  const suggestedTags = candidates[0]
    ? services.library.suggestTagsForFileName(candidates[0].originalFileName, existingTags)
    : [];

  const addTag = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    setTags((prev) => Array.from(new Set([...prev, clean])));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await services.files.commitPreparedUploads(ctx, sectionId, candidates, {
        levelCode: levelCode || null,
        subjectId: subjectId || null,
        termNumber: termNumber ? (termNumber as 1 | 2 | 3) : undefined,
        tags,
        description,
        authorSource,
        language: docLang,
        examKind,
        hasQrMap,
      });
      onConfirm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
      <form
        onSubmit={handleSave}
        className="w-full max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-[var(--color-text)] truncate">
              {t.library.uploadMetadataTitle}
            </h3>
            <p className="text-[11px] text-[var(--color-text-muted)] truncate">
              {sectionName} · {t.library.uploadMetadataHint}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Candidates list + editable title + SHA-256 duplicate warnings */}
          <div className="space-y-2.5">
            {candidates.map((c, idx) => (
              <div
                key={c.tempId}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-[var(--color-primary-light)] text-[var(--color-primary)] text-[10px] font-extrabold shrink-0">
                    {getExtensionBadge({
                      extension: c.extension,
                      mimeType: c.mimeType,
                      fileCategory: c.fileCategory,
                    })}
                  </span>
                  <input
                    type="text"
                    required
                    value={c.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCandidates((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                      );
                    }}
                    placeholder={t.library.fileTitle}
                    className="flex-1 min-w-0 min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-bold text-[var(--color-text)]"
                  />
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)] tabular-nums shrink-0">
                    {formatFileSize(c.size)}
                  </span>
                </div>

                {c.duplicates.length > 0 && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-300 dark:border-amber-800 p-2.5 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        {t.library.duplicateWarningTitle} ({c.duplicates[0].name})
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'keep_both', label: t.library.keepBoth },
                          { id: 'use_existing', label: t.library.useExisting },
                          { id: 'replace', label: t.library.replaceAsVersion },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setCandidates((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, resolution: opt.id } : item
                              )
                            )
                          }
                          className={`min-h-[36px] px-2 rounded-lg text-[10px] font-bold border ${
                            c.resolution === opt.id
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-[var(--color-surface)] border-amber-300/70 text-[var(--color-text)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pre-filled Classification Metadata */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.library.browseLevel}
              </label>
              <select
                value={levelCode}
                onChange={(e) => setLevelCode(e.target.value as MiddleSchoolLevel | '')}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-bold"
              >
                <option value="">--</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.library.browseSubject}
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-bold"
              >
                <option value="">--</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {pickLocalized(sub.names)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                {t.library.browseTerm}
              </label>
              <select
                value={termNumber}
                onChange={(e) =>
                  setTermNumber(e.target.value ? (Number(e.target.value) as 1 | 2 | 3) : '')
                }
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-bold"
              >
                <option value="">--</option>
                <option value="1">{t.sections.term1}</option>
                <option value="2">{t.sections.term2}</option>
                <option value="3">{t.sections.term3}</option>
              </select>
            </div>
          </div>

          {/* Tags input + smart suggestions */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">
              {t.common.tags}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(tagInput);
                      setTagInput('');
                    }
                  }}
                  placeholder={t.common.addTag}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] ps-8 pe-3 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  addTag(tagInput);
                  setTagInput('');
                }}
                className="min-h-[42px] px-3.5 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span>{t.common.add}</span>
              </button>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tg) => (
                  <button
                    key={tg}
                    type="button"
                    onClick={() => setTags((p) => p.filter((item) => item !== tg))}
                    className="px-2.5 py-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <span>#{tg}</span>
                    <X className="w-3 h-3" />
                  </button>
                ))}
              </div>
            )}

            {suggestedTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  {t.library.suggestedTags}:
                </span>
                {suggestedTags
                  .filter((st) => !tags.includes(st))
                  .map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => addTag(st)}
                      className="px-2 py-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[11px] font-semibold text-[var(--color-text)]"
                    >
                      + {st}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* Description + Author + Language */}
          <div className="space-y-2.5">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.library.description}
              className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={authorSource}
                onChange={(e) => setAuthorSource(e.target.value)}
                placeholder={t.library.authorSource}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
              />
              <select
                value={docLang}
                onChange={(e) => setDocLang(e.target.value as LanguageCode)}
                className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-bold"
              >
                <option value="ar">العربية</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text)] pt-1">
              <input
                type="checkbox"
                checked={hasQrMap}
                onChange={(e) => setHasQrMap(e.target.checked)}
                className="accent-[var(--color-primary)] w-4 h-4"
              />
              <span>{t.library.qrMapToggle}</span>
            </label>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2 bg-[var(--color-surface)]">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[46px] px-4 rounded-2xl border border-[var(--color-border)] text-xs font-bold"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[46px] px-5 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? t.files.compressing : t.common.save}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
