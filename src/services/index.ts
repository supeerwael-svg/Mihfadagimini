import { LocalAdapter } from '@/src/adapters/LocalAdapter';
import { buildDefaultSectionsForYear } from '@/src/db/seedDefaults';
import type {
  AcademicYearRecord,
  AnnouncementRecord,
  ChatMessageRecord,
  ChatRoomRecord,
  ClassRoomRecord,
  ForumTopicRecord,
  InviteCodeRecord,
  SchoolRecord,
  SeminarRecord,
  UserRecord,
} from '@/src/types/models';
import type { IDataAdapter } from '@/src/types/services';
import { AcademicYearService } from './AcademicYearService';
import { AuthService } from './AuthService';
import { BackupService } from './BackupService';
import { ChatService } from './ChatService';
import { ClassesService } from './ClassesService';
import { generateId, generateSaltHex, hashPasswordPBKDF2 } from './crypto';
import { FilesService } from './FilesService';
import { ForumService } from './ForumService';
import { JournalService } from './JournalService';
import { SchoolService } from './SchoolService';
import { SearchService } from './SearchService';
import { SectionsService } from './SectionsService';
import { SeminarsService } from './SeminarsService';
import { ThemeService } from './ThemeService';

const adapter: IDataAdapter = new LocalAdapter();

export const services = {
  adapter,
  auth: new AuthService(adapter),
  school: new SchoolService(adapter),
  years: new AcademicYearService(adapter),
  sections: new SectionsService(adapter),
  files: new FilesService(adapter),
  classes: new ClassesService(adapter),
  journal: new JournalService(adapter),
  seminars: new SeminarsService(adapter),
  forum: new ForumService(adapter),
  chat: new ChatService(adapter),
  theme: new ThemeService(adapter),
  backup: new BackupService(adapter),
  search: new SearchService(adapter),
};

let initPromise: Promise<void> | null = null;

