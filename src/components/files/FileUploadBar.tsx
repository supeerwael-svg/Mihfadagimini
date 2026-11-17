import React, { useRef, useState } from 'react';
import { Link2, UploadCloud } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { ExamKind } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';

interface FileUploadBarProps {
  ctx: ServiceContext;
  sectionId: string;
  accept?: string;
  termNumber?: 1 | 2 | 3;
  examKind?: ExamKind;
  allowExternalUrl?: boolean;
  disabled?: boolean;
  onUploaded: () => void;
}

export const FileUploadBar: React.FC<FileUploadBarProps> = ({
  ctx,
  sectionId,
  accept,
  termNumber,
  examKind,
  allowExternalUrl = false,
  disabled = false,
  onUploaded,
}) => {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [currentFile, setCurrentFile] = useState('');
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlName, setUrlName] = useState('');
  const [urlLink, setUrlLink] = useState('');

  if (disabled) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setProgress(0);
    await services.files.uploadFiles(ctx, sectionId, files, {
      termNumber,
      examKind,
      compressImages: true,
      onProgress: (pct, name) => {
        setProgress(pct);
        setCurrentFile(name);
      },
    });
    setProgress(null);
    setCurrentFile('');
    if (inputRef.current) inputRef.current.value = '';
    onUploaded();
  };

  const handleAddUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlName.trim() || !urlLink.trim()) return;
    await services.files.addExternalLink(ctx, sectionId, {
      name: urlName,
      url: urlLink,
    });
    setUrlName('');
    setUrlLink('');
    setShowUrlForm(false);
    onUploaded();
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFilesSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex-1 min-w-[200px] min-h-[48px] rounded-2xl border-2 border-dashed border-[var(--color-primary)]/40 bg-[var(--color-primary-light)]/50 px-4 py-2.5 text-xs font-bold text-[var(--color-primary)] flex items-center justify-center gap-2 hover:bg-[var(--color-primary-light)] transition-colors"
        >
          <UploadCloud className="w-4 h-4 shrink-0" />
          <span className="truncate">{t.files.uploadPrompt}</span>
        </button>

        {allowExternalUrl && (
          <button
            type="button"
            onClick={() => setShowUrlForm((v) => !v)}
            className="min-h-[48px] px-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold text-[var(--color-text)] inline-flex items-center gap-1.5"
          >
            <Link2 className="w-4 h-4 text-[var(--color-primary)]" />
            <span>{t.sections.addExternalUrl}</span>
          </button>
        )}
      </div>

      {progress !== null && (
        <div className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3">
          <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
            <span className="truncate">{currentFile || t.files.compressing}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-background)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-primary)] transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {showUrlForm && (
        <form
          onSubmit={handleAddUrl}
          className="rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] p-3.5 space-y-2.5"
        >
          <input
            type="text"
            required
            value={urlName}
            onChange={(e) => setUrlName(e.target.value)}
            placeholder={t.sections.urlTitle}
            className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
          />
          <input
            type="url"
            required
            value={urlLink}
            onChange={(e) => setUrlLink(e.target.value)}
            placeholder={t.sections.urlLink}
            className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUrlForm(false)}
              className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-[var(--color-text-muted)]"
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
    </div>
  );
};
