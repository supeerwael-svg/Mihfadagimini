import type { SeminarRecord } from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId } from './crypto';

export class SeminarsService {
  constructor(private adapter: IDataAdapter) {}

  async listByYear(academicYearId: string, kind?: 'internal' | 'external'): Promise<SeminarRecord[]> {
    const all = await this.adapter.queryByYear('seminars', academicYearId);
    return all
      .filter((s) => !kind || s.kind === kind)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async saveSeminar(
    ctx: ServiceContext,
    params: {
      id?: string;
      kind: 'internal' | 'external';
      title: string;
      date: string;
      time: string;
      location: string;
      content: string;
      notifyMinutesBefore: number;
      attachmentFileIds?: string[];
    }
  ): Promise<SeminarRecord> {
    const now = new Date().toISOString();
    const existing = params.id ? await this.adapter.getById('seminars', params.id) : undefined;
    const record: SeminarRecord = {
      id: existing?.id ?? generateId(),
      kind: params.kind,
      title: params.title.trim(),
      date: params.date,
      time: params.time,
      location: params.location.trim(),
      content: params.content.trim(),
      notifyMinutesBefore: params.notifyMinutesBefore,
      notified: false,
      attachmentFileIds: params.attachmentFileIds ?? existing?.attachmentFileIds ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: existing?.ownerId ?? ctx.ownerId,
      schoolId: existing?.schoolId ?? ctx.schoolId,
      academicYearId: existing?.academicYearId ?? ctx.academicYearId,
    };
    await this.adapter.put('seminars', record);
    return record;
  }

  async deleteSeminar(id: string): Promise<void> {
    await this.adapter.softDelete('seminars', id);
  }

  /**
   * Returns upcoming seminars within the next 48 hours or within their reminder window,
   * and triggers browser Notification API if granted.
   */
  async checkUpcomingNotifications(academicYearId: string): Promise<SeminarRecord[]> {
    const seminars = await this.listByYear(academicYearId);
    const now = Date.now();
    const upcomingAlerts: SeminarRecord[] = [];

    for (const s of seminars) {
      const eventMs = new Date(`${s.date}T${s.time || '09:00'}:00`).getTime();
      if (Number.isNaN(eventMs)) continue;
      const diffMinutes = (eventMs - now) / 60000;
      const windowMinutes = Math.max(s.notifyMinutesBefore, 24 * 60);
      if (diffMinutes >= -30 && diffMinutes <= windowMinutes) {
        upcomingAlerts.push(s);
        if (!s.notified && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            new Notification(s.title, {
              body: `${s.date} ${s.time} — ${s.location}`,
              icon: '/pwa-192x192.png',
            });
            await this.adapter.put('seminars', { ...s, notified: true });
          } catch {
            // Ignore notification errors in restricted environments
          }
        }
      }
    }
    return upcomingAlerts;
  }
}
