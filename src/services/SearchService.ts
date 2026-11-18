import * as pdfjsLib from 'pdfjs-dist';
import type {
  FileRecord,
  FileSearchIndexRecord,
  FileTypeCategory,
  ForumTopicRecord,
  IndexedPageText,
  JournalEntryRecord,
  LanguageCode,
  LibrarySearchFilters,
  MiddleSchoolLevel,
  SavedSearchRecord,
  SectionNode,
  SeminarRecord,
  SubjectRecord,
  UserRecord,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import type {
  IndexWorkerRequest,
  IndexWorkerResponse,
} from '@/src/workers/libraryIndexWorker';
import { AuthService } from './AuthService';
import { extractSnippet, fuzzyTokenMatch, generateId, normalizeSearchText } from './crypto';
import { detectFileCategory, getFileStatus, getFileTitle } from './FilesService';

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
} catch {
  // Handled gracefully
}

export type MatchSource =
  | 'title'
  | 'filename'
  | 'tags'
  | 'description'
  | 'author'
  | 'section'
  | 'content';

export interface SearchFileHit {
  file: FileRecord;
  score: number;
  matchSources: MatchSource[];
  contentMatch?: {
    page: number;
    snippet: string;
  };
  isScannedUnsearchable: boolean;
  ocrCompleted: boolean;
}

export interface SearchFacets {
  totalBeforeFilters: number;
  bySection: Record<string, number>;
  byLevel: Record<string, number>;
  bySubject: Record<string, number>;
  byTerm: Record<string, number>;
  byYear: Record<string, number>;
  byCategory: Record<string, number>;
  byTag: Record<string, number>;
  byStatus: { active: number; archived: number };
  bySizeRange: { small: number; medium: number; large: number };
  favoritesCount: number;
  hasQrCount: number;
}

export interface LibrarySearchResponse {
  hits: SearchFileHit[];
  facets: SearchFacets;
  sections: SectionNode[];
  journal: JournalEntryRecord[];
  seminars: SeminarRecord[];
  forumTopics: ForumTopicRecord[];
  parsedOperators: ParsedQueryOperators;
}

export interface GlobalSearchResults {
  sections: SectionNode[];
  files: FileRecord[];
  fileHits?: SearchFileHit[];
  journal: JournalEntryRecord[];
  seminars: SeminarRecord[];
  forumTopics: ForumTopicRecord[];
}

export interface IndexStatusInfo {
  totalIndexableFiles: number;
  indexedFiles: number;
  scannedUnsearchableCount: number;
  lastIndexedAt: string | null;
  isIndexing: boolean;
}

export interface ParsedQueryOperators {
  phrases: string[];
  positiveTerms: string[];
  excludedTerms: string[];
  level?: MiddleSchoolLevel;
  subjectQuery?: string;
  type?: FileTypeCategory;
  tag?: string;
  term?: 1 | 2 | 3;
  yearQuery?: string;
}

function mapLevelOperator(raw: string): MiddleSchoolLevel | undefined {
  const norm = raw.toLowerCase().trim();
  if (norm === '1am' || norm === '1m' || norm === '1') return '1M';
  if (norm === '2am' || norm === '2m' || norm === '2') return '2M';
  if (norm === '3am' || norm === '3m' || norm === '3') return '3M';
  if (norm === '4am' || norm === '4m' || norm === '4') return '4M';
  return undefined;
}

function mapTypeOperator(raw: string): FileTypeCategory | undefined {
  const norm = raw.toLowerCase().trim();
  if (norm === 'pdf') return 'pdf';
  if (['word', 'doc', 'docx'].includes(norm)) return 'word';
  if (['excel', 'xls', 'xlsx', 'csv'].includes(norm)) return 'excel';
  if (['ppt', 'pptx', 'slides'].includes(norm)) return 'ppt';
  if (['image', 'img', 'png', 'jpg', 'jpeg', 'map'].includes(norm)) return 'image';
  if (['audio', 'mp3'].includes(norm)) return 'audio';
  if (['video', 'mp4', 'url'].includes(norm)) return 'video';
  return undefined;
}

