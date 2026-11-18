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
  | 'forum_chat'
  | 'grading_notebook';

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
  subjectId?: string;
}

export type ExamKind =
  | 'diagnostic'
  | 'assignment'
  | 'term_exam'
  | 'bem'
  | 'remedial'
  | 'solution';

export type FileTypeCategory =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'image'
  | 'audio'
  | 'video'
  | 'other';

export type FileStatus = 'active' | 'archived' | 'trashed';

export interface FileRecord extends BaseRecord {
  sectionId: string;
  subsectionId?: string | null;
  name: string;
  title?: string;
  originalFileName?: string;
  mimeType: string;
  fileCategory?: FileTypeCategory;
  size: number;
  extension: string;
  hash?: string;
  blob?: Blob;
  thumbnailBlob?: Blob | null;
  externalUrl?: string;
  levelCode?: MiddleSchoolLevel | null;
  subjectId?: string | null;
  tags: string[];
  description?: string;
  authorSource?: string;
  language?: LanguageCode;
  pageCount?: number | null;
  lastReadPage?: number | null;
  isFavorite: boolean;
  pinned?: boolean;
  status?: FileStatus;
  archivedAt?: string | null;
  trashedAt?: string | null;
  order: number;
  termNumber?: 1 | 2 | 3;
  examKind?: ExamKind;
  linkedSolutionFileId?: string | null;
  hasQrMap?: boolean;
  qrPayload?: string | null;
  versionCount?: number;
  openCount?: number;
  lastOpenedAt: string | null;
}

export interface TagRecord extends BaseRecord {
  name: string;
  parentName?: string | null;
  color: string;
}

export type SmartCollectionRuleId =
  | 'this_week'
  | 'not_opened_6m'
  | 'large_files'
  | 'unclassified'
  | 'duplicates'
  | 'favorites_by_subject';

export interface SmartCollectionConfig {
  ruleId: SmartCollectionRuleId;
  minSizeBytes?: number;
  inactiveDays?: number;
  recentDays?: number;
  subjectId?: string;
}

export interface LibraryCollectionRecord extends BaseRecord {
  name: string;
  notes: string;
  coverColor: string;
  coverIcon: string;
  fileIds: string[];
  order: number;
  isSmart?: boolean;
  smartConfig?: SmartCollectionConfig;
}

export interface LibrarySearchFilters {
  sectionId?: string;
  levelCode?: MiddleSchoolLevel | 'all';
  subjectId?: string | 'all';
  termNumber?: 1 | 2 | 3 | 'all';
  yearId?: string | 'all';
  fileCategory?: FileTypeCategory | 'all';
  tag?: string | 'all';
  sizeRange?: 'all' | 'small' | 'medium' | 'large';
  dateRange?: 'all' | 'week' | 'month' | '6months';
  status?: 'active' | 'archived' | 'all_with_archived';
  favoritesOnly?: boolean;
  hasQrOnly?: boolean;
}

export interface SavedSearchRecord extends BaseRecord {
  title: string;
  query: string;
  filters: LibrarySearchFilters;
  pinnedToHome: boolean;
}

export interface IndexedPageText {
  page: number;
  text: string;
  norm: string;
}

export interface FileSearchIndexRecord extends BaseRecord {
  fileId: string;
  textNormalized: string;
  pageTexts: IndexedPageText[];
  isScannedUnsearchable: boolean;
  ocrCompleted: boolean;
  indexedAt: string;
}

export interface FileVersionRecord extends BaseRecord {
  fileId: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  size: number;
  hash: string;
  note: string;
  blob?: Blob;
}

export interface ClassRoomRecord extends BaseRecord {
  levelCode: MiddleSchoolLevel;
  name: string;
  order: number;
  subjectIds?: string[];
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

export type GradeCellMark = 'absent' | 'excused' | 'not_graded' | null;

export interface GradeCellValue {
  score: number | null;
  mark: GradeCellMark;
}

export type GradeSubjectKey = string;

export interface SubjectRecord extends BaseRecord {
  names: LocalizedText;
  color: string;
  icon: string;
  order: number;
  isActive: boolean;
  archivedNeedsDeleteReview?: boolean;
}

export interface StudentRecord extends BaseRecord {
  classRoomId: string;
  lastName: string;
  firstName: string;
  order: number;
}

export interface GradeRecord extends BaseRecord {
  studentId: string;
  classRoomId: string;
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  continuous: GradeCellValue;
  assignment: GradeCellValue;
  exam: GradeCellValue;
}

export interface GradeHistoryRecord extends BaseRecord {
  gradeId: string;
  studentId: string;
  studentName: string;
  classRoomId: string;
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  field: 'continuous' | 'assignment' | 'exam';
  oldValue: string;
  newValue: string;
  changedByUserId: string;
  changedByName: string;
}

export interface GradingFormulaRule {
  key: string;
  continuousWeight: number;
  assignmentWeight: number;
  examWeight: number;
  maxGrade: number;
  annualTermWeights: [number, number, number];
}

export interface GradingConfigRecord extends BaseRecord {
  rules: Record<string, GradingFormulaRule>;
  allowReadOnlyViewByUserIds: string[];
}

export type BoardSide = 'top' | 'bottom' | 'left' | 'right';
export type ViewOrientation = 'teacher_desk' | 'back_of_class';
export type SeatingLayoutPreset = 'rows' | 'u_shape' | 'groups_4' | 'workshop';

export interface DeskSlot {
  id: string;
  row: number;
  col: number;
  isAisle?: boolean;
  seatsPerDesk: 1 | 2 | 3;
  studentIds: (string | null)[];
}

export interface SeatingPlanRecord extends BaseRecord {
  classRoomId: string;
  termNumber?: 1 | 2 | 3;
  subjectId?: string;
  name: string;
  isActive: boolean;
  rows: number;
  cols: number;
  defaultSeatsPerDesk: 1 | 2 | 3;
  boardSide: BoardSide;
  boardRotationDeg: number;
  viewOrientation: ViewOrientation;
  desks: DeskSlot[];
  apartPairs?: Array<[string, string]>;
  priorityStudentIds?: string[];
}

export type BehaviorCriterionSign = 'positive' | 'negative' | 'both';

export interface BehaviorCriterionRecord extends BaseRecord {
  names: LocalizedText;
  sign: BehaviorCriterionSign;
  step: number;
  minPoints: number;
  maxPoints: number;
  weight: number;
  order: number;
  isActive: boolean;
}

export interface BehaviorEventRecord extends BaseRecord {
  classRoomId: string;
  studentId: string;
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  criterionId: string;
  criterionNameSnapshot: string;
  delta: number;
  note?: string;
  occurredAt: string;
}

export interface BehaviorGradingRule {
  key: string;
  startingGrade: number;
  minGrade: number;
  maxGrade: number;
  pointsPerStep: number;
}

export interface BehaviorConfigRecord extends BaseRecord {
  rules: Record<string, BehaviorGradingRule>;
  termResetAt?: Record<string, string>;
  showColorFeedback?: boolean;
  hideNamesMode?: boolean;
}

