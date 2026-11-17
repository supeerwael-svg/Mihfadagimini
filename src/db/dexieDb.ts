import Dexie, { type Table } from 'dexie';
import type {
  AcademicYearRecord,
  AnnouncementRecord,
  AppMetaRecord,
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
} from '@/src/types/models';

export class TeachersPortfolioDB extends Dexie {
  users!: Table<UserRecord, string>;
  inviteCodes!: Table<InviteCodeRecord, string>;
  schools!: Table<SchoolRecord, string>;
  announcements!: Table<AnnouncementRecord, string>;
  academicYears!: Table<AcademicYearRecord, string>;
  sections!: Table<SectionNode, string>;
  files!: Table<FileRecord, string>;
  classRooms!: Table<ClassRoomRecord, string>;
  journalEntries!: Table<JournalEntryRecord, string>;
  seminars!: Table<SeminarRecord, string>;
  forumTopics!: Table<ForumTopicRecord, string>;
  forumComments!: Table<ForumCommentRecord, string>;
  chatRooms!: Table<ChatRoomRecord, string>;
  chatMessages!: Table<ChatMessageRecord, string>;
  themeConfigs!: Table<ThemeConfigRecord, string>;
  appMeta!: Table<AppMetaRecord, string>;

  constructor() {
    super('teachers_portfolio_db');
    this.version(1).stores({
      users: 'id, username, schoolId, role, deletedAt',
      inviteCodes: 'id, code, schoolId, deletedAt',
      schools: 'id, deletedAt',
      announcements: 'id, schoolId, academicYearId, pinned, deletedAt',
      academicYears: 'id, schoolId, isActive, isArchived, deletedAt',
      sections: 'id, academicYearId, parentId, kind, order, deletedAt',
      files: 'id, academicYearId, sectionId, isFavorite, lastOpenedAt, deletedAt',
      classRooms: 'id, academicYearId, levelCode, order, deletedAt',
      journalEntries: 'id, academicYearId, date, deletedAt',
      seminars: 'id, academicYearId, date, kind, deletedAt',
      forumTopics: 'id, academicYearId, schoolId, authorId, deletedAt',
      forumComments: 'id, academicYearId, topicId, deletedAt',
      chatRooms: 'id, academicYearId, schoolId, deletedAt',
      chatMessages: 'id, academicYearId, roomId, createdAt, deletedAt',
      themeConfigs: 'id, ownerId, deletedAt',
      appMeta: 'key',
    });
  }
}

export const dexieDb = new TeachersPortfolioDB();
