import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  RotateCw,
  Search,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { useI18n } from '@/src/i18n/I18nContext';
import type { FileRecord } from '@/src/types/models';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface FilePreviewModalProps {
  file: FileRecord | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const { t } = useI18n();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfPagesCount, setPdfPagesCount] = useState(0);
  const [zoom, setZoom] = useState(1.2);
  const [rotation, setRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Word HTML state
  const [wordHtml, setWordHtml] = useState('');

  // Excel state
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [sheetsData, setSheetsData] = useState<Record<string, string[][]>>({});
  const [sheetSearch, setSheetSearch] = useState('');

  const ext = (file?.extension || '').toLowerCase();
  const mime = (file?.mimeType || '').toLowerCase();

  const kind = useMemo(() => {
    if (!file) return 'none';
    if (file.externalUrl) return 'url';
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (ext === 'docx' || mime.includes('wordprocessingml')) return 'docx';
    if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('csv'))
      return 'excel';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext))
      return 'image';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (mime.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video';
    if (mime.startsWith('text/') || ext === 'txt') return 'text';
    return 'unsupported';
  }, [file, ext, mime]);

  useEffect(() => {
    let url: string | null = null;
    setErrorMsg('');
    setWordHtml('');
    setPdfDoc(null);
    setPdfPage(1);
    setPdfPagesCount(0);
    setSheetNames([]);
    setSheetsData({});
    setSheetSearch('');
    setZoom(1.15);
    setRotation(0);

    if (!file || !file.blob) {
      setObjectUrl(null);
      return;
    }

    url = URL.createObjectURL(file.blob);
    setObjectUrl(url);

    const loadStructured = async () => {
      if (!file.blob) return;
      setLoading(true);
      try {
        if (kind === 'pdf') {
          const buf = await file.blob.arrayBuffer();
          const doc = await pdfjsLib.getDocument({ data: buf }).promise;
          setPdfDoc(doc);
          setPdfPagesCount(doc.numPages);
          setPdfPage(1);
        } else if (kind === 'docx') {
          const buf = await file.blob.arrayBuffer();
          const res = await mammoth.convertToHtml({ arrayBuffer: buf });
          setWordHtml(res.value || '<p>Empty document</p>');
        } else if (kind === 'excel') {
          const buf = await file.blob.arrayBuffer();
          const wb = XLSX.read(buf, { type: 'array' });
          const map: Record<string, string[][]> = {};
          for (const name of wb.SheetNames) {
            const ws = wb.Sheets[name];
            const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
            map[name] = rows.map((r) =>
              Array.isArray(r) ? r.map((cell) => (cell == null ? '' : String(cell))) : []
            );
          }
          setSheetNames(wb.SheetNames);
          setActiveSheet(wb.SheetNames[0] || '');
          setSheetsData(map);
        } else if (kind === 'text') {
          const txt = await file.blob.text();
          setWordHtml(`<pre style="white-space:pre-wrap;font-family:inherit">${txt.replace(/</g, '&lt;')}</pre>`);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Preview error');
      } finally {
        setLoading(false);
      }
    };

    loadStructured();

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, kind]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pdfPage);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch (err) {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : 'PDF render error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pdfPage, zoom]);

  if (!file) return null;

  const handleDownload = () => {
    if (file.externalUrl) {
      window.open(file.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = file.name;
    a.click();
  };

  const handleShare = async () => {
    if (file.externalUrl && navigator.share) {
      await navigator.share({ title: file.name, url: file.externalUrl }).catch(() => {});
      return;
    }
    if (file.blob && navigator.share) {
      const shareFile = new File([file.blob], file.name, { type: file.mimeType });
      if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        await navigator.share({ title: file.name, files: [shareFile] }).catch(() => {});
        return;
      }
    }
    handleDownload();
  };

  const currentSheetRows = sheetsData[activeSheet] || [];
  const filteredRows = sheetSearch.trim()
    ? currentSheetRows.filter((row, idx) =>
        idx === 0 ||
        row.some((cell) => cell.toLowerCase().includes(sheetSearch.trim().toLowerCase()))
      )
    : currentSheetRows;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-background)]">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[var(--color-text)] truncate">{file.name}</h3>
            <p className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
              {ext.toUpperCase()} · {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="min-h-[42px] px-3 rounded-xl border border-[var(--color-border)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t.common.share}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="min-h-[42px] px-3 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{t.common.download}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {loading && (
          <div className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            {t.common.loading}
          </div>
        )}

        {!loading && errorMsg && (
          <div className="mx-auto max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center">
            <p className="text-sm font-semibold text-[var(--color-text)] mb-4">
              {t.files.previewNotSupported}
            </p>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
            >
              {t.common.download}
            </button>
          </div>
        )}

        {!loading && !errorMsg && kind === 'url' && file.externalUrl && (
          <div className="mx-auto max-w-2xl rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center space-y-4">
            <p className="text-sm font-bold text-[var(--color-text)]">{file.name}</p>
            <p className="text-xs text-[var(--color-text-muted)] break-all">{file.externalUrl}</p>
            <a
              href={file.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-sm font-bold"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{t.common.open}</span>
            </a>
          </div>
        )}

        {!loading && !errorMsg && kind === 'pdf' && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-3 py-1.5 shadow-sm">
              <button
                type="button"
                disabled={pdfPage <= 1}
                onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold tabular-nums px-2">
                {pdfPage} / {pdfPagesCount}
              </span>
              <button
                type="button"
                disabled={pdfPage >= pdfPagesCount}
                onClick={() => setPdfPage((p) => Math.min(pdfPagesCount, p + 1))}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="h-4 w-px bg-[var(--color-border)]" />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.6, z + 0.2))}
                className="min-h-[38px] min-w-[38px] rounded-xl flex items-center justify-center"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto max-w-full rounded-2xl shadow-md bg-white p-2">
              <canvas ref={canvasRef} className="block max-w-full h-auto" />
            </div>
          </div>
        )}

        {!loading && !errorMsg && (kind === 'docx' || kind === 'text') && (
          <div
            className="mx-auto max-w-3xl rounded-3xl bg-white text-slate-900 p-6 shadow-sm border border-[var(--color-border)] prose prose-sm max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{ __html: wordHtml }}
          />
        )}

        {!loading && !errorMsg && kind === 'excel' && (
          <div className="mx-auto max-w-6xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setActiveSheet(name)}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-bold ${
                      activeSheet === name
                        ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                        : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="text"
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  placeholder={t.sections.inSheetSearch}
                  className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] ps-9 pe-3 text-xs text-[var(--color-text)]"
                />
              </div>
            </div>
            <div className="overflow-auto max-h-[70dvh] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
              <table className="w-full text-xs text-start border-collapse tabular-nums">
                <tbody>
                  {filteredRows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={
                        ri === 0
                          ? 'bg-[var(--color-primary-light)] font-bold sticky top-0'
                          : 'border-t border-[var(--color-border)] hover:bg-black/5 dark:hover:bg-white/5'
                      }
                    >
                      <td className="px-2.5 py-2 text-[var(--color-text-muted)] border-e border-[var(--color-border)] w-10 text-center">
                        {ri + 1}
                      </td>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          className="px-3 py-2 whitespace-nowrap border-e border-[var(--color-border)] text-[var(--color-text)]"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !errorMsg && kind === 'image' && objectUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl px-3 py-1.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto max-w-full max-h-[75dvh] rounded-2xl p-2">
              <img
                src={objectUrl}
                alt={file.name}
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                className="max-h-[70dvh] object-contain transition-transform origin-center rounded-xl"
              />
            </div>
          </div>
        )}

        {!loading && !errorMsg && kind === 'audio' && objectUrl && (
          <div className="mx-auto max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center space-y-4">
            <p className="text-sm font-bold">{file.name}</p>
            <audio controls src={objectUrl} className="w-full" />
          </div>
        )}

        {!loading && !errorMsg && kind === 'video' && objectUrl && (
          <div className="mx-auto max-w-3xl rounded-3xl overflow-hidden bg-black">
            <video controls src={objectUrl} className="w-full max-h-[75dvh]" />
          </div>
        )}

        {!loading && !errorMsg && kind === 'unsupported' && (
          <div className="mx-auto max-w-md rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 text-center space-y-4">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              {t.files.previewNotSupported}
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                className="min-h-[44px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
              >
                {t.common.share}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[44px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold"
              >
                {t.common.download}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
