export type SyncStatus = 'local' | 'pending' | 'synced';
export type LanguageCode = 'ar' | 'en' | 'fr';

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
  ownerId: string;
  schoolId: string;
  academicYearId: string;
}

export interface LocalizedText {
  ar: string;
  en: string;
  fr: string;
}

export type UserRole = 'primary_admin' | 'teacher_write' | 'teacher_read' | 'banned';

export interface SectionPermission {
  view: boolean;
  write: boolean;
  comment: boolean;
}

export interface UserRecord extends BaseRecord {
  username: string;
  displayName: string;
  subjectSpecialty: string;
  passwordHash: string;
  passwordSalt: string;
  role: UserRole;
  sectionPermissions: Record<string, SectionPermission>;
  assignedClasses: string[];
  isOnlineSimulated: boolean;
  lastSeenAt: string;
}

export interface InviteCodeRecord extends BaseRecord {
  code: string;
  role: Exclude<UserRole, 'banned'>;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  createdByUserId: string;
}

export interface SchoolRecord extends BaseRecord {
  name: string;
  wilaya: string;
  directorate: string;
  motto: string;
}

export interface AnnouncementRecord extends BaseRecord {
  title: string;
  body: string;
  category: 'news' | 'announcement' | 'urgent';
  pinned: boolean;
  authorName: string;
}

export interface AcademicYearRecord extends BaseRecord {
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isArchived: boolean;
}

export type SectionNodeKind = 'main' | 'subsection' | 'level' | 'subject' | 'term' | 'custom';

export type SectionFeatureType =
  | 'standard'
  | 'assignments_exams'
  | 'student_lists'
  | 'audiovisual'
  | 'daily_journal'
  | 'seminars'
  | 'forum_chat';

export type MiddleSchoolLevel = '1M' | '2M' | '3M' | '4M';

export interface SectionNode extends BaseRecord {
  parentId: string | null;
  kind: SectionNodeKind;
  featureType: SectionFeatureType;
  names: LocalizedText;
  defaultNames: LocalizedText;
  icon: string;
  accentColor: string;
  order: number;
  isHidden: boolean;
  isPinned: boolean;
  isDefault: boolean;
  isCustomized: boolean;
  levelCode?: MiddleSchoolLevel;
  termNumber?: 1 | 2 | 3;
}

export type ExamKind =
  | 'diagnostic'
  | 'assignment'
  | 'term_exam'
  | 'bem'
  | 'remedial'
  | 'solution';

export interface FileRecord extends BaseRecord {
  sectionId: string;
  name: string;
  mimeType: string;
  size: number;
  extension: string;
  blob?: Blob;
  externalUrl?: string;
  tags: string[];
  isFavorite: boolean;
  order: number;
  termNumber?: 1 | 2 | 3;
  examKind?: ExamKind;
  linkedSolutionFileId?: string | null;
  lastOpenedAt: string | null;
}

export interface ClassRoomRecord extends BaseRecord {
  levelCode: MiddleSchoolLevel;
  name: string;
  order: number;
  termSectionIds: {
    1: string;
    2: string;
    3: string;
  };
}

export interface JournalEntryRecord extends BaseRecord {
  date: string; // YYYY-MM-DD
  title: string;
  content: string;
  classes: string[];
  tag: string;
  attachmentFileIds: string[];
}

export interface SeminarRecord extends BaseRecord {
  kind: 'internal' | 'external';
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location: string;
  content: string;
  notifyMinutesBefore: number;
  notified: boolean;
  attachmentFileIds: string[];
}

export interface ForumTopicRecord extends BaseRecord {
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  category: string;
  attachmentFileIds: string[];
  isPinned: boolean;
}

export interface ForumCommentRecord extends BaseRecord {
  topicId: string;
  body: string;
  authorId: string;
  authorName: string;
  attachmentFileIds: string[];
}

export interface ChatRoomRecord extends BaseRecord {
  name: string;
  description: string;
  memberIds: string[];
  invitedCodes: string[];
}

export interface ChatMessageRecord extends BaseRecord {
  roomId: string;
  senderId: string;
  senderName: string;
  text: string;
  attachmentFileId?: string | null;
}

export interface CardThemeOverride {
  accentColor?: string;
  icon?: string;
}

export interface ThemeConfigRecord extends BaseRecord {
  paletteId: string;
  primaryColor: string;
  mode: 'light' | 'dark' | 'system';
  fontSizePx: number;
  cardOverrides: Record<string, CardThemeOverride>;
}

export interface AppMetaRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface ThemePalette {
  id: string;
  names: LocalizedText;
  primary: string;
  surfaceLight: string;
  bgLight: string;
}
