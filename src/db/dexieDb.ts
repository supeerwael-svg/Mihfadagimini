import Dexie, { type Table } from 'dexie';
import type {
  AcademicYearRecord,
  AnnouncementRecord,
  AppMetaRecord,
  BehaviorConfigRecord,
  BehaviorCriterionRecord,
  BehaviorEventRecord,
  ChatMessageRecord,
  ChatRoomRecord,
  ClassRoomRecord,
  FileRecord,
  FileSearchIndexRecord,
  FileVersionRecord,
  ForumCommentRecord,
  ForumTopicRecord,
  GradeHistoryRecord,
  GradeRecord,
  GradingConfigRecord,
  InviteCodeRecord,
  JournalEntryRecord,
  LibraryCollectionRecord,
  SavedSearchRecord,
  SchoolRecord,
  SeatingPlanRecord,
  SectionNode,
  SeminarRecord,
  StudentRecord,
  SubjectRecord,
  TagRecord,
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
  tags!: Table<TagRecord, string>;
  collections!: Table<LibraryCollectionRecord, string>;
  savedSearches!: Table<SavedSearchRecord, string>;
  searchIndex!: Table<FileSearchIndexRecord, string>;
  fileVersions!: Table<FileVersionRecord, string>;
  classRooms!: Table<ClassRoomRecord, string>;
  subjects!: Table<SubjectRecord, string>;
  students!: Table<StudentRecord, string>;
  grades!: Table<GradeRecord, string>;
  gradeHistory!: Table<GradeHistoryRecord, string>;
  gradingConfigs!: Table<GradingConfigRecord, string>;
  seatingPlans!: Table<SeatingPlanRecord, string>;
  behaviorCriteria!: Table<BehaviorCriterionRecord, string>;
  behaviorEvents!: Table<BehaviorEventRecord, string>;
  behaviorConfigs!: Table<BehaviorConfigRecord, string>;
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

    this.version(2).stores({
      students: 'id, academicYearId, classRoomId, order, deletedAt',
      grades: 'id, academicYearId, classRoomId, studentId, termNumber, subjectKey, deletedAt',
      gradeHistory: 'id, academicYearId, classRoomId, studentId, createdAt, deletedAt',
      gradingConfigs: 'id, academicYearId, schoolId, deletedAt',
    });

    this.version(3).stores({
      subjects: 'id, academicYearId, ownerId, order, isActive, deletedAt',
    });

    this.version(4).stores({
      files: 'id, academicYearId, sectionId, hash, status, fileCategory, levelCode, subjectId, isFavorite, pinned, lastOpenedAt, deletedAt',
      tags: 'id, academicYearId, name, parentName, deletedAt',
      collections: 'id, academicYearId, order, isSmart, deletedAt',
      savedSearches: 'id, academicYearId, pinnedToHome, deletedAt',
      searchIndex: 'id, academicYearId, fileId, deletedAt',
      fileVersions: 'id, academicYearId, fileId, versionNumber, deletedAt',
    });

    this.version(5).stores({
      seatingPlans: 'id, academicYearId, classRoomId, termNumber, subjectId, isActive, deletedAt',
      behaviorCriteria: 'id, academicYearId, ownerId, order, isActive, deletedAt',
      behaviorEvents: 'id, academicYearId, classRoomId, studentId, termNumber, subjectKey, criterionId, occurredAt, deletedAt',
      behaviorConfigs: 'id, academicYearId, ownerId, deletedAt',
    });
  }
}

export const dexieDb = new TeachersPortfolioDB();
