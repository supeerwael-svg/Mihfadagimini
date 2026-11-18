import React, { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Download,
  ExternalLink,
  FolderHeart,
  History,
  Info,
  Pin,
  Printer,
  QrCode,
  RotateCcw,
  ScanText,
  Share2,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import { getFileStatus, getFileTitle } from '@/src/services/FilesService';
import type { TagWithStats } from '@/src/services/LibraryService';
import type {
  FileRecord,
  FileVersionRecord,
  LanguageCode,
  LibraryCollectionRecord,
  MiddleSchoolLevel,
  SectionNode,
  SubjectRecord,
} from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';
import { formatFileSize, formatShortDate, getExtensionBadge } from '@/src/utils/fileFormat';

interface FileDetailsModalProps {
  file: FileRecord | null;
  ctx: ServiceContext;
  sections: SectionNode[];
  subjects: SubjectRecord[];
  canWrite: boolean;
  onClose: () => void;
  onOpenViewer: (file: FileRecord, initialPage?: number) => void;
  onUpdated: () => Promise<void> | void;
}

const LEVELS: MiddleSchoolLevel[] = ['1M', '2M', '3M', '4M'];

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  file,
  ctx,
  sections,
  subjects,
  canWrite,
  onClose,
  onOpenViewer,
  onUpdated,
}) => {
  const { t, lang, pickLocalized } = useI18n();
  const [tab, setTab] = useState<'info' | 'versions' | 'qr'>('info');
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Editable metadata state
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [levelCode, setLevelCode] = useState<MiddleSchoolLevel | ''>('');
  const [subjectId, setSubjectId] = useState('');
  const [termNumber, setTermNumber] = useState<1 | 2 | 3 | ''>('');
  const [description, setDescription] = useState('');
  const [authorSource, setAuthorSource] = useState('');
  const [docLang, setDocLang] = useState<LanguageCode>('ar');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [hasQrMap, setHasQrMap] = useState(false);
  const [qrPayload, setQrPayload] = useState('');
  const [qrSvg, setQrSvg] = useState('');

  // Collections & Versions & OCR
  const [collections, setCollections] = useState<LibraryCollectionRecord[]>([]);
  const [existingTags, setExistingTags] = useState<TagWithStats[]>([]);
  const [versions, setVersions] = useState<FileVersionRecord[]>([]);
  const [versionNote, setVersionNote] = useState('');
  const [isScanned, setIsScanned] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrStatusMsg, setOcrStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const versionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!file) return;
    setTab('info');
    setTitle(getFileTitle(file));
    setSectionId(file.sectionId);
    setLevelCode(file.levelCode ?? '');
    setSubjectId(file.subjectId ?? '');
    setTermNumber(file.termNumber ?? '');
    setDescription(file.description ?? '');
    setAuthorSource(file.authorSource ?? '');
    setDocLang(file.language ?? 'ar');
    setTags(file.tags ?? []);
    setHasQrMap(Boolean(file.hasQrMap));
    setQrPayload(file.qrPayload || file.externalUrl || `portfolio:file:${file.id}`);
    setOcrProgress(null);
    setOcrStatusMsg('');

    let createdThumbUrl: string | null = null;
    if (file.thumbnailBlob) {
      createdThumbUrl = URL.createObjectURL(file.thumbnailBlob);
      setThumbUrl(createdThumbUrl);
    } else {
      setThumbUrl(null);
    }

    Promise.all([
      services.library.listCollections(ctx.academicYearId),
      services.library.listTags(ctx.academicYearId),
      services.files.listVersions(ctx.academicYearId, file.id),
      services.adapter.getById('searchIndex', file.id),
    ]).then(([cols, tStats, vers, idxRec]) => {
      setCollections(cols);
      setExistingTags(tStats);
      setVersions(vers);
      setIsScanned(Boolean(idxRec?.isScannedUnsearchable && !idxRec?.ocrCompleted));
    });

    return () => {
      if (createdThumbUrl) URL.revokeObjectURL(createdThumbUrl);
    };
  }, [file, ctx.academicYearId]);

  useEffect(() => {
    if (!file) return;
    const payload = qrPayload.trim() || file.externalUrl || `portfolio:file:${file.id}`;
    QRCode.toString(payload, { type: 'svg', margin: 1, width: 196 })
      .then((svg) => setQrSvg(svg))
      .catch(() => setQrSvg(''));
  }, [file, qrPayload]);

  if (!file) return null;

  const status = getFileStatus(file);
  const canRunOcr =
    file.extension.toLowerCase() === 'pdf' ||
    file.mimeType === 'application/pdf' ||
    file.mimeType.startsWith('image/');

  const handleSaveMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await services.files.updateMetadata(file.id, {
        title: title.trim() || file.name,
        name: title.trim() || file.name,
        sectionId,
        levelCode: levelCode || null,
        subjectId: subjectId || null,
        termNumber: termNumber ? (termNumber as 1 | 2 | 3) : undefined,
        description,
        authorSource,
        language: docLang,
        tags,
        hasQrMap,
        qrPayload: qrPayload.trim() || null,
      });
      await onUpdated();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleUploadNewVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    await services.files.replaceFileWithUpload(ctx, file.id, picked, versionNote || 'Updated copy');
    setVersionNote('');
    const vers = await services.files.listVersions(ctx.academicYearId, file.id);
    setVersions(vers);
    await onUpdated();
  };

  const handleRestoreVersion = async (verId: string) => {
    await services.files.restoreVersion(ctx, file.id, verId);
    const vers = await services.files.listVersions(ctx.academicYearId, file.id);
    setVersions(vers);
    await onUpdated();
  };

  const handleRunOcr = async () => {
    setOcrProgress(2);
    setOcrStatusMsg(t.library.ocrRunning);
    const res = await services.search.runOcrForFile(file.id, (pct, stage) => {
      setOcrProgress(pct);
      if (stage) setOcrStatusMsg(stage);
    });
    if (res.error) {
      setOcrStatusMsg(res.error);
      setOcrProgress(null);
    } else {
      setIsScanned(false);
      setOcrStatusMsg(`${t.library.ocrSuccess} (${res.pageTexts.length})`);
      setOcrProgress(null);
    }
  };

  const handleDownload = () => {
    if (!file.blob) return;
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.originalFileName || `${getFileTitle(file)}.${file.extension || 'bin'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    if (file.externalUrl && navigator.share) {
      await navigator.share({ title: getFileTitle(file), url: file.externalUrl }).catch(() => {});
      return;
    }
    if (file.blob && navigator.share) {
      const shareFile = new File([file.blob], file.originalFileName || file.name, {
        type: file.mimeType,
      });
      if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        await navigator.share({ title: getFileTitle(file), files: [shareFile] }).catch(() => {});
        return;
      }
    }
    handleDownload();
  };

  const handlePrint = () => {
    if (!file.blob) {
      window.print();
      return;
    }
    const url = URL.createObjectURL(file.blob);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 2000);
    };
  };

  const suggestedTags = services.library.suggestTagsForFileName(
    file.originalFileName || file.name,
    existingTags
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* Header with cover preview */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-start gap-3">
          <button
            type="button"
            onClick={() => onOpenViewer(file, file.lastReadPage ?? undefined)}
            className="w-14 h-18 rounded-2xl bg-[var(--color-background)] border border-[var(--color-border)] overflow-hidden flex items-center justify-center shrink-0"
          >
            {thumbUrl ? (
              <img src={thumbUrl} alt={getFileTitle(file)} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-extrabold text-[var(--color-primary)]">
                {getExtensionBadge(file)}
              </span>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-extrabold text-[var(--color-text)] leading-snug break-words">
              {getFileTitle(file)}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] tabular-nums">
              <span>{getExtensionBadge(file)}</span>
              <span>·</span>
              <span>{formatFileSize(file.size)}</span>
              <span>·</span>
              <span>{formatShortDate(file.createdAt, lang)}</span>
              {file.pageCount ? (
                <>
                  <span>·</span>
                  <span>
                    {file.pageCount} {t.library.pagesLabel}
                  </span>
                </>
              ) : null}
              <span>·</span>
              <span>
                {t.library.openedCount}: {file.openCount ?? 0}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-[var(--color-text-muted)] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="px-4 pt-2 border-b border-[var(--color-border)] flex items-center gap-2">
          {(
            [
              { id: 'info', label: t.library.metadataTab, Icon: Info },
              {
                id: 'versions',
                label: `${t.library.versionsTab} (${file.versionCount ?? 1})`,
                Icon: History,
              },
              { id: 'qr', label: t.library.qrTab, Icon: QrCode },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[40px] px-3 text-xs font-bold inline-flex items-center gap-1.5 border-b-2 transition-colors ${
                tab === id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {tab === 'info' && (
            <form id="file-details-form" onSubmit={handleSaveMetadata} className="space-y-3.5">
              {/* OCR Callout for Scanned PDFs / Images */}
              {canRunOcr && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <ScanText className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                        <span>{isScanned ? t.library.notSearchable : t.library.runOcr}</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {t.library.ocrHint}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={ocrProgress !== null}
                      onClick={handleRunOcr}
                      className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold shrink-0 disabled:opacity-60"
                    >
                      {ocrProgress !== null ? `${ocrProgress}%` : t.library.runOcr}
                    </button>
                  </div>
                  {ocrStatusMsg && (
                    <div className="text-[11px] font-bold text-[var(--color-primary)]">
                      {ocrStatusMsg}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                  {t.library.fileTitle}
                </label>
                <input
                  type="text"
                  required
                  disabled={!canWrite}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm font-bold disabled:opacity-70"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.library.browseSection}
                  </label>
                  <select
                    disabled={!canWrite}
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs font-semibold"
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {pickLocalized(s.names)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.library.browseSubject}
                  </label>
                  <select
                    disabled={!canWrite}
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs font-semibold"
                  >
                    <option value="">--</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {pickLocalized(s.names)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.library.browseLevel}
                  </label>
                  <select
                    disabled={!canWrite}
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
                    {t.library.browseTerm}
                  </label>
                  <select
                    disabled={!canWrite}
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
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.library.fileLanguage}
                  </label>
                  <select
                    disabled={!canWrite}
                    value={docLang}
                    onChange={(e) => setDocLang(e.target.value as LanguageCode)}
                    className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs font-bold"
                  >
                    <option value="ar">العربية</option>
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                  {t.library.description}
                </label>
                <textarea
                  rows={2}
                  disabled={!canWrite}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                  {t.library.authorSource}
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={authorSource}
                  onChange={(e) => setAuthorSource(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">
                  {t.common.tags}
                </label>
                {canWrite && (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="w-3.5 h-3.5 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && tagInput.trim()) {
                            e.preventDefault();
                            setTags((prev) => Array.from(new Set([...prev, tagInput.trim()])));
                            setTagInput('');
                          }
                        }}
                        placeholder={t.common.addTag}
                        className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] ps-8 pe-3 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!tagInput.trim()) return;
                        setTags((prev) => Array.from(new Set([...prev, tagInput.trim()])));
                        setTagInput('');
                      }}
                      className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold"
                    >
                      {t.common.add}
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tg) => (
                    <button
                      key={tg}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => setTags((prev) => prev.filter((item) => item !== tg))}
                      className="px-2.5 py-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-on-primary)] text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <span>#{tg}</span>
                      {canWrite && <X className="w-3 h-3" />}
                    </button>
                  ))}
                  {canWrite &&
                    suggestedTags
                      .filter((st) => !tags.includes(st))
                      .slice(0, 4)
                      .map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setTags((p) => Array.from(new Set([...p, st])))}
                          className="px-2 py-0.5 rounded-lg border border-[var(--color-border)] text-[11px] font-semibold text-[var(--color-text-muted)]"
                        >
                          + {st}
                        </button>
                      ))}
                </div>
              </div>

              {/* Collection Memberships */}
              {collections.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">
                    {t.library.customCollections}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {collections.map((col) => {
                      const inCol = col.fileIds.includes(file.id);
                      return (
                        <button
                          key={col.id}
                          type="button"
                          onClick={async () => {
                            if (inCol) {
                              await services.library.removeFileFromCollection(col.id, file.id);
                            } else {
                              await services.library.addFilesToCollection(col.id, [file.id]);
                            }
                            const next = await services.library.listCollections(ctx.academicYearId);
                            setCollections(next);
                          }}
                          className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 ${
                            inCol
                              ? 'bg-[var(--color-primary-light)] border-[var(--color-primary)] text-[var(--color-primary)]'
                              : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                          }`}
                        >
                          <FolderHeart className="w-3.5 h-3.5" />
                          <span>{col.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </form>
          )}

          {tab === 'versions' && (
            <div className="space-y-3">
              {canWrite && (
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 space-y-2">
                  <input
                    type="text"
                    value={versionNote}
                    onChange={(e) => setVersionNote(e.target.value)}
                    placeholder={t.library.versionNote}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs"
                  />
                  <input
                    ref={versionInputRef}
                    type="file"
                    onChange={handleUploadNewVersion}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => versionInputRef.current?.click()}
                    className="w-full min-h-[44px] rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    <span>{t.library.uploadNewVersion}</span>
                  </button>
                </div>
              )}

              <div className="rounded-2xl border border-[var(--color-border)] p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold text-[var(--color-primary)]">
                    v{file.versionCount ?? 1} · {t.library.currentVersion}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                    {formatFileSize(file.size)} · {formatShortDate(file.updatedAt, lang)}
                  </div>
                </div>
                <Check className="w-4 h-4 text-emerald-600" />
              </div>

              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="rounded-2xl border border-[var(--color-border)] p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[var(--color-text)] truncate">
                      v{ver.versionNumber} · {ver.fileName}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {ver.note} · {formatFileSize(ver.size)} · {formatShortDate(ver.createdAt, lang)}
                    </div>
                  </div>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => handleRestoreVersion(ver.id)}
                      className="min-h-[38px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t.library.restoreVersion}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'qr' && (
            <div className="space-y-4 text-center">
              <div className="text-xs font-bold text-[var(--color-text-muted)]">
                {t.library.qrTitle}
              </div>
              {qrSvg && (
                <div
                  className="mx-auto w-52 h-52 rounded-3xl bg-white p-3 border border-[var(--color-border)] flex items-center justify-center shadow-sm"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
              )}
              <div className="text-start space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={hasQrMap}
                    onChange={(e) => setHasQrMap(e.target.checked)}
                    className="accent-[var(--color-primary)] w-4 h-4"
                  />
                  <span>{t.library.qrMapToggle}</span>
                </label>
                <label className="block text-[11px] font-bold text-[var(--color-text-muted)]">
                  {t.library.qrPayloadLabel}
                </label>
                <input
                  type="text"
                  disabled={!canWrite}
                  value={qrPayload}
                  onChange={(e) => setQrPayload(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Quick Actions & Save */}
        <div className="p-3 border-t border-[var(--color-border)] bg-[var(--color-surface)] space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onOpenViewer(file, file.lastReadPage ?? undefined)}
              className="min-h-[40px] px-3 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t.common.open}</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await services.files.toggleFavorite(file.id);
                await onUpdated();
              }}
              className="min-h-[40px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Star
                className={`w-3.5 h-3.5 ${file.isFavorite ? 'fill-amber-400 text-amber-500' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={async () => {
                await services.files.togglePin(file.id);
                await onUpdated();
              }}
              className="min-h-[40px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Pin
                className={`w-3.5 h-3.5 ${file.pinned ? 'text-[var(--color-primary)] fill-current' : ''}`}
              />
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[40px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[40px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[40px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            {canWrite && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    if (status === 'archived') {
                      await services.archive.restoreArchivedFile(file.id);
                    } else {
                      await services.archive.archiveFile(file.id);
                    }
                    await onUpdated();
                    onClose();
                  }}
                  className="min-h-[40px] px-2.5 rounded-xl border border-[var(--color-border)] text-xs font-bold inline-flex items-center gap-1"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>
                    {status === 'archived'
                      ? t.library.restoreFromArchive
                      : t.library.archiveFile}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await services.files.deleteFile(file.id);
                    await onUpdated();
                    onClose();
                  }}
                  className="min-h-[40px] px-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-bold inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {canWrite && tab !== 'versions' && (
            <button
              type="submit"
              form="file-details-form"
              onClick={tab === 'qr' ? handleSaveMetadata : undefined}
              disabled={saving}
              className="w-full min-h-[44px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{t.common.save}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
