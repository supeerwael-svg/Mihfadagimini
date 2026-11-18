import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  // Fallback handled by pdfjs inline fake worker inside dedicated Web Worker
}

export interface IndexWorkerRequest {
  requestId: string;
  fileId: string;
  extension: string;
  mimeType: string;
  buffer: ArrayBuffer;
}

export interface IndexWorkerPageText {
  page: number;
  text: string;
}

export interface IndexWorkerResponse {
  requestId: string;
  fileId: string;
  pageCount: number | null;
  pageTexts: IndexWorkerPageText[];
  isScannedUnsearchable: boolean;
  error?: string;
}

async function extractPdfText(buffer: ArrayBuffer): Promise<{
  pageCount: number;
  pageTexts: IndexWorkerPageText[];
  isScannedUnsearchable: boolean;
}> {
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const totalPages = doc.numPages || 0;
  const maxIndexPages = Math.min(totalPages, 150);
  const pageTexts: IndexWorkerPageText[] = [];
  let nonEmptyChars = 0;

  for (let p = 1; p <= maxIndexPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const parts: string[] = [];
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') {
        parts.push(item.str);
      }
    }
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    nonEmptyChars += text.replace(/\s+/g, '').length;
    if (text) {
      pageTexts.push({ page: p, text });
    }
  }

  return {
    pageCount: totalPages,
    pageTexts,
    isScannedUnsearchable: totalPages > 0 && nonEmptyChars < 24,
  };
}

export async function extractDocumentTextInMemory(params: {
  extension: string;
  mimeType: string;
  buffer: ArrayBuffer;
}): Promise<{
  pageCount: number | null;
  pageTexts: IndexWorkerPageText[];
  isScannedUnsearchable: boolean;
}> {
  const ext = params.extension.toLowerCase();
  const mime = params.mimeType.toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') {
    return extractPdfText(params.buffer);
  }

  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    const mammothApi = mammoth as unknown as {
      extractRawText?: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
      convertToHtml: (opts: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
    };
    let rawText = '';
    if (typeof mammothApi.extractRawText === 'function') {
      const res = await mammothApi.extractRawText({ arrayBuffer: params.buffer });
      rawText = res.value || '';
    } else {
      const res = await mammothApi.convertToHtml({ arrayBuffer: params.buffer });
      rawText = (res.value || '').replace(/<[^>]+>/g, ' ');
    }
    const text = rawText.replace(/\s+/g, ' ').trim();
    return {
      pageCount: 1,
      pageTexts: text ? [{ page: 1, text }] : [],
      isScannedUnsearchable: false,
    };
  }

  if (
    ['xlsx', 'xls', 'csv'].includes(ext) ||
    mime.includes('spreadsheet') ||
    mime.includes('csv')
  ) {
    const wb = XLSX.read(params.buffer, { type: 'array' });
    const pageTexts: IndexWorkerPageText[] = [];
    wb.SheetNames.forEach((name, idx) => {
      const ws = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(ws);
      const cleaned = `${name} ${csv}`.replace(/[,\r\n\s]+/g, ' ').trim();
      if (cleaned) {
        pageTexts.push({ page: idx + 1, text: cleaned });
      }
    });
    return {
      pageCount: wb.SheetNames.length || 1,
      pageTexts,
      isScannedUnsearchable: false,
    };
  }

  if (
    mime.startsWith('text/') ||
    ['txt', 'md', 'json', 'csv', 'xml', 'html'].includes(ext)
  ) {
    const text = new TextDecoder('utf-8', { fatal: false })
      .decode(params.buffer)
      .replace(/\s+/g, ' ')
      .trim();
    return {
      pageCount: 1,
      pageTexts: text ? [{ page: 1, text: text.slice(0, 120_000) }] : [],
      isScannedUnsearchable: false,
    };
  }

  return {
    pageCount: null,
    pageTexts: [],
    isScannedUnsearchable: false,
  };
}

if (typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = async (event: MessageEvent<IndexWorkerRequest>) => {
    const req = event.data;
    try {
      const res = await extractDocumentTextInMemory({
        extension: req.extension,
        mimeType: req.mimeType,
        buffer: req.buffer,
      });
      const payload: IndexWorkerResponse = {
        requestId: req.requestId,
        fileId: req.fileId,
        pageCount: res.pageCount,
        pageTexts: res.pageTexts,
        isScannedUnsearchable: res.isScannedUnsearchable,
      };
      self.postMessage(payload);
    } catch (err) {
      const payload: IndexWorkerResponse = {
        requestId: req.requestId,
        fileId: req.fileId,
        pageCount: null,
        pageTexts: [],
        isScannedUnsearchable: false,
        error: err instanceof Error ? err.message : 'Worker extraction failed',
      };
      self.postMessage(payload);
    }
  };
}
