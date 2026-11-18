import type {
  LocalizedText,
  MiddleSchoolLevel,
  SectionFeatureType,
  SectionNode,
  SectionNodeKind,
  ThemePalette,
} from '@/src/types/models';

export const CARD_ACCENT_CYCLE = [
  '#f59e0b', // amber
  '#0d9488', // teal
  '#4f46e5', // indigo
  '#64748b', // slate
  '#a855f7', // purple
  '#0ea5e9', // sky blue
  '#16a34a', // green
  '#e11d48', // rose
] as const;

export const THEME_PALETTES: ThemePalette[] = [
  {
    id: 'deep_sapphire',
    names: { ar: 'الأزرق الأكاديمي الداكن', en: 'Deep Academic Blue', fr: 'Bleu Académique Profond' },
    primary: '#1e40af',
    surfaceLight: '#ffffff',
    bgLight: '#f3f6fb',
  },
  {
    id: 'emerald_olive',
    names: { ar: 'الزمرد التربوي', en: 'Pedagogical Emerald', fr: 'Émeraude Pédagogique' },
    primary: '#0f766e',
    surfaceLight: '#ffffff',
    bgLight: '#f5f7f8',
  },
  {
    id: 'royal_indigo',
    names: { ar: 'النيلي الأكاديمي', en: 'Academic Indigo', fr: 'Indigo Académique' },
    primary: '#3730a3',
    surfaceLight: '#ffffff',
    bgLight: '#f6f7fb',
  },
  {
    id: 'crimson_maroon',
    names: { ar: 'العنابي الكلاسيكي', en: 'Classic Maroon', fr: 'Bordeaux Classique' },
    primary: '#9f1239',
    surfaceLight: '#ffffff',
    bgLight: '#faf6f7',
  },
  {
    id: 'amber_bronze',
    names: { ar: 'البرونز الدافئ', en: 'Warm Bronze', fr: 'Bronze Chaleureux' },
    primary: '#b45309',
    surfaceLight: '#ffffff',
    bgLight: '#faf8f5',
  },
  {
    id: 'forest_sage',
    names: { ar: 'أخضر الغابات', en: 'Forest Pine', fr: 'Pin Forestier' },
    primary: '#15803d',
    surfaceLight: '#ffffff',
    bgLight: '#f5f8f6',
  },
  {
    id: 'plum_violet',
    names: { ar: 'الأرجواني الهادئ', en: 'Royal Plum', fr: 'Prune Royale' },
    primary: '#6d28d9',
    surfaceLight: '#ffffff',
    bgLight: '#f7f6fb',
  },
  {
    id: 'ocean_cyan',
    names: { ar: 'المحيط الهادئ', en: 'Oceanic Teal', fr: 'Océan Pacifique' },
    primary: '#0369a1',
    surfaceLight: '#ffffff',
    bgLight: '#f4f8fa',
  },
  {
    id: 'slate_graphite',
    names: { ar: 'الجرافيت الرسمي', en: 'Official Graphite', fr: 'Graphite Officiel' },
    primary: '#334155',
    surfaceLight: '#ffffff',
    bgLight: '#f5f6f8',
  },
];

export const MIDDLE_SCHOOL_LEVELS: Array<{ code: MiddleSchoolLevel; names: LocalizedText }> = [
  { code: '1M', names: { ar: 'السنة الأولى متوسط', en: '1st Year Middle School', fr: '1ère Année Moyenne' } },
  { code: '2M', names: { ar: 'السنة الثانية متوسط', en: '2nd Year Middle School', fr: '2ème Année Moyenne' } },
  { code: '3M', names: { ar: 'السنة الثالثة متوسط', en: '3rd Year Middle School', fr: '3ème Année Moyenne' } },
  { code: '4M', names: { ar: 'السنة الرابعة متوسط', en: '4th Year Middle School', fr: '4ème Année Moyenne' } },
];

