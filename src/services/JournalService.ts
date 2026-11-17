import type { JournalEntryRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class JournalService {
  constructor(private adapter: IDataAdapter) {}

  async listByYear(academicYearId: string): Promise<JournalEntryRecord[]> {
    const all = await this.adapter.queryByYear('journalEntries', academicYearId);
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }

  async listByDate(academicYearId: string, date: string): Promise<JournalEntryRecord[]> {
    const all = await this.listByYear(academicYearId);
    return all.filter((e) => e.date === date);
  }

  async saveEntry(
    ctx: ServiceContext,
    params: {
      id?: string;
      date: string;
      title: string;
      content: string;
      classes: string[];
      tag: string;
      attachmentFileIds?: string[];
    }
  ): Promise<JournalEntryRecord> {
    const now = new Date().toISOString();
    const existing = params.id ? await this.adapter.getById('journalEntries', params.id) : undefined;
    const record: JournalEntryRecord = {
      id: existing?.id ?? generateId(),
      date: params.date,
      title: params.title.trim(),
      content: params.content.trim(),
      classes: params.classes,
      tag: params.tag.trim(),
      attachmentFileIds: params.attachmentFileIds ?? existing?.attachmentFileIds ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: existing?.ownerId ?? ctx.ownerId,
      schoolId: existing?.schoolId ?? ctx.schoolId,
      academicYearId: existing?.academicYearId ?? ctx.academicYearId,
    };
    await this.adapter.put('journalEntries', record);
    return record;
  }

  async deleteEntry(id: string): Promise<void> {
    await this.adapter.softDelete('journalEntries', id);
  }
}
