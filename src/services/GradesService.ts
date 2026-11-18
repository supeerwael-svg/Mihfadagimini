import * as XLSX from 'xlsx';
import type {
  ClassRoomRecord,
  GradeCellMark,
  GradeCellValue,
  GradeHistoryRecord,
  GradeRecord,
  GradeSubjectKey,
  GradingConfigRecord,
  GradingFormulaRule,
  MiddleSchoolLevel,
  StudentRecord,
  UserRecord,
} from '@/src/types/models';
import type { IDataAdapter, ServiceContext } from '@/src/types/services';
import { generateId, normalizeSearchText } from './crypto';

export const DEFAULT_FORMULA_RULE: GradingFormulaRule = {
  key: 'default',
  continuousWeight: 1,
  assignmentWeight: 1,
  examWeight: 2,
  maxGrade: 20,
  annualTermWeights: [1, 1, 1],
};

export const EMPTY_CELL: GradeCellValue = { score: null, mark: null };

export interface TermAverageResult {
  value: number | null;
  status: 'complete' | 'incomplete' | 'exempt';
}

export interface ParsedExcelSheetPreview {
  sheetNames: string[];
  sheets: Record<string, string[][]>;
  detectedHeaderRow: number;
  suggestedMapping: {
    lastNameCol: number;
    firstNameCol: number;
    fullNameCol: number;
    continuousCol: number;
    assignmentCol: number;
    examCol: number;
  };
}

export interface BulkGradeImportRow {
  lastName: string;
  firstName: string;
  continuous?: GradeCellValue;
  assignment?: GradeCellValue;
  exam?: GradeCellValue;
}

export class GradesService {
  constructor(private adapter: IDataAdapter) {}

  async getGradingConfig(ctx: ServiceContext): Promise<GradingConfigRecord> {
    const all = await this.adapter.queryByYear('gradingConfigs', ctx.academicYearId);
    if (all.length > 0) return all[0];

    const now = new Date().toISOString();
    const def: GradingConfigRecord = {
      id: generateId(),
      rules: { default: { ...DEFAULT_FORMULA_RULE } },
      allowReadOnlyViewByUserIds: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'local',
      ownerId: ctx.ownerId,
      schoolId: ctx.schoolId,
      academicYearId: ctx.academicYearId,
    };
    await this.adapter.put('gradingConfigs', def);
    return def;
  }

  async saveGradingConfig(config: GradingConfigRecord): Promise<GradingConfigRecord> {
    const updated: GradingConfigRecord = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    await this.adapter.put('gradingConfigs', updated);
    return updated;
  }

  async resetGradingConfig(config: GradingConfigRecord): Promise<GradingConfigRecord> {
    return this.saveGradingConfig({
      ...config,
      rules: { default: { ...DEFAULT_FORMULA_RULE } },
    });
  }

  resolveFormula(
    config: GradingConfigRecord | null,
    levelCode: MiddleSchoolLevel,
    subjectKey: GradeSubjectKey
  ): GradingFormulaRule {
    if (!config) return DEFAULT_FORMULA_RULE;
    return (
      config.rules[`${levelCode}__${subjectKey}`] ||
      config.rules[subjectKey] ||
      config.rules[levelCode] ||
      config.rules.default ||
      DEFAULT_FORMULA_RULE
    );
  }

  canUserViewGrades(
    user: UserRecord,
    config: GradingConfigRecord | null,
    classRoom: ClassRoomRecord
  ): boolean {
    if (user.role === 'banned') return false;
    if (user.role === 'primary_admin') return true;
    if (user.role === 'teacher_read') {
      return Boolean(config?.allowReadOnlyViewByUserIds.includes(user.id));
    }
    return (
      classRoom.ownerId === user.id ||
      user.assignedClasses.includes(classRoom.name) ||
      user.role === 'teacher_write'
    );
  }