export function parseSearchQueryOperators(rawQuery: string): ParsedQueryOperators {
  const out: ParsedQueryOperators = {
    phrases: [],
    positiveTerms: [],
    excludedTerms: [],
  };
  if (!rawQuery.trim()) return out;

  let working = rawQuery;

  // 1. Extract quoted phrases (including negative -"...")
  working = working.replace(/(-?)"([^"]+)"/g, (_full, neg: string, phrase: string) => {
    const clean = normalizeSearchText(phrase);
    if (clean) {
      if (neg === '-') out.excludedTerms.push(clean);
      else out.phrases.push(clean);
    }
    return ' ';
  });

  // 2. Parse remaining whitespace-delimited tokens
  const tokens = working.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    if (tok.startsWith('-') && tok.length > 1) {
      const excl = normalizeSearchText(tok.slice(1));
      if (excl) out.excludedTerms.push(excl);
      continue;
    }

    const colonIdx = tok.indexOf(':');
    if (colonIdx > 0 && colonIdx < tok.length - 1) {
      const key = tok.slice(0, colonIdx).toLowerCase();
      const val = tok.slice(colonIdx + 1);
      if (key === 'level' || key === 'lvl' || key === 'المستوى') {
        const lvl = mapLevelOperator(val);
        if (lvl) {
          out.level = lvl;
          continue;
        }
      }
      if (key === 'type' || key === 'ext' || key === 'النوع') {
        const cat = mapTypeOperator(val);
        if (cat) {
          out.type = cat;
          continue;
        }
      }
      if (key === 'subject' || key === 'subj' || key === 'المادة') {
        out.subjectQuery = normalizeSearchText(val);
        continue;
      }
      if (key === 'tag' || key === 'وسم') {
        out.tag = normalizeSearchText(val);
        continue;
      }
      if (key === 'term' || key === 'فصل') {
        const num = Number(val);
        if (num === 1 || num === 2 || num === 3) {
          out.term = num;
          continue;
        }
      }
      if (key === 'year' || key === 'سنة') {
        out.yearQuery = normalizeSearchText(val);
        continue;
      }
    }

    const norm = normalizeSearchText(tok);
    if (norm) out.positiveTerms.push(norm);
  }

  return out;
}

const INDEX_META_LAST = 'search_last_indexed_at';
const SEARCH_HISTORY_PREFIX = 'library_search_history_';

export class SearchService {
  private worker: Worker | null = null;
  private workerFailed = false;
  private pendingWorkerRequests = new Map<
    string,
    { resolve: (res: IndexWorkerResponse) => void; reject: (err: Error) => void }
  >();
  private indexQueue: FileRecord[] = [];
  private isIndexing = false;

  constructor(
    private adapter: IDataAdapter,
    private authService?: AuthService
  ) {}

  private getWorker(): Worker | null {
    if (this.workerFailed || typeof Worker === 'undefined') return null;
    if (this.worker) return this.worker;
    try {
      const w = new Worker(new URL('../workers/libraryIndexWorker.ts', import.meta.url), {
        type: 'module',
      });
      w.onmessage = (ev: MessageEvent<IndexWorkerResponse>) => {
        const data = ev.data;
        const pending = this.pendingWorkerRequests.get(data.requestId);
        if (pending) {
          this.pendingWorkerRequests.delete(data.requestId);
          pending.resolve(data);
        }
      };
      w.onerror = () => {
        this.workerFailed = true;
        this.worker?.terminate();
        this.worker = null;
        for (const p of this.pendingWorkerRequests.values()) {
          p.reject(new Error('Index worker terminated'));
        }
        this.pendingWorkerRequests.clear();
      };
      this.worker = w;
      return w;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  private async extractInWorkerOrFallback(file: FileRecord): Promise<{
    pageCount: number | null;
    pageTexts: Array<{ page: number; text: string }>;
    isScannedUnsearchable: boolean;
  }> {
    if (!file.blob) {
      return { pageCount: null, pageTexts: [], isScannedUnsearchable: false };
    }
    const ext = (file.extension || '').toLowerCase();
    const mime = (file.mimeType || '').toLowerCase();
    const isTextExtractable =
      ext === 'pdf' ||
      mime === 'application/pdf' ||
      ext === 'docx' ||
      mime.includes('wordprocessingml') ||
      ['xlsx', 'xls', 'csv'].includes(ext) ||
      mime.includes('spreadsheet') ||
      mime.includes('csv') ||
      mime.startsWith('text/') ||
      ['txt', 'md', 'json'].includes(ext);

    if (!isTextExtractable) {
      return { pageCount: file.pageCount ?? null, pageTexts: [], isScannedUnsearchable: false };
    }

    const buf = await file.blob.arrayBuffer();
    const w = this.getWorker();
    if (w) {
      try {
        const reqId = generateId();
        const response = await new Promise<IndexWorkerResponse>((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pendingWorkerRequests.delete(reqId);
            reject(new Error('Worker extraction timeout'));
          }, 25000);
          this.pendingWorkerRequests.set(reqId, {
            resolve: (res) => {
              clearTimeout(timer);
              resolve(res);
            },
            reject: (err) => {
              clearTimeout(timer);
              reject(err);
            },
          });
          const req: IndexWorkerRequest = {
            requestId: reqId,
            fileId: file.id,
            extension: ext,
            mimeType: mime,
            buffer: buf,
          };
          w.postMessage(req, [buf]);
        });
        if (!response.error) {
          return {
            pageCount: response.pageCount,
            pageTexts: response.pageTexts,
            isScannedUnsearchable: response.isScannedUnsearchable,
          };
        }
      } catch {
        // Fallback smoothly below
      }
    }

    // Fallback when Worker is unavailable in headless/restricted environment
    try {
      const freshBuf = await file.blob.arrayBuffer();
      const { extractDocumentTextInMemory } = await import('@/src/workers/libraryIndexWorker');
      return await extractDocumentTextInMemory({
        extension: ext,
        mimeType: mime,
        buffer: freshBuf,
      });
    } catch {
      return { pageCount: file.pageCount ?? null, pageTexts: [], isScannedUnsearchable: false };
    }
  }

