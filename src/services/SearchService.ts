import type {
  FileRecord,
  ForumTopicRecord,
  JournalEntryRecord,
  LanguageCode,
  SectionNode,
  SeminarRecord,
} from '@/src/types/models';
import type { IDataAdapter } from '@/src/types/services';
import { normalizeSearchText } from './crypto';

export interface GlobalSearchResults {
  sections: SectionNode[];
  files: FileRecord[];
  journal: JournalEntryRecord[];
  seminars: SeminarRecord[];
  forumTopics: ForumTopicRecord[];
}

export class SearchService {
  constructor(private adapter: IDataAdapter) {}

  async search(
    academicYearId: string,
    query: string,
    _lang: LanguageCode
  ): Promise<GlobalSearchResults> {
    const q = normalizeSearchText(query);
    if (!q) {
      return { sections: [], files: [], journal: [], seminars: [], forumTopics: [] };
    }

    const [sections, files, journal, seminars, forumTopics] = await Promise.all([
      this.adapter.queryByYear('sections', academicYearId),
      this.adapter.queryByYear('files', academicYearId),
      this.adapter.queryByYear('journalEntries', academicYearId),
      this.adapter.queryByYear('seminars', academicYearId),
      this.adapter.queryByYear('forumTopics', academicYearId),
    ]);

    return {
      sections: sections.filter(
        (s) =>
          !s.isHidden &&
          (normalizeSearchText(s.names.ar).includes(q) ||
            normalizeSearchText(s.names.en).includes(q) ||
            normalizeSearchText(s.names.fr).includes(q))
      ),
      files: files.filter(
        (f) =>
          normalizeSearchText(f.name).includes(q) ||
          f.tags.some((t) => normalizeSearchText(t).includes(q))
      ),
      journal: journal.filter(
        (j) =>
          normalizeSearchText(j.title).includes(q) ||
          normalizeSearchText(j.content).includes(q) ||
          normalizeSearchText(j.tag).includes(q)
      ),
      seminars: seminars.filter(
        (sem) =>
          normalizeSearchText(sem.title).includes(q) ||
          normalizeSearchText(sem.content).includes(q) ||
          normalizeSearchText(sem.location).includes(q)
      ),
      forumTopics: forumTopics.filter(
        (t) =>
          normalizeSearchText(t.title).includes(q) ||
          normalizeSearchText(t.body).includes(q) ||
          normalizeSearchText(t.category).includes(q)
      ),
    };
  }
}