  canUserEditGrades(user: UserRecord, isArchiveYear: boolean): boolean {
    if (isArchiveYear) return false;
    return user.role === 'primary_admin' || user.role === 'teacher_write';
  }

  async getGradesForClassTermSubject(
    academicYearId: string,
    classRoomId: string,
    termNumber: 1 | 2 | 3,
    subjectKey: GradeSubjectKey
  ): Promise<GradeRecord[]> {
    const all = await this.adapter.queryByYear('grades', academicYearId);
    return all.filter(
      (g) =>
        g.classRoomId === classRoomId &&
        g.termNumber === termNumber &&
        g.subjectKey === subjectKey
    );
  }

  async getGradesForClassAllTerms(
    academicYearId: string,
    classRoomId: string,
    subjectKey: GradeSubjectKey
  ): Promise<GradeRecord[]> {
    const all = await this.adapter.queryByYear('grades', academicYearId);
    return all.filter((g) => g.classRoomId === classRoomId && g.subjectKey === subjectKey);
  }

  async getAllGradesForYear(academicYearId: string): Promise<GradeRecord[]> {
    return this.adapter.queryByYear('grades', academicYearId);
  }

  formatCellDisplay(cell: GradeCellValue | undefined): string {
    if (!cell) return '';
    if (cell.mark === 'absent') return 'غ';
    if (cell.mark === 'excused') return 'معفى';
    if (cell.mark === 'not_graded') return '—';
    return cell.score !== null ? String(cell.score) : '';
  }

  parseGradeInput(raw: string, maxGrade = 20): GradeCellValue | null {
    const cleaned = raw.trim();
    if (!cleaned) return { score: null, mark: null };
    const norm = normalizeSearchText(cleaned);
    if (['غ', 'غائب', 'abs', 'absent', 'a'].includes(norm)) {
      return { score: null, mark: 'absent' };
    }
    if (['معفي', 'معفى', 'م', 'exc', 'excused', 'disp', 'dispense'].includes(norm)) {
      return { score: null, mark: 'excused' };
    }
    if (['—', '-', 'ng', 'غير منقط', 'non note'].includes(norm)) {
      return { score: null, mark: 'not_graded' };
    }
    const numStr = cleaned.replace(',', '.');
    const num = Number(numStr);
    if (Number.isNaN(num) || num < 0 || num > maxGrade) return null;
    return { score: Math.round(num * 100) / 100, mark: null };
  }

  calculateTermAverage(
    grade: GradeRecord | undefined,
    formula: GradingFormulaRule
  ): TermAverageResult {
    if (!grade) return { value: null, status: 'incomplete' };

    const components: Array<{ cell: GradeCellValue; weight: number }> = [
      { cell: grade.continuous, weight: formula.continuousWeight },
      { cell: grade.assignment, weight: formula.assignmentWeight },
      { cell: grade.exam, weight: formula.examWeight },
    ];

    let weightedSum = 0;
    let totalWeight = 0;
    let hasMissingUnmarked = false;
    let includedCount = 0;

    for (const c of components) {
      if (c.weight <= 0) continue;
      if (c.cell.mark === 'absent' || c.cell.mark === 'excused' || c.cell.mark === 'not_graded') {
        // Special marks are excluded without breaking the calculation
        continue;
      }
      if (c.cell.score === null) {
        hasMissingUnmarked = true;
        continue;
      }
      weightedSum += c.cell.score * c.weight;
      totalWeight += c.weight;
      includedCount++;
    }

    if (hasMissingUnmarked) {
      return { value: null, status: 'incomplete' };
    }
    if (includedCount === 0 || totalWeight === 0) {
      return { value: null, status: 'exempt' };
    }

    const avg = Math.round((weightedSum / totalWeight) * 100) / 100;
    return { value: avg, status: 'complete' };
  }