export const SCHOOL_TERMS: Array<{ num: 1 | 2 | 3; names: LocalizedText }> = [
  { num: 1, names: { ar: 'الفصل الأول', en: 'First Term', fr: '1er Trimestre' } },
  { num: 2, names: { ar: 'الفصل الثاني', en: 'Second Term', fr: '2ème Trimestre' } },
  { num: 3, names: { ar: 'الفصل الثالث', en: 'Third Term', fr: '3ème Trimestre' } },
];

const LEVELS = MIDDLE_SCHOOL_LEVELS;

export function buildDefaultSectionsForYear(
  ownerId: string,
  schoolId: string,
  academicYearId: string
): SectionNode[] {
  const now = new Date().toISOString();
  const nodes: SectionNode[] = [];

  const pushNode = (params: {
    id: string;
    parentId: string | null;
    kind: SectionNodeKind;
    featureType?: SectionFeatureType;
    names: LocalizedText;
    icon: string;
    accentColor: string;
    order: number;
    levelCode?: MiddleSchoolLevel;
    termNumber?: 1 | 2 | 3;
  }) => {
    nodes.push({
      id: params.id,
      parentId: params.parentId,
      kind: params.kind,
      featureType: params.featureType ?? 'standard',
      names: { ...params.names },
      defaultNames: { ...params.names },
      icon: params.icon,
      accentColor: params.accentColor,
      order: params.order,
      isHidden: false,
      isPinned: false,
      isDefault: true,
      isCustomized: false,
      levelCode: params.levelCode,
      termNumber: params.termNumber,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId,
      schoolId,
      academicYearId,
    });
  };

  // Scope IDs per academic year so each year has isolated nodes while preserving predictable structural keys
  const sid = (slug: string) => `${academicYearId}__${slug}`;

  // 1. Pedagogical notes and lessons
  pushNode({
    id: sid('sec_01'),
    parentId: null,
    kind: 'main',
    names: { ar: 'المذكرات البيداغوجية والدروس', en: 'Pedagogical Notes & Lessons', fr: 'Fiches Pédagogiques & Cours' },
    icon: 'BookOpen',
    accentColor: CARD_ACCENT_CYCLE[0],
    order: 1,
  });
  LEVELS.forEach((lvl, li) => {
    const lvlId = sid(`sec_01_${lvl.code}`);
    pushNode({
      id: lvlId,
      parentId: sid('sec_01'),
      kind: 'level',
      names: lvl.names,
      icon: 'GraduationCap',
      accentColor: '#0f766e',
      order: li + 1,
      levelCode: lvl.code,
    });
    const buckets: Array<{ key: string; names: LocalizedText; icon: string }> = [
      { key: 'lessons', names: { ar: 'الدروس', en: 'Lessons', fr: 'Cours' }, icon: 'FileText' },
      { key: 'notes', names: { ar: 'المذكرات', en: 'Pedagogical Notes', fr: 'Fiches' }, icon: 'NotebookPen' },
    ];
    buckets.forEach((b, bi) => {
      const bId = sid(`sec_01_${lvl.code}_${b.key}`);
      pushNode({
        id: bId,
        parentId: lvlId,
        kind: 'subsection',
        names: b.names,
        icon: b.icon,
        accentColor: '#0f766e',
        order: bi + 1,
        levelCode: lvl.code,
      });
    });
  });

  // 2. Teacher documents
  pushNode({
    id: sid('sec_02'),
    parentId: null,
    kind: 'main',
    names: { ar: 'وثائق الأستاذ', en: 'Teacher Documents', fr: 'Documents du Professeur' },
    icon: 'FolderKanban',
    accentColor: '#1e40af',
    order: 2,
  });
  [
    { k: 'curriculum', icon: 'BookOpen', n: { ar: 'المنهاج والوثيقة المرافقة', en: 'Curriculum', fr: 'Programme Officiel' } },
    { k: 'training_nb', icon: 'GraduationCap', n: { ar: 'دفتر التكوين', en: 'Training Notebook', fr: 'Cahier de Formation' } },
    { k: 'daily_nb', icon: 'NotebookPen', n: { ar: 'الدفتر اليومي', en: 'Daily Notebook', fr: 'Cahier Journal' } },
    { k: 'planning', icon: 'CalendarRange', n: { ar: 'التخطيط والتدرجات السنوية', en: 'Planning & Progressions', fr: 'Planification & Progressions' } },
    { k: 'grading_nb', icon: 'ListChecks', n: { ar: 'دفتر التنقيط', en: 'Grading Notebook', fr: 'Cahier de Notes' } },
    { k: 'supervised_doc', icon: 'FileCheck2', n: { ar: 'الوثيقة الموجهة', en: 'Supervised Document', fr: 'Document Encadré' } },
  ].forEach((d, idx) => {
    pushNode({
      id: sid(`sec_02_${d.k}`),
      parentId: sid('sec_02'),
      kind: 'subsection',
      featureType: d.k === 'grading_nb' ? 'grading_notebook' : 'standard',
      names: d.n,
      icon: d.icon,
      accentColor: CARD_ACCENT_CYCLE[idx % CARD_ACCENT_CYCLE.length],
      order: idx + 1,
    });
  });

  // 3. Assignments and exams
  pushNode({
    id: sid('sec_03'),
    parentId: null,
    kind: 'main',
    featureType: 'assignments_exams',
    names: { ar: 'الفروض والاختبارات', en: 'Assignments & Exams', fr: 'Devoirs & Examens' },
    icon: 'ClipboardCheck',
    accentColor: CARD_ACCENT_CYCLE[1],
    order: 3,
  });
  // 3.1 Diagnostic assessment
  const diagId = sid('sec_03_diag');
  pushNode({
    id: diagId,
    parentId: sid('sec_03'),
    kind: 'subsection',
    featureType: 'assignments_exams',
    names: { ar: 'التقويم التشخيصي', en: 'Diagnostic Assessment', fr: 'Évaluation Diagnostique' },
    icon: 'Stethoscope',
    accentColor: '#b45309',
    order: 1,
  });
  LEVELS.forEach((lvl, li) => {
    const lId = sid(`sec_03_diag_${lvl.code}`);
    pushNode({
      id: lId,
      parentId: diagId,
      kind: 'level',
      featureType: 'assignments_exams',
      names: lvl.names,
      icon: 'GraduationCap',
      accentColor: '#b45309',
      order: li + 1,
      levelCode: lvl.code,
    });
  });

  // 3.2 Assignments (level -> dynamic subject -> Term 1, 2, 3)
  const assignId = sid('sec_03_assign');
  pushNode({
    id: assignId,
    parentId: sid('sec_03'),
    kind: 'subsection',
    featureType: 'assignments_exams',
    names: { ar: 'الفروض المحروسة', en: 'Assignments', fr: 'Devoirs Surveillés' },
    icon: 'PenTool',
    accentColor: '#b45309',
    order: 2,
  });
  LEVELS.forEach((lvl, li) => {
    const lId = sid(`sec_03_assign_${lvl.code}`);
    pushNode({
      id: lId,
      parentId: assignId,
      kind: 'level',
      featureType: 'assignments_exams',
      names: lvl.names,
      icon: 'GraduationCap',
      accentColor: '#b45309',
      order: li + 1,
      levelCode: lvl.code,
    });
  });

  // 3.3 Term exams (level -> dynamic subject -> term, linked to model solution)
  const examsId = sid('sec_03_exams');
  pushNode({
    id: examsId,
    parentId: sid('sec_03'),
    kind: 'subsection',
    featureType: 'assignments_exams',
    names: { ar: 'الاختبارات الفصلية', en: 'Term Exams', fr: 'Compositions Trimestrielles' },
    icon: 'FileCheck2',
    accentColor: '#b45309',
    order: 3,
  });
  LEVELS.forEach((lvl, li) => {
    const lId = sid(`sec_03_exams_${lvl.code}`);
    pushNode({
      id: lId,
      parentId: examsId,
      kind: 'level',
      featureType: 'assignments_exams',
      names: lvl.names,
      icon: 'GraduationCap',
      accentColor: '#b45309',
      order: li + 1,
      levelCode: lvl.code,
    });
  });

  // 3.4 Middle School Certificate exams (BEM)
  const bemId = sid('sec_03_bem');
  pushNode({
    id: bemId,
    parentId: sid('sec_03'),
    kind: 'subsection',
    featureType: 'assignments_exams',
    names: { ar: 'مواضيع شهادة التعليم المتوسط', en: 'Middle School Certificate (BEM)', fr: 'Sujets BEM' },
    icon: 'Award',
    accentColor: '#b45309',
    order: 4,
  });

  // 3.5 Remedial exam
  const remId = sid('sec_03_remedial');
  pushNode({
    id: remId,
    parentId: sid('sec_03'),
    kind: 'subsection',
    featureType: 'assignments_exams',
    names: { ar: 'الاختبار الاستدراكي', en: 'Remedial Exams', fr: 'Examens de Rattrapage' },
    icon: 'RefreshCcw',
    accentColor: '#b45309',
    order: 5,
  });

  // 4. Pedagogical training
  pushNode({
    id: sid('sec_04'),
    parentId: null,
    kind: 'main',
    names: { ar: 'التكوين البيداغوجي', en: 'Pedagogical Training', fr: 'Formation Pédagogique' },
    icon: 'Compass',
    accentColor: CARD_ACCENT_CYCLE[2],
    order: 4,
  });
  [
    { k: 'internal', n: { ar: 'الندوات الداخلية', en: 'Internal Seminars', fr: 'Séminaires Internes' } },
    { k: 'exam_guide', n: { ar: 'دليل بناء الاختبار', en: 'Exam-Building Guide', fr: 'Guide d’Élaboration des Examens' } },
    { k: 'mentoring', n: { ar: 'مرافقة الأستاذ المتربص', en: 'Mentoring Trainee Teacher', fr: 'Accompagnement du Stagiaire' } },
    { k: 'principal_comp', n: { ar: 'مسابقة أستاذ رئيسي', en: 'Principal Teacher Competition', fr: 'Concours Professeur Principal' } },
    { k: 'trainer_comp', n: { ar: 'مسابقة أستاذ مكون', en: 'Trainer Teacher Competition', fr: 'Concours Professeur Formateur' } },
  ].forEach((t, idx) => {
    pushNode({
      id: sid(`sec_04_${t.k}`),
      parentId: sid('sec_04'),
      kind: 'subsection',
      names: t.n,
      icon: 'BookOpenCheck',
      accentColor: CARD_ACCENT_CYCLE[2],
      order: idx + 1,
    });
  });

  // 5. Supporting books
  pushNode({
    id: sid('sec_05'),
    parentId: null,
    kind: 'main',
    names: { ar: 'الكتب الداعمة', en: 'Supporting Books', fr: 'Manuels & Livres de Soutien' },
    icon: 'Library',
    accentColor: CARD_ACCENT_CYCLE[3],
    order: 5,
  });
  const sec5MiscId = sid('sec_05_misc');
  pushNode({
    id: sec5MiscId,
    parentId: sid('sec_05'),
    kind: 'subsection',
    names: { ar: 'متفرقات', en: 'Miscellaneous', fr: 'Divers' },
    icon: 'FolderOpen',
    accentColor: '#0369a1',
    order: 100,
  });
  [
    { k: 'summaries', n: { ar: 'ملخصات', en: 'Summaries', fr: 'Résumés' } },
    { k: 'glossaries', n: { ar: 'مسارد ومصطلحات', en: 'Glossaries', fr: 'Glossaires' } },
  ].forEach((m, mi) => {
    pushNode({
      id: sid(`sec_05_misc_${m.k}`),
      parentId: sec5MiscId,
      kind: 'subsection',
      names: m.n,
      icon: 'FileText',
      accentColor: '#0369a1',
      order: mi + 1,
    });
  });

  // 6. Teaching aids
  pushNode({
    id: sid('sec_06'),
    parentId: null,
    kind: 'main',
    names: { ar: 'الوسائل التعليمية', en: 'Teaching Aids', fr: 'Supports Pédagogiques' },
    icon: 'Map',
    accentColor: CARD_ACCENT_CYCLE[4],
    order: 6,
  });
  [
    { k: 'mindmaps', n: { ar: 'خرائط ذهنية', en: 'Mind Maps', fr: 'Cartes Mentales' }, i: 'Network' },
    { k: 'geomaps', n: { ar: 'خرائط جغرافية', en: 'Geographic Maps', fr: 'Cartes Géographiques' }, i: 'MapPin' },
    { k: 'histmaps', n: { ar: 'خرائط تاريخية', en: 'Historical Maps', fr: 'Cartes Historiques' }, i: 'Compass' },
    { k: 'pictures', n: { ar: 'صور توضيحية', en: 'Pictures', fr: 'Illustrations' }, i: 'Image' },
  ].forEach((a, ai) => {
    const aId = sid(`sec_06_${a.k}`);
    pushNode({
      id: aId,
      parentId: sid('sec_06'),
      kind: 'subsection',
      names: a.n,
      icon: a.i,
      accentColor: '#15803d',
      order: ai + 1,
    });
    LEVELS.forEach((lvl, li) => {
      pushNode({
        id: sid(`sec_06_${a.k}_${lvl.code}`),
        parentId: aId,
        kind: 'level',
        names: lvl.names,
        icon: a.i,
        accentColor: '#15803d',
        order: li + 1,
        levelCode: lvl.code,
      });
    });
  });
  const blankMapsId = sid('sec_06_blankmaps');
  pushNode({
    id: blankMapsId,
    parentId: sid('sec_06'),
    kind: 'subsection',
    names: { ar: 'خرائط صماء', en: 'Blank Maps', fr: 'Cartes Muettes' },
    icon: 'Globe2',
    accentColor: '#15803d',
    order: 5,
  });
  [
    { k: 'africa', n: { ar: 'إفريقيا', en: 'Africa', fr: 'Afrique' } },
    { k: 'asia', n: { ar: 'آسيا', en: 'Asia', fr: 'Asie' } },
    { k: 'europe', n: { ar: 'أوروبا', en: 'Europe', fr: 'Europe' } },
    { k: 'americas', n: { ar: 'الأمريكتان', en: 'Americas', fr: 'Amériques' } },
    { k: 'oceania', n: { ar: 'أوقيانوسيا', en: 'Oceania', fr: 'Océanie' } },
  ].forEach((c, ci) => {
    pushNode({
      id: sid(`sec_06_blankmaps_${c.k}`),
      parentId: blankMapsId,
      kind: 'subsection',
      names: c.n,
      icon: 'Map',
      accentColor: '#15803d',
      order: ci + 1,
    });
  });

  // 7. Administrative documents
  pushNode({
    id: sid('sec_07'),
    parentId: null,
    kind: 'main',
    names: { ar: 'الوثائق الإدارية', en: 'Administrative Documents', fr: 'Documents Administratifs' },
    icon: 'Briefcase',
    accentColor: CARD_ACCENT_CYCLE[5],
    order: 7,
  });
  [
    { k: 'minutes', n: { ar: 'محاضر الاجتماعات', en: 'Meeting Minutes', fr: 'Procès-Verbaux' } },
    { k: 'requests', n: { ar: 'الطلبات الخطية', en: 'Written Requests', fr: 'Demandes Manuscrites' } },
    { k: 'reports', n: { ar: 'التقارير البيداغوجية', en: 'Pedagogical Reports', fr: 'Rapports Pédagogiques' } },
  ].forEach((ad, idx) => {
    pushNode({
      id: sid(`sec_07_${ad.k}`),
      parentId: sid('sec_07'),
      kind: 'subsection',
      names: ad.n,
      icon: 'FileText',
      accentColor: CARD_ACCENT_CYCLE[5],
      order: idx + 1,
    });
  });

  // 8. Student lists (Excel)
  pushNode({
    id: sid('sec_08'),
    parentId: null,
    kind: 'main',
    featureType: 'student_lists',
    names: { ar: 'قوائم التلاميذ (Excel)', en: 'Student Lists (Excel)', fr: 'Listes des Élèves (Excel)' },
    icon: 'Table',
    accentColor: CARD_ACCENT_CYCLE[6],
    order: 8,
  });
  LEVELS.forEach((lvl, li) => {
    pushNode({
      id: sid(`sec_08_${lvl.code}`),
      parentId: sid('sec_08'),
      kind: 'level',
      featureType: 'student_lists',
      names: lvl.names,
      icon: 'Users',
      accentColor: CARD_ACCENT_CYCLE[6],
      order: li + 1,
      levelCode: lvl.code,
    });
  });

  // 9. National celebrations
  pushNode({
    id: sid('sec_09'),
    parentId: null,
    kind: 'main',
    names: { ar: 'الأعياد الوطنية', en: 'National Celebrations', fr: 'Fêtes Nationales' },
    icon: 'Flag',
    accentColor: CARD_ACCENT_CYCLE[7],
    order: 9,
  });
  [
    { k: 'anthems', n: { ar: 'الأناشيد الوطنية', en: 'National Anthems', fr: 'Hymnes Nationaux' } },
    { k: 'events', n: { ar: 'المناسبات والمشاريع المدرسية', en: 'School Events & Projects', fr: 'Événements & Projets Scolaires' } },
    { k: 'programs', n: { ar: 'تقارير وبرامج الاحتفالات', en: 'Celebration Reports & Programs', fr: 'Rapports & Programmes' } },
  ].forEach((nc, idx) => {
    pushNode({
      id: sid(`sec_09_${nc.k}`),
      parentId: sid('sec_09'),
      kind: 'subsection',
      names: nc.n,
      icon: 'Sparkles',
      accentColor: CARD_ACCENT_CYCLE[7],
      order: idx + 1,
    });
  });

  // 10. Audio-visual
  pushNode({
    id: sid('sec_10'),
    parentId: null,
    kind: 'main',
    featureType: 'audiovisual',
    names: { ar: 'السمعي البصري', en: 'Audio-Visual', fr: 'Audiovisuel' },
    icon: 'Film',
    accentColor: CARD_ACCENT_CYCLE[0],
    order: 10,
  });
  [
    { k: 'tv_yt', n: { ar: 'القناة التلفزيونية ويوتيوب', en: 'TV Channel & YouTube Videos', fr: 'Chaîne TV & Vidéos YouTube' }, i: 'Youtube' },
    { k: 'presentations', n: { ar: 'العروض التقديمية', en: 'Presentations', fr: 'Présentations' }, i: 'Presentation' },
    { k: 'ai_videos', n: { ar: 'فيديوهات مولّدة بالذكاء الاصطناعي', en: 'AI-Generated Videos', fr: 'Vidéos Générées par IA' }, i: 'Clapperboard' },
  ].forEach((av, ai) => {
    const avId = sid(`sec_10_${av.k}`);
    pushNode({
      id: avId,
      parentId: sid('sec_10'),
      kind: 'subsection',
      featureType: 'audiovisual',
      names: av.n,
      icon: av.i,
      accentColor: CARD_ACCENT_CYCLE[0],
      order: ai + 1,
    });
    LEVELS.forEach((lvl, li) => {
      pushNode({
        id: sid(`sec_10_${av.k}_${lvl.code}`),
        parentId: avId,
        kind: 'level',
        featureType: 'audiovisual',
        names: lvl.names,
        icon: av.i,
        accentColor: CARD_ACCENT_CYCLE[0],
        order: li + 1,
        levelCode: lvl.code,
      });
    });
  });

  // 11. Certificates
  pushNode({
    id: sid('sec_11'),
    parentId: null,
    kind: 'main',
    names: { ar: 'الشهادات', en: 'Certificates', fr: 'Attestations & Diplômes' },
    icon: 'Award',
    accentColor: CARD_ACCENT_CYCLE[1],
    order: 11,
  });
  [
    { k: 'motivational', n: { ar: 'شهادات تحفيزية', en: 'Motivational Certificates', fr: 'Certificats de Motivation' } },
    { k: 'activities', n: { ar: 'المشاركة في الأنشطة المدرسية', en: 'School Activity Participation', fr: 'Participation aux Activités' } },
    { k: 'bem_certs', n: { ar: 'شهادات التعليم المتوسط', en: 'Middle School Certificates', fr: 'Diplômes BEM' } },
  ].forEach((c, idx) => {
    pushNode({
      id: sid(`sec_11_${c.k}`),
      parentId: sid('sec_11'),
      kind: 'subsection',
      names: c.n,
      icon: 'Medal',
      accentColor: CARD_ACCENT_CYCLE[1],
      order: idx + 1,
    });
  });

  // 12. Miscellaneous files
  pushNode({
    id: sid('sec_12'),
    parentId: null,
    kind: 'main',
    names: { ar: 'ملفات متنوعة', en: 'Miscellaneous Files', fr: 'Fichiers Divers' },
    icon: 'FolderArchive',
    accentColor: CARD_ACCENT_CYCLE[2],
    order: 12,
  });
  pushNode({
    id: sid('sec_12_circulars'),
    parentId: sid('sec_12'),
    kind: 'subsection',
    names: { ar: 'المناشير الوزارية', en: 'Ministerial Circulars', fr: 'Circulaires Ministérielles' },
    icon: 'ScrollText',
    accentColor: '#0284c7',
    order: 1,
  });
  pushNode({
    id: sid('sec_12_curricula'),
    parentId: sid('sec_12'),
    kind: 'subsection',
    names: { ar: 'المناهج الدراسية', en: 'Curricula', fr: 'Programmes Scolaires' },
    icon: 'BookCopy',
    accentColor: '#0284c7',
    order: 2,
  });
  pushNode({
    id: sid('sec_12_journal'),
    parentId: sid('sec_12'),
    kind: 'subsection',
    featureType: 'daily_journal',
    names: { ar: 'اليوميات المدرسية', en: 'Daily Journal', fr: 'Journal Quotidien' },
    icon: 'CalendarDays',
    accentColor: '#0284c7',
    order: 3,
  });

  // 13. Seminars
  pushNode({
    id: sid('sec_13'),
    parentId: null,
    kind: 'main',
    featureType: 'seminars',
    names: { ar: 'الندوات', en: 'Seminars', fr: 'Séminaires' },
    icon: 'Presentation',
    accentColor: CARD_ACCENT_CYCLE[3],
    order: 13,
  });
  pushNode({
    id: sid('sec_13_internal'),
    parentId: sid('sec_13'),
    kind: 'subsection',
    featureType: 'seminars',
    names: { ar: 'ندوات داخلية', en: 'Internal Seminars', fr: 'Séminaires Internes' },
    icon: 'Users',
    accentColor: CARD_ACCENT_CYCLE[3],
    order: 1,
  });
  pushNode({
    id: sid('sec_13_external'),
    parentId: sid('sec_13'),
    kind: 'subsection',
    featureType: 'seminars',
    names: { ar: 'ندوات خارجية', en: 'External Seminars', fr: 'Séminaires Externes' },
    icon: 'Building2',
    accentColor: CARD_ACCENT_CYCLE[3],
    order: 2,
  });

  // 14. Discussion forum and chat
  pushNode({
    id: sid('sec_14'),
    parentId: null,
    kind: 'main',
    featureType: 'forum_chat',
    names: { ar: 'منتدى النقاش والمحادثة', en: 'Forum & Chat', fr: 'Forum & Messagerie' },
    icon: 'MessageSquare',
    accentColor: CARD_ACCENT_CYCLE[4],
    order: 14,
  });

  return nodes;
}
