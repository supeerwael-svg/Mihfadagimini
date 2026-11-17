import type { AnnouncementRecord, SchoolRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class SchoolService {
  constructor(private adapter: IDataAdapter) {}

  async getActiveSchool(): Promise<SchoolRecord | null> {
    const schools = await this.adapter.getAll('schools');
    return schools[0] ?? null;
  }

  async updateSchool(
    schoolId: string,
    patch: Partial<Pick<SchoolRecord, 'name' | 'wilaya' | 'directorate' | 'motto'>>
  ): Promise<SchoolRecord | null> {
    const existing = await this.adapter.getById('schools', schoolId);
    if (!existing) return null;
    const updated: SchoolRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put('schools', updated);
    return updated;
  }

  async listAnnouncements(schoolId: string): Promise<AnnouncementRecord[]> {
    const all = await this.adapter.getAll('announcements');
    return all
      .filter((a) => a.schoolId === schoolId)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  async createAnnouncement(
    ctx: ServiceContext,
    params: {
      title: string;
      body: string;
      category: AnnouncementRecord['category'];
      pinned: boolean;
      authorName: string;
    }
  ): Promise<AnnouncementRecord> {
    const now = new Date().toISOString();
    const record: AnnouncementRecord = {
      id: generateId(),
      ...params,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('announcements', record);
    return record;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await this.adapter.softDelete('announcements', id);
  }
}