  calculateAnnualAverage(
    t1: TermAverageResult,
    t2: TermAverageResult,
    t3: TermAverageResult,
    formula: GradingFormulaRule
  ): TermAverageResult {
    const entries = [
      { res: t1, w: formula.annualTermWeights[0] ?? 1 },
      { res: t2, w: formula.annualTermWeights[1] ?? 1 },
      { res: t3, w: formula.annualTermWeights[2] ?? 1 },
    ];
    let sum = 0;
    let totalW = 0;
    let missing = false;
    for (const e of entries) {
      if (e.res.status === 'exempt') continue;
      if (e.res.status === 'incomplete' || e.res.value === null) {
        missing = true;
        continue;
      }
      sum += e.res.value * e.w;
      totalW += e.w;
    }
    if (missing) return { value: null, status: 'incomplete' };
    if (totalW === 0) return { value: null, status: 'exempt' };
    return { value: Math.round((sum / totalW) * 100) / 100, status: 'complete' };
  }

  async upsertGradeCell(
    ctx: ServiceContext,
    params: {
      studentId: string;
      studentName: string;
      classRoomId: string;
      termNumber: 1 | 2 | 3;
      subjectKey: GradeSubjectKey;
      field: 'continuous' | 'assignment' | 'exam';
      value: GradeCellValue;
      actorId: string;
      actorName: string;
    }
  ): Promise<GradeRecord> {
    const existingList = await this.getGradesForClassTermSubject(
      ctx.academicYearId,
      params.classRoomId,
      params.termNumber,
      params.subjectKey
    );
    const existing = existingList.find((g) => g.studentId === params.studentId);
    const now = new Date().toISOString();

    const prevCell: GradeCellValue = existing ? existing[params.field] : { ...EMPTY_CELL };
    const nextRecord: GradeRecord = existing
      ? {
          ...existing,
          [params.field]: params.value,
          updatedAt: now,
        }
      : {
          id: generateId(),
          studentId: params.studentId,
          classRoomId: params.classRoomId,
          termNumber: params.termNumber,
          subjectKey: params.subjectKey,
          continuous: { ...EMPTY_CELL },
          assignment: { ...EMPTY_CELL },
          exam: { ...EMPTY_CELL },
          [params.field]: params.value,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'local',
          ownerId: ctx.ownerId,
          schoolId: ctx.schoolId,
          academicYearId: ctx.academicYearId,
        };

    await this.adapter.put('grades', nextRecord);

    const oldStr = this.formatCellDisplay(prevCell) || '—';
    const newStr = this.formatCellDisplay(params.value) || '—';
    if (oldStr !== newStr) {
      const historyEntry: GradeHistoryRecord = {
        id: generateId(),
        gradeId: nextRecord.id,
        studentId: params.studentId,
        studentName: params.studentName,
        classRoomId: params.classRoomId,
        termNumber: params.termNumber,
        subjectKey: params.subjectKey,
        field: params.field,
        oldValue: oldStr,
        newValue: newStr,
        changedByUserId: params.actorId,
        changedByName: params.actorName,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'local',
        ownerId: ctx.ownerId,
        schoolId: ctx.schoolId,
        academicYearId: ctx.academicYearId,
      };
      await this.adapter.put('gradeHistory', historyEntry);
    }

    return nextRecord;
  }