export async function initializeAppServices(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await adapter.init();
    const schools = await adapter.getAll('schools');
    if (schools.length > 0) return;

    const now = new Date().toISOString();
    const schoolId = generateId();
    const yearId = 'yr_2026_2027';
    const adminId = generateId();
    const teacherId = generateId();

    const school: SchoolRecord = {
      id: schoolId,
      name: 'متوسطة الشهيد مصطفى بن بولعيد',
      wilaya: 'الجزائر الوسطى',
      directorate: 'مديرية التربية',
      motto: 'التميز البيداغوجي والتنظيم الرقمي',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const academicYear: AcademicYearRecord = {
      id: yearId,
      label: '2026/2027',
      startDate: '2026-09-01',
      endDate: '2027-07-15',
      isActive: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    // PBKDF2-SHA256 hashed local experimental credentials
    const adminSalt = generateSaltHex();
    const adminHash = await hashPasswordPBKDF2('123456', adminSalt);
    const teacherSalt = generateSaltHex();
    const teacherHash = await hashPasswordPBKDF2('123456', teacherSalt);

    const adminUser: UserRecord = {
      id: adminId,
      username: 'admin',
      displayName: 'أ. عبد الرحمان بن عيسى',
      subjectSpecialty: 'التاريخ والجغرافيا والتربية المدنية',
      passwordHash: adminHash,
      passwordSalt: adminSalt,
      role: 'primary_admin',
      sectionPermissions: {},
      assignedClasses: ['1M1', '2M2', '3M3', '4M1'],
      isOnlineSimulated: true,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const peerUser: UserRecord = {
      id: teacherId,
      username: 'teacher1',
      displayName: 'أ. سارة منصوري',
      subjectSpecialty: 'التربية البدنية والرياضية',
      passwordHash: teacherHash,
      passwordSalt: teacherSalt,
      role: 'teacher_write',
      sectionPermissions: {},
      assignedClasses: ['1M2', '2M1'],
      isOnlineSimulated: false,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const invite: InviteCodeRecord = {
      id: generateId(),
      code: 'EDU-2026',
      role: 'teacher_write',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      maxUses: 25,
      usedCount: 0,
      createdByUserId: adminId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const sections = buildDefaultSectionsForYear(adminId, schoolId, yearId);

    const defaultClasses: ClassRoomRecord[] = [
      { levelCode: '1M', name: '1M1', order: 1 },
      { levelCode: '2M', name: '2M2', order: 1 },
      { levelCode: '3M', name: '3M3', order: 1 },
      { levelCode: '4M', name: '4M1', order: 1 },
    ].map((c) => {
      const id = generateId();
      return {
        id,
        levelCode: c.levelCode as ClassRoomRecord['levelCode'],
        name: c.name,
        order: c.order,
        termSectionIds: {
          1: `${yearId}__cls_${id}_t1`,
          2: `${yearId}__cls_${id}_t2`,
          3: `${yearId}__cls_${id}_t3`,
        },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: adminId,
        schoolId,
        academicYearId: yearId,
      };
    });

    const announcements: AnnouncementRecord[] = [
      {
        id: generateId(),
        title: 'افتتاح بوابة الموسم الدراسي 2026/2027',
        body: 'تم تفعيل البوابة الرقمية للموسم الدراسي الجديد. يرجى مراجعة التدرجات السنوية وتحميل قوائم التلاميذ في القسم الثامن.',
        category: 'news',
        pinned: true,
        authorName: adminUser.displayName,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: adminId,
        schoolId,
        academicYearId: yearId,
      },
      {
        id: generateId(),
        title: 'اجتماع التنسيق البيداغوجي لمادة الاجتماعيات',
        body: 'يعقد اجتماع التنسيق الأسبوع القادم بقاعة الأساتذة لتوحيد مواضيع التقويم التشخيصي للمستويات الأربعة.',
        category: 'announcement',
        pinned: false,
        authorName: adminUser.displayName,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: adminId,
        schoolId,
        academicYearId: yearId,
      },
    ];

    const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const sampleSeminar: SeminarRecord = {
      id: generateId(),
      kind: 'internal',
      title: 'ندوة تربوية حول بناء الاختبار وفق المقاربة بالكفاءات',
      date: tomorrow,
      time: '10:00',
      location: 'قاعة المحاضرات — المتوسطة',
      content: 'دراسة شبكة التقويم وتدرج الأسئلة من المعرفة إلى الإدماج.',
      notifyMinutesBefore: 1440,
      notified: false,
      attachmentFileIds: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const topicId = generateId();
    const sampleTopic: ForumTopicRecord = {
      id: topicId,
      title: 'تنسيق فروض الفصل الأول للسنة الرابعة متوسط',
      body: 'زملائي الأساتذة، نقترح توحيد المدة الزمنية وبناء وضعية إدماجية مشتركة حول التضاريس والمناخ.',
      authorId: adminId,
      authorName: adminUser.displayName,
      category: 'التنسيق البيداغوجي',
      attachmentFileIds: [],
      isPinned: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const roomId = generateId();
    const sampleRoom: ChatRoomRecord = {
      id: roomId,
      name: 'غرفة تنسيق الاجتماعيات والتربية المدنية',
      description: 'فضاء تبادل سريع بين أساتذة المادة',
      memberIds: [adminId, teacherId],
      invitedCodes: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    const sampleMsg: ChatMessageRecord = {
      id: generateId(),
      roomId,
      senderId: adminId,
      senderName: adminUser.displayName,
      text: 'مرحباً بالجميع في غرفة التنسيق للموسم 2026/2027.',
      attachmentFileId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: adminId,
      schoolId,
      academicYearId: yearId,
    };

    await adapter.put('schools', school);
    await adapter.put('academicYears', academicYear);
    await adapter.bulkPut('users', [adminUser, peerUser]);
    await adapter.put('inviteCodes', invite);
    await adapter.bulkPut('sections', sections);
    await adapter.bulkPut('classRooms', defaultClasses);
    await adapter.bulkPut('announcements', announcements);
    await adapter.put('seminars', sampleSeminar);
    await adapter.put('forumTopics', sampleTopic);
    await adapter.put('chatRooms', sampleRoom);
    await adapter.put('chatMessages', sampleMsg);
    await adapter.setMeta('schema_version', '1');
    await adapter.setMeta('active_viewing_year_id', yearId);
    await adapter.setMeta('app_language', 'ar');
  })();

  return initPromise;
}
