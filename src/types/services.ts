import type {
  AcademicYearRecord,
  AnnouncementRecord,
  AppMetaRecord,
  BaseRecord,
  ChatMessageRecord,
  ChatRoomRecord,
  ClassRoomRecord,
  FileRecord,
  ForumCommentRecord,
  ForumTopicRecord,
  InviteCodeRecord,
  JournalEntryRecord,
  SchoolRecord,
  SectionNode,
  SeminarRecord,
  ThemeConfigRecord,
  UserRecord,
} from './models';

export type TableName =
  | 'users'
  | 'inviteCodes'
  | 'schools'
  | 'announcements'
  | 'academicYears'
  | 'sections'
  | 'files'
  | 'classRooms'
  | 'journalEntries'
  | 'seminars'
  | 'forumTopics'
  | 'forumComments'
  | 'chatRooms'
  | 'chatMessages'
  | 'themeConfigs';

export interface TableTypeMap {
  users: UserRecord;
  inviteCodes: InviteCodeRecord;
  schools: SchoolRecord;
  announcements: AnnouncementRecord;
  academicYears: AcademicYearRecord;
  sections: SectionNode;
  files: FileRecord;
  classRooms: ClassRoomRecord;
  journalEntries: JournalEntryRecord;
  seminars: SeminarRecord;
  forumTopics: ForumTopicRecord;
  forumComments: ForumCommentRecord;
  chatRooms: ChatRoomRecord;
  chatMessages: ChatMessageRecord;
  themeConfigs: ThemeConfigRecord;
}

/**
 * Unified storage adapter contract.
 * Currently backed by LocalAdapter (Dexie IndexedDB).
 * Can be swapped for RemoteAdapter (Supabase/Firebase) without changing UI components.
 */
export interface IDataAdapter {
  readonly mode: 'local' | 'remote';
  init(): Promise<void>;
  getAll<K extends TableName>(table: K, includeDeleted?: boolean): Promise<TableTypeMap[K][]>;
  getById<K extends TableName>(table: K, id: string): Promise<TableTypeMap[K] | undefined>;
  queryByYear<K extends TableName>(
    table: K,
    academicYearId: string,
    includeDeleted?: boolean
  ): Promise<TableTypeMap[K][]>;
  put<K extends TableName>(table: K, record: TableTypeMap[K]): Promise<TableTypeMap[K]>;
  bulkPut<K extends TableName>(table: K, records: TableTypeMap[K][]): Promise<void>;
  softDelete<K extends TableName>(table: K, id: string): Promise<void>;
  hardDelete<K extends TableName>(table: K, id: string): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  getAllMeta(): Promise<AppMetaRecord[]>;
  clearAll(): Promise<void>;
  exportRawSnapshot(): Promise<{
    meta: AppMetaRecord[];
    tables: { [K in TableName]: TableTypeMap[K][] };
  }>;
  importRawSnapshot(snapshot: {
    meta: AppMetaRecord[];
    tables: Partial<{ [K in TableName]: TableTypeMap[K][] }>;
  }): Promise<void>;
}

export interface ServiceContext {
  ownerId: string;
  schoolId: string;
  academicYearId: string;
}

export type NewRecordInput<T extends BaseRecord> = Omit<
  T,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncStatus'
>;