  async listHistory(academicYearId: string, classRoomId?: string): Promise<GradeHistoryRecord[]> {
    const all = await this.adapter.queryByYear('gradeHistory', academicYearId);
    return all
      .filter((h) => !classRoomId || h.classRoomId === classRoomId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async parseExcelOrCsvForWizard(blob: Blob): Promise<ParsedExcelSheetPreview> {
    const buf = await blob.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets: Record<string, string[][]> = {};
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
      sheets[name] = rows.map((r) =>
        Array.isArray(r) ? r.map((cell) => (cell == null ? '' : String(cell).trim())) : []
      );
    }

    const firstSheetRows = sheets[wb.SheetNames[0]] || [];
    const { headerRow, mapping } = this.detectHeaderAndMapping(firstSheetRows);
    return {
      sheetNames: wb.SheetNames,
      sheets,
      detectedHeaderRow: headerRow,
      suggestedMapping: mapping,
    };
  }

  detectHeaderAndMapping(rows: string[][]): {
    headerRow: number;
    mapping: ParsedExcelSheetPreview['suggestedMapping'];
  } {
    let bestRow = 0;
    let bestScore = -1;
    let bestMapping: ParsedExcelSheetPreview['suggestedMapping'] = {
      lastNameCol: 0,
      firstNameCol: 1,
      fullNameCol: -1,
      continuousCol: -1,
      assignmentCol: -1,
      examCol: -1,
    };

    const maxScan = Math.min(rows.length, 15);
    for (let r = 0; r < maxScan; r++) {
      const row = rows[r] || [];
      const mapping = {
        lastNameCol: -1,
        firstNameCol: -1,
        fullNameCol: -1,
        continuousCol: -1,
        assignmentCol: -1,
        examCol: -1,
      };
      let score = 0;
      row.forEach((cell, cIdx) => {
        const n = normalizeSearchText(cell);
        if (!n) return;
        if (
          n.includes('الاسم واللقب') ||
          n.includes('اللقب والاسم') ||
          n === 'full name' ||
          n === 'nom et prenom' ||
          n === 'nom & prenom'
        ) {
          mapping.fullNameCol = cIdx;
          score += 3;
        } else if (
          n === 'اللقب' ||
          n.includes('لقب') ||
          n === 'nom' ||
          n.includes('last name') ||
          n === 'lastname' ||
          n === 'surname'
        ) {
          mapping.lastNameCol = cIdx;
          score += 3;
        } else if (
          n === 'الاسم' ||
          n.includes('اسم') ||
          n === 'prenom' ||
          n.includes('first name') ||
          n === 'firstname'
        ) {
          mapping.firstNameCol = cIdx;
          score += 3;
        } else if (
          n.includes('مراقبه') ||
          n.includes('تقويم') ||
          n.includes('continuous') ||
          n.includes('controle') ||
          n === 'cc'
        ) {
          mapping.continuousCol = cIdx;
          score += 2;
        } else if (
          n.includes('فرض') ||
          n.includes('assignment') ||
          n.includes('devoir')
        ) {
          mapping.assignmentCol = cIdx;
          score += 2;
        } else if (
          n.includes('اختبار') ||
          n.includes('امتحان') ||
          n.includes('exam') ||
          n.includes('composition')
        ) {
          mapping.examCol = cIdx;
          score += 2;
        }
      });

      if (score > bestScore) {
        bestScore = score;
        bestRow = r;
        bestMapping = mapping;
      }
    }

    if (bestScore <= 0 && rows.length > 0) {
      const colCount = rows[0]?.length || 0;
      bestMapping = {
        lastNameCol: colCount >= 1 ? 0 : -1,
        firstNameCol: colCount >= 2 ? 1 : -1,
        fullNameCol: -1,
        continuousCol: -1,
        assignmentCol: -1,
        examCol: -1,
      };
    }

    return { headerRow: bestRow, mapping: bestMapping };
  }

  async bulkImportStudentsAndGrades(
    ctx: ServiceContext,
    classRoomId: string,
    rows: BulkGradeImportRow[],
    options: {
      termNumber: 1 | 2 | 3;
      subjectKey: GradeSubjectKey;
      mode: 'create_or_update' | 'update_only';
      actorId: string;
      actorName: string;
    }
  ): Promise<{
    addedStudents: number;
    updatedGrades: number;
    skippedDuplicates: number;
    unmatchedNames: string[];
  }> {
    const existingStudentsAll = await this.adapter.queryByYear('students', ctx.academicYearId);
    const classStudents = existingStudentsAll
      .filter((s) => s.classRoomId === classRoomId)
      .sort((a, b) => a.order - b.order);

    const byKey = new Map<string, StudentRecord>();
    for (const s of classStudents) {
      byKey.set(
        `${normalizeSearchText(s.lastName)}|${normalizeSearchText(s.firstName)}`,
        s
      );
    }

    const existingGrades = await this.getGradesForClassTermSubject(
      ctx.academicYearId,
      classRoomId,
      options.termNumber,
      options.subjectKey
    );
    const gradeByStudentId = new Map(existingGrades.map((g) => [g.studentId, g]));

    let maxOrder = classStudents.reduce((m, s) => Math.max(m, s.order), 0);
    const now = new Date().toISOString();

    const newStudents: StudentRecord[] = [];
    const gradesToPut: GradeRecord[] = [];
    const seenInImport = new Set<string>();

    let skippedDuplicates = 0;
    let updatedGrades = 0;
    const unmatchedNames: string[] = [];

    for (const row of rows) {
      const last = row.lastName.trim();
      const first = row.firstName.trim();
      if (!last && !first) continue;

      const key = `${normalizeSearchText(last)}|${normalizeSearchText(first)}`;
      if (seenInImport.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seenInImport.add(key);

      let student = byKey.get(key);
      if (!student) {
        if (options.mode === 'update_only') {
          unmatchedNames.push(`${last} ${first}`.trim());
          continue;
        }
        maxOrder += 1;
        student = {
          id: generateId(),
          classRoomId,
          lastName: last,
          firstName: first,
          order: maxOrder,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          syncStatus: 'local',
          ownerId: ctx.ownerId,
          schoolId: ctx.schoolId,
          academicYearId: ctx.academicYearId,
        };
        byKey.set(key, student);
        newStudents.push(student);
      }

      const hasGradeValues = Boolean(row.continuous || row.assignment || row.exam);
      if (hasGradeValues) {
        const existingG = gradeByStudentId.get(student.id);
        const nextGrade: GradeRecord = existingG
          ? {
              ...existingG,
              continuous: row.continuous ?? existingG.continuous,
              assignment: row.assignment ?? existingG.assignment,
              exam: row.exam ?? existingG.exam,
              updatedAt: now,
            }
          : {
              id: generateId(),
              studentId: student.id,
              classRoomId,
              termNumber: options.termNumber,
              subjectKey: options.subjectKey,
              continuous: row.continuous ?? { ...EMPTY_CELL },
              assignment: row.assignment ?? { ...EMPTY_CELL },
              exam: row.exam ?? { ...EMPTY_CELL },
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              syncStatus: 'local',
              ownerId: ctx.ownerId,
              schoolId: ctx.schoolId,
              academicYearId: ctx.academicYearId,
            };
        gradesToPut.push(nextGrade);
        updatedGrades++;
      }
    }

    await this.adapter.bulkPut('students', newStudents);
    await this.adapter.bulkPut('grades', gradesToPut);

    return {
      addedStudents: newStudents.length,
      updatedGrades,
      skippedDuplicates,
      unmatchedNames,
    };
  }

  exportGradesWorkbook(params: {
    schoolName: string;
    className: string;
    termLabel: string;
    subjectLabel: string;
    teacherName: string;
    headers: string[];
    rows: Array<Array<string | number>>;
    fileName: string;
  }): void {
    const aoa: Array<Array<string | number>> = [
      [params.schoolName, '', params.className, params.termLabel],
      [params.subjectLabel, '', params.teacherName, new Date().toISOString().slice(0, 10)],
      [],
      params.headers,
      ...params.rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, params.className.slice(0, 30) || 'Grades');
    XLSX.writeFile(wb, params.fileName);
  }
}

export function markLabel(mark: GradeCellMark, lang: 'ar' | 'en' | 'fr'): string {
  if (mark === 'absent') return lang === 'ar' ? 'غ' : 'ABS';
  if (mark === 'excused') return lang === 'ar' ? 'معفى' : lang === 'fr' ? 'DISP' : 'EXC';
  if (mark === 'not_graded') return '—';
  return '';
}
