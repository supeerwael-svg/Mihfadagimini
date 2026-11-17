import type { Table } from 'dexie';
import { dexieDb } from '@/src/db/dexieDb';
import type { AppMetaRecord, BaseRecord } from '@/src/types/models';
import type { IDataAdapter, TableName, TableTypeMap } from '@/src/types/services';

/**
 * LocalAdapter: The sole bridge to Dexie IndexedDB.
 * Every UI component and business service interacts with IDataAdapter,
 * enabling a drop-in RemoteAdapter (Supabase/Firebase) later without rewriting UI.
 */
export class LocalAdapter implements IDataAdapter {
  public readonly mode = 'local' as const;

  private getTable<K extends TableName>(name: K): Table<TableTypeMap[K], string> {
    return dexieDb[name] as unknown as Table<TableTypeMap[K], string>;
  }

  async init(): Promise<void> {
    await dexieDb.open();
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        await navigator.storage.persist();
      } catch {
        // Ignore if browser denies persistent storage silently
      }
    }
  }

  async getAll<K extends TableName>(table: K, includeDeleted = false): Promise<TableTypeMap[K][]> {
    const rows = await this.getTable(table).toArray();
    if (includeDeleted) return rows;
    return rows.filter((r) => !(r as BaseRecord).deletedAt);
  }

  async getById<K extends TableName>(table: K, id: string): Promise<TableTypeMap[K] | undefined> {
    const row = await this.getTable(table).get(id);
    if (!row || (row as BaseRecord).deletedAt) return undefined;
    return row;
  }

  async queryByYear<K extends TableName>(
    table: K,
    academicYearId: string,
    includeDeleted = false
  ): Promise<TableTypeMap[K][]> {
    const rows = await this.getTable(table)
      .where('academicYearId')
      .equals(academicYearId)
      .toArray();
    if (includeDeleted) return rows;
    return rows.filter((r) => !(r as BaseRecord).deletedAt);
  }

  async put<K extends TableName>(table: K, record: TableTypeMap[K]): Promise<TableTypeMap[K]> {
    await this.getTable(table).put(record);
    return record;
  }

  async bulkPut<K extends TableName>(table: K, records: TableTypeMap[K][]): Promise<void> {
    if (records.length === 0) return;
    await this.getTable(table).bulkPut(records);
  }

  async softDelete<K extends TableName>(table: K, id: string): Promise<void> {
    const existing = await this.getTable(table).get(id);
    if (!existing) return;
    const now = new Date().toISOString();
    await this.getTable(table).put({
      ...existing,
      deletedAt: now,
      updatedAt: now,
      syncStatus: 'local',
    });
  }

  async hardDelete<K extends TableName>(table: K, id: string): Promise<void> {
    await this.getTable(table).delete(id);
  }

  async getMeta(key: string): Promise<string | null> {
    const rec = await dexieDb.appMeta.get(key);
    return rec ? rec.value : null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await dexieDb.appMeta.put({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  }

  async getAllMeta(): Promise<AppMetaRecord[]> {
    return dexieDb.appMeta.toArray();
  }

  async clearAll(): Promise<void> {
    const tables: TableName[] = [
      'users',
      'inviteCodes',
      'schools',
      'announcements',
      'academicYears',
      'sections',
      'files',
      'classRooms',
      'journalEntries',
      'seminars',
      'forumTopics',
      'forumComments',
      'chatRooms',
      'chatMessages',
      'themeConfigs',
    ];
    await dexieDb.transaction('rw', [...dexieDb.tables], async () => {
      for (const t of tables) {
        await this.getTable(t).clear();
      }
      await dexieDb.appMeta.clear();
    });
  }

  async exportRawSnapshot(): Promise<{
    meta: AppMetaRecord[];
    tables: { [K in TableName]: TableTypeMap[K][] };
  }> {
    const meta = await this.getAllMeta();
    const tables = {
      users: await this.getAll('users', true),
      inviteCodes: await this.getAll('inviteCodes', true),
      schools: await this.getAll('schools', true),
      announcements: await this.getAll('announcements', true),
      academicYears: await this.getAll('academicYears', true),
      sections: await this.getAll('sections', true),
      files: await this.getAll('files', true),
      classRooms: await this.getAll('classRooms', true),
      journalEntries: await this.getAll('journalEntries', true),
      seminars: await this.getAll('seminars', true),
      forumTopics: await this.getAll('forumTopics', true),
      forumComments: await this.getAll('forumComments', true),
      chatRooms: await this.getAll('chatRooms', true),
      chatMessages: await this.getAll('chatMessages', true),
      themeConfigs: await this.getAll('themeConfigs', true),
    };
    return { meta, tables };
  }

  async importRawSnapshot(snapshot: {
    meta: AppMetaRecord[];
    tables: Partial<{ [K in TableName]: TableTypeMap[K][] }>;
  }): Promise<void> {
    await dexieDb.transaction('rw', [...dexieDb.tables], async () => {
      for (const m of snapshot.meta || []) {
        await dexieDb.appMeta.put(m);
      }
      const keys = Object.keys(snapshot.tables || {}) as TableName[];
      for (const k of keys) {
        const list = snapshot.tables[k];
        if (list && list.length > 0) {
          await this.getTable(k).bulkPut(list);
        }
      }
    });
  }
}
