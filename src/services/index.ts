import { LocalAdapter } from '@/src/adapters/LocalAdapter';
import { buildDefaultSectionsForYear, CARD_ACCENT_CYCLE } from '@/src/db/seedDefaults';
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
import { ArchiveService } from './ArchiveService';
import { AuthService } from './AuthService';
import { BackupService } from './BackupService';
import { BehaviorService } from './BehaviorService';
import { ChatService } from './ChatService';
import { ClassesService } from './ClassesService';
import { generateId, generateSaltHex, hashPasswordPBKDF2 } from './crypto';
import { FilesService } from './FilesService';
import { ForumService } from './ForumService';
import { GradesService } from './GradesService';
import { JournalService } from './JournalService';
import { LibraryService } from './LibraryService';
import { SchoolService } from './SchoolService';
import { SearchService } from './SearchService';
import { SeatingService } from './SeatingService';
import { SectionsService } from './SectionsService';
import { SeminarsService } from './SeminarsService';
import { StudentsService } from './StudentsService';
import {
  buildPresetLocalizedNames,
  PRESET_SUBJECT_SPECS,
  SubjectsService,
} from './SubjectsService';
import { ThemeService } from './ThemeService';

const adapter: IDataAdapter = new LocalAdapter();
const authService = new AuthService(adapter);
const filesService = new FilesService(adapter);
const backupService = new BackupService(adapter);
const searchService = new SearchService(adapter, authService);
const libraryService = new LibraryService(adapter, authService);
const archiveService = new ArchiveService(adapter, filesService, backupService);
const gradesService = new GradesService(adapter);
const seatingService = new SeatingService(adapter, gradesService);
const behaviorService = new BehaviorService(adapter);

export const services = {
  adapter,
  auth: authService,
  school: new SchoolService(adapter),
  years: new AcademicYearService(adapter),
  sections: new SectionsService(adapter),
  files: filesService,
  classes: new ClassesService(adapter),
  subjects: new SubjectsService(adapter),
  students: new StudentsService(adapter),
  grades: gradesService,
  seating: seatingService,
  behavior: behaviorService,
  journal: new JournalService(adapter),
  seminars: new SeminarsService(adapter),
  forum: new ForumService(adapter),
  chat: new ChatService(adapter),
  theme: new ThemeService(adapter),
  backup: backupService,
  search: searchService,
  library: libraryService,
  archive: archiveService,
};

let initPromise: Promise<void> | null = null;