  async indexSingleFile(file: FileRecord): Promise<FileSearchIndexRecord | null> {
    if (getFileStatus(file) === 'trashed') return null;
    const extracted = await this.extractInWorkerOrFallback(file);
    const now = new Date().toISOString();

    const pageTexts: IndexedPageText[] = extracted.pageTexts.map((p) => ({
      page: p.page,
      text: p.text,
      norm: normalizeSearchText(p.text),
    }));
    const textNormalized = pageTexts.map((p) => p.norm).join(' ').trim();

    const record: FileSearchIndexRecord = {
      id: file.id,
      fileId: file.id,
      textNormalized,
      pageTexts,
      isScannedUnsearchable: extracted.isScannedUnsearchable,
      ocrCompleted: false,
      indexedAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: file.ownerId,
      schoolId: file.schoolId,
      academicYearId: file.academicYearId,
    };
    await this.adapter.put('searchIndex', record);
    if (extracted.pageCount !== null && file.pageCount !== extracted.pageCount) {
      await this.adapter.put('files', { ...file, pageCount: extracted.pageCount });
    }
    await this.adapter.setMeta(INDEX_META_LAST, now);
    return record;
  }

  enqueueBackgroundIndex(file: FileRecord): void {
    if (!file.blob || getFileStatus(file) === 'trashed') return;
    if (!this.indexQueue.some((f) => f.id === file.id)) {
      this.indexQueue.push(file);
    }
    if (!this.isIndexing) {
      this.processQueueLoop().catch(() => {
        this.isIndexing = false;
      });
    }
  }

  private async processQueueLoop(): Promise<void> {
    if (this.isIndexing) return;
    this.isIndexing = true;
    try {
      while (this.indexQueue.length > 0) {
        const next = this.indexQueue.shift();
        if (!next) continue;
        await this.indexSingleFile(next);
        await new Promise((r) => setTimeout(r, 15));
      }
    } finally {
      this.isIndexing = false;
    }
  }

  async ensureYearBackgroundIndexed(academicYearId: string): Promise<void> {
    const [files, indexed] = await Promise.all([
      this.adapter.queryByYear('files', academicYearId),
      this.adapter.queryByYear('searchIndex', academicYearId),
    ]);
    const indexedIds = new Set(indexed.map((i) => i.fileId));
    for (const f of files) {
      if (getFileStatus(f) === 'active' && f.blob && !indexedIds.has(f.id)) {
        this.enqueueBackgroundIndex(f);
      }
    }
  }

  async rebuildIndex(
    academicYearId: string,
    onProgress?: (done: number, total: number, currentName: string) => void
  ): Promise<IndexStatusInfo> {
    const files = (await this.adapter.queryByYear('files', academicYearId)).filter(
      (f) => getFileStatus(f) !== 'trashed' && Boolean(f.blob)
    );
    this.isIndexing = true;
    try {
      for (let i = 0; i < files.length; i++) {
        onProgress?.(i, files.length, getFileTitle(files[i]));
        await this.indexSingleFile(files[i]);
      }
      onProgress?.(files.length, files.length, '');
    } finally {
      this.isIndexing = false;
    }
    return this.getIndexStatus(academicYearId);
  }