export async function initializeAppServices(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await adapter.init();
    filesService.setOnFileSavedListener((file) => {
      searchService.enqueueBackgroundIndex(file);
    });
    const scheduleBackgroundIndex = (yearId?: string | null) => {
      if (!yearId || typeof window === 'undefined') return;
      window.setTimeout(() => {
        searchService.ensureYearBackgroundIndexed(yearId).catch(() => {});
      }, 1200);
    };
    // Ensure existing sec_02 nodes receive updated featureType and cycling accents when uncustomized
    const sec02Defaults: Record<string, { idx: number; icon: string }> = {
      sec_02_curriculum: { idx: 0, icon: 'BookOpen' },
      sec_02_training_nb: { idx: 1, icon: 'GraduationCap' },
      sec_02_daily_nb: { idx: 2, icon: 'NotebookPen' },
      sec_02_planning: { idx: 3, icon: 'CalendarRange' },
      sec_02_grading_nb: { idx: 4, icon: 'ListChecks' },
      sec_02_supervised_doc: { idx: 5, icon: 'FileCheck2' },
    };
    const existingSections = await adapter.getAll('sections');
    for (const sec of existingSections) {
      const slug = sec.id.includes('__') ? sec.id.split('__')[1] : sec.id;
      const def = sec02Defaults[slug];
      if (def) {
        const nextFeature =
          slug === 'sec_02_grading_nb' ? 'grading_notebook' : sec.featureType;
        const needsAccentUpgrade = sec.accentColor === '#1d4ed8' && !sec.isCustomized;
        if (nextFeature !== sec.featureType || needsAccentUpgrade) {
          await adapter.put('sections', {
            ...sec,
            featureType: nextFeature,
            accentColor: needsAccentUpgrade
              ? CARD_ACCENT_CYCLE[def.idx % CARD_ACCENT_CYCLE.length]
              : sec.accentColor,
            icon: needsAccentUpgrade ? def.icon : sec.icon,
          });
        }
      }
    }
    const schemaVer = await adapter.getMeta('schema_version');
    if (schemaVer !== '2') {
      const mainAccentBySlug: Record<string, string> = {
        sec_01: CARD_ACCENT_CYCLE[0],
        sec_03: CARD_ACCENT_CYCLE[1],
        sec_04: CARD_ACCENT_CYCLE[2],
        sec_05: CARD_ACCENT_CYCLE[3],
        sec_06: CARD_ACCENT_CYCLE[4],
        sec_07: CARD_ACCENT_CYCLE[5],
        sec_08: CARD_ACCENT_CYCLE[6],
        sec_09: CARD_ACCENT_CYCLE[7],
        sec_10: CARD_ACCENT_CYCLE[0],
        sec_11: CARD_ACCENT_CYCLE[1],
        sec_12: CARD_ACCENT_CYCLE[2],
        sec_13: CARD_ACCENT_CYCLE[3],
        sec_14: CARD_ACCENT_CYCLE[4],
      };
      for (const sec of existingSections) {
        const slug = sec.id.includes('__') ? sec.id.split('__')[1] : sec.id;
        const targetAccent = mainAccentBySlug[slug];
        if (targetAccent && !sec.isCustomized && sec.accentColor !== targetAccent) {
          await adapter.put('sections', { ...sec, accentColor: targetAccent });
        }
      }
      const existingThemes = await adapter.getAll('themeConfigs');
      for (const th of existingThemes) {
        if (th.paletteId === 'emerald_olive' && th.primaryColor === '#0f766e') {
          await adapter.put('themeConfigs', {
            ...th,
            paletteId: 'deep_sapphire',
            primaryColor: '#1e40af',
            mode: 'light',
          });
        }
      }
      await adapter.setMeta('schema_version', '2');
    }
    const schools = await adapter.getAll('schools');
    if (schools.length > 0) {
      if (schemaVer !== '3') {
        // Migrate existing Turn 1-3 databases to dynamic per-teacher subjects:
        // preserve History & Geography and Civic Education, and immediately archive Physical Education
        // with archivedNeedsDeleteReview=true so the teacher sees attached content before permanent deletion.
        const [allYears, allUsers, allSubjects] = await Promise.all([
          adapter.getAll('academicYears'),
          adapter.getAll('users'),
          adapter.getAll('subjects'),
        ]);
        const primaryOwnerId =
          allUsers.find((u) => u.role === 'primary_admin')?.id || schools[0].ownerId;

        for (const yr of allYears) {
          const ctx = {
            ownerId: primaryOwnerId,
            schoolId: yr.schoolId,
            academicYearId: yr.id,
          };
          const yrSubjects = allSubjects.filter((s) => s.academicYearId === yr.id);

          // Tag existing legacy section nodes first so dependencies & file links match IDs
          const yrSections = await adapter.queryByYear('sections', yr.id);
          const secUpdates: typeof yrSections = [];
          for (const sec of yrSections) {
            if (sec.subjectId) continue;
            const slug = sec.id.includes('__') ? sec.id.slice(sec.id.indexOf('__') + 2) : sec.id;
            let mappedSubjId: string | undefined;
            let hideNode = sec.isHidden;

            if (slug.endsWith('_pe') || slug.includes('_pe_')) {
              mappedSubjId = 'physical_education';
              hideNode = true;
            } else if (
              slug.endsWith('_hg') ||
              slug.includes('_hg_') ||
              slug.endsWith('_hist') ||
              slug.includes('_hist_') ||
              slug.endsWith('_geo') ||
              slug.includes('_geo_')
            ) {
              mappedSubjId = 'history_geography';
            } else if (slug.endsWith('_civic') || slug.includes('_civic_')) {
              mappedSubjId = 'civic_education';
            }

            if (mappedSubjId) {
              secUpdates.push({ ...sec, subjectId: mappedSubjId, isHidden: hideNode });
            }
          }
          if (secUpdates.length > 0) {
            await adapter.bulkPut('sections', secUpdates);
          }

          if (yrSubjects.length === 0) {
            const hgSpec = PRESET_SUBJECT_SPECS.find((p) => p.key === 'hg')!;
            const civicSpec = PRESET_SUBJECT_SPECS.find((p) => p.key === 'civic')!;
            const peSpec = PRESET_SUBJECT_SPECS.find((p) => p.key === 'pe')!;

            await services.subjects.addSubject(ctx, {
              id: 'history_geography',
              names: buildPresetLocalizedNames('hg'),
              color: hgSpec.color,
              icon: hgSpec.icon,
              isActive: true,
            });
            await services.subjects.addSubject(ctx, {
              id: 'civic_education',
              names: buildPresetLocalizedNames('civic'),
              color: civicSpec.color,
              icon: civicSpec.icon,
              isActive: true,
            });
            await services.subjects.addSubject(ctx, {
              id: 'physical_education',
              names: buildPresetLocalizedNames('pe'),
              color: peSpec.color,
              icon: peSpec.icon,
              isActive: false,
              archivedNeedsDeleteReview: true,
            });
          } else {
            // Ensure Physical Education is archived with review flag if present & unreviewed
            const peSubj = yrSubjects.find((s) => s.id === 'physical_education');
            if (peSubj && peSubj.isActive) {
              await services.subjects.updateSubject(ctx, peSubj.id, {
                isActive: false,
                archivedNeedsDeleteReview: true,
              });
            }
          }
        }
        await adapter.setMeta('schema_version', '3');
      }
      const viewingId = await adapter.getMeta('active_viewing_year_id');
      scheduleBackgroundIndex(viewingId || schools[0].academicYearId);
      return;
    }

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
      subjectSpecialty: '',
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
      subjectSpecialty: '',
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
      name: 'غرفة التنسيق البيداغوجي',
      description: 'فضاء تبادل سريع بين أساتذة المتوسطة',
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
    await adapter.setMeta('schema_version', '3');
    await adapter.setMeta('active_viewing_year_id', yearId);
    await adapter.setMeta('app_language', 'ar');
    scheduleBackgroundIndex(yearId);
  })();

  return initPromise;
}