  async getIndexStatus(academicYearId: string): Promise<IndexStatusInfo> {
    const [files, indexed, lastIndexedAt] = await Promise.all([
      this.adapter.queryByYear('files', academicYearId),
      this.adapter.queryByYear('searchIndex', academicYearId),
      this.adapter.getMeta(INDEX_META_LAST),
    ]);
    const validFiles = files.filter((f) => getFileStatus(f) !== 'trashed' && Boolean(f.blob));
    const scannedCount = indexed.filter((i) => i.isScannedUnsearchable && !i.ocrCompleted).length;
    return {
      totalIndexableFiles: validFiles.length,
      indexedFiles: indexed.length,
      scannedUnsearchableCount: scannedCount,
      lastIndexedAt,
      isIndexing: this.isIndexing,
    };
  }

  /**
   * On-demand OCR (Arabic + French via tesseract.js), strictly triggered only by explicit user request.
   */
  async runOcrForFile(
    fileId: string,
    onProgress?: (percent: number, stageText: string) => void
  ): Promise<{ pageTexts: IndexedPageText[]; error?: string }> {
    const file = await this.adapter.getById('files', fileId);
    if (!file || !file.blob) {
      return { pageTexts: [], error: 'File content missing' };
    }
    const ext = (file.extension || '').toLowerCase();
    const isPdf = ext === 'pdf' || file.mimeType === 'application/pdf';
    const isImage = file.mimeType.startsWith('image/');
    if (!isPdf && !isImage) {
      return { pageTexts: [], error: 'OCR supports scanned PDFs and images only' };
    }

    onProgress?.(5, 'Initializing OCR engine (AR + FR)...');
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('ara+fra');

    try {
      const pageTexts: IndexedPageText[] = [];
      if (isPdf) {
        const buf = await file.blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
        const maxPages = Math.min(doc.numPages || 1, 15);
        for (let p = 1; p <= maxPages; p++) {
          onProgress?.(
            Math.round(((p - 1) / maxPages) * 90) + 5,
            `OCR ${p} / ${maxPages}`
          );
          const page = await doc.getPage(p);
          const viewport = page.getViewport({ scale: 1.75 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(viewport.width));
          canvas.height = Math.max(1, Math.round(viewport.height));
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const result = await worker.recognize(canvas);
          const rawText = (result.data.text || '').replace(/\s+/g, ' ').trim();
          if (rawText) {
            pageTexts.push({ page: p, text: rawText, norm: normalizeSearchText(rawText) });
          }
        }
      } else {
        onProgress?.(35, 'OCR image...');
        const imgUrl = URL.createObjectURL(file.blob);
        try {
          const result = await worker.recognize(imgUrl);
          const rawText = (result.data.text || '').replace(/\s+/g, ' ').trim();
          if (rawText) {
            pageTexts.push({ page: 1, text: rawText, norm: normalizeSearchText(rawText) });
          }
        } finally {
          URL.revokeObjectURL(imgUrl);
        }
      }

      const now = new Date().toISOString();
      const indexRec: FileSearchIndexRecord = {
        id: file.id,
        fileId: file.id,
        textNormalized: pageTexts.map((p) => p.norm).join(' ').trim(),
        pageTexts,
        isScannedUnsearchable: pageTexts.length === 0,
        ocrCompleted: pageTexts.length > 0,
        indexedAt: now,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: file.ownerId,
        schoolId: file.schoolId,
        academicYearId: file.academicYearId,
      };
      await this.adapter.put('searchIndex', indexRec);
      await this.adapter.setMeta(INDEX_META_LAST, now);
      onProgress?.(100, '');
      return { pageTexts };
    } catch (err) {
      return {
        pageTexts: [],
        error: err instanceof Error ? err.message : 'OCR failed (requires cached or online language data)',
      };
    } finally {
      await worker.terminate();
    }
  }

  // ==================== FULL LIBRARY SEARCH WITH FACETS ====================

  async searchLibrary(params: {
    user?: UserRecord | null;
    academicYearId: string | 'all';
    query: string;
    filters?: LibrarySearchFilters;
    lang: LanguageCode;
  }): Promise<LibrarySearchResponse> {
    const ops = parseSearchQueryOperators(params.query);
    const filters: LibrarySearchFilters = params.filters ?? {};
    const statusMode = filters.status ?? 'active';
    const includeArchived =
      statusMode === 'archived' || statusMode === 'all_with_archived' || params.academicYearId === 'all';

    const [allYears, rawSections, rawFiles, rawSubjects, rawIndexes, journal, seminars, forumTopics] =
      await Promise.all([
        this.adapter.getAll('academicYears'),
        params.academicYearId === 'all'
          ? this.adapter.getAll('sections')
          : this.adapter.queryByYear('sections', params.academicYearId),
        params.academicYearId === 'all'
          ? this.adapter.getAll('files')
          : this.adapter.queryByYear('files', params.academicYearId),
        params.academicYearId === 'all'
          ? this.adapter.getAll('subjects')
          : this.adapter.queryByYear('subjects', params.academicYearId),
        params.academicYearId === 'all'
          ? this.adapter.getAll('searchIndex')
          : this.adapter.queryByYear('searchIndex', params.academicYearId),
        params.academicYearId === 'all'
          ? this.adapter.getAll('journalEntries')
          : this.adapter.queryByYear('journalEntries', params.academicYearId),
        params.academicYearId === 'all'
          ? this.adapter.getAll('seminars')
          : this.adapter.queryByYear('seminars', params.academicYearId),
        params.academicYearId === 'all'
          ? this.adapter.getAll('forumTopics')
          : this.adapter.queryByYear('forumTopics', params.academicYearId),
      ]);

    const yearMap = new Map(allYears.map((y) => [y.id, y]));
    const sectionMap = new Map(rawSections.map((s) => [s.id, s]));
    const indexMap = new Map(rawIndexes.map((idx) => [idx.fileId, idx]));
    const inactiveSubjectIds = new Set(
      rawSubjects.filter((sub) => !sub.isActive).map((sub) => sub.id)
    );
    const hiddenSectionIds = new Set(
      rawSections
        .filter((s) => s.isHidden || (s.subjectId && inactiveSubjectIds.has(s.subjectId)))
        .map((s) => s.id)
    );
    const subjectById = new Map<string, SubjectRecord>(rawSubjects.map((s) => [s.id, s]));

    // 1. Evaluate query match + permission & active/archive rules BEFORE applying sidebar facets (so facets show accurate counts)
    const queryHits: SearchFileHit[] = [];
    const hasTextQuery =
      ops.phrases.length > 0 || ops.positiveTerms.length > 0 || ops.excludedTerms.length > 0;

    for (const f of rawFiles) {
      const st = getFileStatus(f);
      if (st === 'trashed') continue;

      const fileYear = yearMap.get(f.academicYearId);
      const isYearArchived = Boolean(fileYear?.isArchived);
      const effectiveStatus: 'active' | 'archived' =
        st === 'archived' || isYearArchived ? 'archived' : 'active';

      if (statusMode === 'active' && effectiveStatus !== 'active') continue;
      if (statusMode === 'archived' && effectiveStatus !== 'archived') continue;
      if (!includeArchived && hiddenSectionIds.has(f.sectionId)) continue;

      if (params.user && this.authService) {
        const perm = this.authService.getEffectivePermission(params.user, f.sectionId);
        if (!perm.view) continue;
      }

      // Check inline query operators (level:, subject:, type:, tag:, term:, year:)
      const cat = f.fileCategory || detectFileCategory(f.mimeType, f.extension, f.externalUrl);
      if (ops.level && f.levelCode !== ops.level) continue;
      if (ops.type && cat !== ops.type) continue;
      if (ops.term && f.termNumber !== ops.term) continue;
      if (ops.yearQuery) {
        const yLabel = normalizeSearchText(fileYear?.label || '');
        if (!yLabel.includes(ops.yearQuery)) continue;
      }
      if (ops.tag && !f.tags.some((tg) => normalizeSearchText(tg).includes(ops.tag!))) continue;
      if (ops.subjectQuery) {
        const sub = f.subjectId ? subjectById.get(f.subjectId) : undefined;
        const subNames = sub
          ? normalizeSearchText(`${sub.id} ${sub.names.ar} ${sub.names.en} ${sub.names.fr}`)
          : normalizeSearchText(f.subjectId || '');
        if (!subNames.includes(ops.subjectQuery)) continue;
      }

      const idxRec = indexMap.get(f.id);
      const isScannedUnsearchable = Boolean(idxRec?.isScannedUnsearchable && !idxRec?.ocrCompleted);
      const ocrCompleted = Boolean(idxRec?.ocrCompleted);

      const secNode = sectionMap.get(f.sectionId);
      const titleNorm = normalizeSearchText(getFileTitle(f));
      const fileNameNorm = normalizeSearchText(f.originalFileName || f.name);
      const tagsNorm = normalizeSearchText(f.tags.join(' '));
      const descNorm = normalizeSearchText(f.description || '');
      const authorNorm = normalizeSearchText(f.authorSource || '');
      const secNorm = secNode
        ? normalizeSearchText(`${secNode.names.ar} ${secNode.names.en} ${secNode.names.fr}`)
        : '';
      const contentNorm = idxRec?.textNormalized || '';
      const fullNorm = `${titleNorm} ${fileNameNorm} ${tagsNorm} ${descNorm} ${authorNorm} ${secNorm} ${contentNorm}`;

      // Excluded terms filter
      let excluded = false;
      for (const ex of ops.excludedTerms) {
        if (fullNorm.includes(ex)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      if (!hasTextQuery) {
        queryHits.push({
          file: f,
          score: 1,
          matchSources: [],
          isScannedUnsearchable,
          ocrCompleted,
        });
        continue;
      }

      // Check quoted phrases + positive terms across all sources
      let allMatched = true;
      const sources = new Set<MatchSource>();
      let score = 0;

      for (const phrase of ops.phrases) {
        if (!fullNorm.includes(phrase)) {
          allMatched = false;
          break;
        }
        if (titleNorm.includes(phrase)) {
          sources.add('title');
          score += 12;
        }
        if (fileNameNorm.includes(phrase)) {
          sources.add('filename');
          score += 8;
        }
        if (tagsNorm.includes(phrase)) {
          sources.add('tags');
          score += 7;
        }
        if (descNorm.includes(phrase)) {
          sources.add('description');
          score += 6;
        }
        if (authorNorm.includes(phrase)) {
          sources.add('author');
          score += 5;
        }
        if (secNorm.includes(phrase)) {
          sources.add('section');
          score += 4;
        }
        if (contentNorm.includes(phrase)) {
          sources.add('content');
          score += 5;
        }
      }
      if (!allMatched) continue;

      for (const tok of ops.positiveTerms) {
        let tokHit = false;
        if (fuzzyTokenMatch(titleNorm, tok)) {
          sources.add('title');
          score += titleNorm.includes(tok) ? 10 : 6;
          tokHit = true;
        }
        if (fuzzyTokenMatch(fileNameNorm, tok)) {
          sources.add('filename');
          score += 7;
          tokHit = true;
        }
        if (fuzzyTokenMatch(tagsNorm, tok)) {
          sources.add('tags');
          score += 6;
          tokHit = true;
        }
        if (fuzzyTokenMatch(descNorm, tok)) {
          sources.add('description');
          score += 5;
          tokHit = true;
        }
        if (fuzzyTokenMatch(authorNorm, tok)) {
          sources.add('author');
          score += 4;
          tokHit = true;
        }
        if (fuzzyTokenMatch(secNorm, tok)) {
          sources.add('section');
          score += 4;
          tokHit = true;
        }
        if (fuzzyTokenMatch(contentNorm, tok)) {
          sources.add('content');
          score += 3;
          tokHit = true;
        }
        if (!tokHit) {
          allMatched = false;
          break;
        }
      }
      if (!allMatched) continue;

      // Find best page & snippet for content match
      let contentMatch: { page: number; snippet: string } | undefined;
      if (sources.has('content') && idxRec?.pageTexts.length) {
        const searchAnchor = ops.phrases[0] || ops.positiveTerms[0] || '';
        for (const p of idxRec.pageTexts) {
          if (searchAnchor && (p.norm.includes(searchAnchor) || fuzzyTokenMatch(p.norm, searchAnchor))) {
            contentMatch = {
              page: p.page,
              snippet: extractSnippet(p.text, searchAnchor),
            };
            break;
          }
        }
      }

      queryHits.push({
        file: f,
        score,
        matchSources: Array.from(sources),
        contentMatch,
        isScannedUnsearchable,
        ocrCompleted,
      });
    }

    // 2. Build live facets from queryHits
    const facets: SearchFacets = {
      totalBeforeFilters: queryHits.length,
      bySection: {},
      byLevel: {},
      bySubject: {},
      byTerm: {},
      byYear: {},
      byCategory: {},
      byTag: {},
      byStatus: { active: 0, archived: 0 },
      bySizeRange: { small: 0, medium: 0, large: 0 },
      favoritesCount: 0,
      hasQrCount: 0,
    };

    for (const hit of queryHits) {
      const f = hit.file;
      const cat = f.fileCategory || detectFileCategory(f.mimeType, f.extension, f.externalUrl);
      const yr = yearMap.get(f.academicYearId);
      const effStatus =
        getFileStatus(f) === 'archived' || yr?.isArchived ? 'archived' : 'active';

      facets.bySection[f.sectionId] = (facets.bySection[f.sectionId] ?? 0) + 1;
      if (f.levelCode) facets.byLevel[f.levelCode] = (facets.byLevel[f.levelCode] ?? 0) + 1;
      if (f.subjectId) facets.bySubject[f.subjectId] = (facets.bySubject[f.subjectId] ?? 0) + 1;
      if (f.termNumber) facets.byTerm[String(f.termNumber)] = (facets.byTerm[String(f.termNumber)] ?? 0) + 1;
      facets.byYear[f.academicYearId] = (facets.byYear[f.academicYearId] ?? 0) + 1;
      facets.byCategory[cat] = (facets.byCategory[cat] ?? 0) + 1;
      for (const tg of f.tags) {
        facets.byTag[tg] = (facets.byTag[tg] ?? 0) + 1;
      }
      facets.byStatus[effStatus]++;
      if (f.size < 500 * 1024) facets.bySizeRange.small++;
      else if (f.size <= 5 * 1024 * 1024) facets.bySizeRange.medium++;
      else facets.bySizeRange.large++;
      if (f.isFavorite) facets.favoritesCount++;
      if (f.hasQrMap || f.qrPayload) facets.hasQrCount++;
    }

    // 3. Apply explicit UI facet filters
    const now = Date.now();
    const filteredHits = queryHits.filter((hit) => {
      const f = hit.file;
      const cat = f.fileCategory || detectFileCategory(f.mimeType, f.extension, f.externalUrl);
      if (filters.sectionId && f.sectionId !== filters.sectionId) return false;
      if (filters.levelCode && filters.levelCode !== 'all' && f.levelCode !== filters.levelCode)
        return false;
      if (filters.subjectId && filters.subjectId !== 'all' && f.subjectId !== filters.subjectId)
        return false;
      if (filters.termNumber && filters.termNumber !== 'all' && f.termNumber !== filters.termNumber)
        return false;
      if (filters.yearId && filters.yearId !== 'all' && f.academicYearId !== filters.yearId)
        return false;
      if (filters.fileCategory && filters.fileCategory !== 'all' && cat !== filters.fileCategory)
        return false;
      if (filters.tag && filters.tag !== 'all' && !f.tags.includes(filters.tag)) return false;
      if (filters.favoritesOnly && !f.isFavorite) return false;
      if (filters.hasQrOnly && !f.hasQrMap && !f.qrPayload) return false;
      if (filters.sizeRange && filters.sizeRange !== 'all') {
        if (filters.sizeRange === 'small' && f.size >= 500 * 1024) return false;
        if (filters.sizeRange === 'medium' && (f.size < 500 * 1024 || f.size > 5 * 1024 * 1024))
          return false;
        if (filters.sizeRange === 'large' && f.size <= 5 * 1024 * 1024) return false;
      }
      if (filters.dateRange && filters.dateRange !== 'all') {
        const ageMs = now - Date.parse(f.createdAt);
        if (filters.dateRange === 'week' && ageMs > 7 * 86400000) return false;
        if (filters.dateRange === 'month' && ageMs > 30 * 86400000) return false;
        if (filters.dateRange === '6months' && ageMs > 180 * 86400000) return false;
      }
      return true;
    });

    if (hasTextQuery) {
      filteredHits.sort((a, b) => b.score - a.score || b.file.createdAt.localeCompare(a.file.createdAt));
    }

    const flatQ = normalizeSearchText([...ops.phrases, ...ops.positiveTerms].join(' '));
    const matchingSubjectIds = new Set(
      rawSubjects
        .filter(
          (sub) =>
            sub.isActive &&
            flatQ &&
            (normalizeSearchText(sub.names.ar).includes(flatQ) ||
              normalizeSearchText(sub.names.en).includes(flatQ) ||
              normalizeSearchText(sub.names.fr).includes(flatQ))
        )
        .map((sub) => sub.id)
    );

    const matchedSections = flatQ
      ? rawSections.filter((s) => {
          if (hiddenSectionIds.has(s.id)) return false;
          if (params.user && this.authService) {
            if (!this.authService.getEffectivePermission(params.user, s.id).view) return false;
          }
          return (
            normalizeSearchText(s.names.ar).includes(flatQ) ||
            normalizeSearchText(s.names.en).includes(flatQ) ||
            normalizeSearchText(s.names.fr).includes(flatQ) ||
            (s.subjectId ? matchingSubjectIds.has(s.subjectId) : false)
          );
        })
      : [];

    return {
      hits: filteredHits,
      facets,
      sections: matchedSections,
      journal: flatQ
        ? journal.filter(
            (j) =>
              normalizeSearchText(j.title).includes(flatQ) ||
              normalizeSearchText(j.content).includes(flatQ) ||
              normalizeSearchText(j.tag).includes(flatQ)
          )
        : [],
      seminars: flatQ
        ? seminars.filter(
            (sem) =>
              normalizeSearchText(sem.title).includes(flatQ) ||
              normalizeSearchText(sem.content).includes(flatQ) ||
              normalizeSearchText(sem.location).includes(flatQ)
          )
        : [],
      forumTopics: flatQ
        ? forumTopics.filter(
            (t) =>
              normalizeSearchText(t.title).includes(flatQ) ||
              normalizeSearchText(t.body).includes(flatQ) ||
              normalizeSearchText(t.category).includes(flatQ)
          )
        : [],
      parsedOperators: ops,
    };
  }

  /**
   * Backward-compatible global search helper used by GlobalSearchModal.
   */
  async search(
    academicYearId: string,
    query: string,
    lang: LanguageCode,
    user?: UserRecord | null,
    includeArchived = false
  ): Promise<GlobalSearchResults> {
    if (!query.trim()) {
      return { sections: [], files: [], fileHits: [], journal: [], seminars: [], forumTopics: [] };
    }
    const res = await this.searchLibrary({
      user,
      academicYearId: includeArchived ? 'all' : academicYearId,
      query,
      filters: { status: includeArchived ? 'all_with_archived' : 'active' },
      lang,
    });
    return {
      sections: res.sections,
      files: res.hits.map((h) => h.file),
      fileHits: res.hits,
      journal: res.journal,
      seminars: res.seminars,
      forumTopics: res.forumTopics,
    };
  }

  // ==================== SAVED SEARCHES & HISTORY ====================

  async listSavedSearches(academicYearId: string): Promise<SavedSearchRecord[]> {
    const list = await this.adapter.queryByYear('savedSearches', academicYearId);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveSearch(
    ctx: ServiceContext,
    params: {
      title: string;
      query: string;
      filters: LibrarySearchFilters;
      pinnedToHome?: boolean;
    }
  ): Promise<SavedSearchRecord> {
    const now = new Date().toISOString();
    const rec: SavedSearchRecord = {
      id: generateId(),
      title: params.title.trim() || params.query.trim(),
      query: params.query.trim(),
      filters: params.filters,
      pinnedToHome: Boolean(params.pinnedToHome),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('savedSearches', rec);
    return rec;
  }

  async togglePinSavedSearch(id: string): Promise<void> {
    const existing = await this.adapter.getById('savedSearches', id);
    if (!existing) return;
    await this.adapter.put('savedSearches', {
      ...existing,
      pinnedToHome: !existing.pinnedToHome,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteSavedSearch(id: string): Promise<void> {
    await this.adapter.softDelete('savedSearches', id);
  }

  async getSearchHistory(userId: string): Promise<string[]> {
    const raw = await this.adapter.getMeta(`${SEARCH_HISTORY_PREFIX}${userId}`);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async recordSearchHistory(userId: string, query: string): Promise<string[]> {
    const clean = query.trim();
    if (!clean) return this.getSearchHistory(userId);
    const current = await this.getSearchHistory(userId);
    const next = [clean, ...current.filter((item) => item !== clean)].slice(0, 12);
    await this.adapter.setMeta(`${SEARCH_HISTORY_PREFIX}${userId}`, JSON.stringify(next));
    return next;
  }

  async clearSearchHistory(userId: string): Promise<void> {
    await this.adapter.setMeta(`${SEARCH_HISTORY_PREFIX}${userId}`, JSON.stringify([]));
  }
}
