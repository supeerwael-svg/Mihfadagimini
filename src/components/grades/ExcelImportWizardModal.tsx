import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, X } from 'lucide-react';
import { useI18n } from '@/src/i18n/I18nContext';
import { services } from '@/src/services';
import type { BulkGradeImportRow, ParsedExcelSheetPreview } from '@/src/services/GradesService';
import type { ClassRoomRecord, GradeSubjectKey, UserRecord } from '@/src/types/models';
import type { ServiceContext } from '@/src/types/services';

interface ExcelImportWizardModalProps {
  open: boolean;
  blob: Blob | null;
  fileName: string;
  ctx: ServiceContext;
  user: UserRecord;
  classRoom: ClassRoomRecord;
  termNumber: 1 | 2 | 3;
  subjectKey: GradeSubjectKey;
  maxGrade: number;
  initialMode?: 'create_or_update' | 'update_only';
  onClose: () => void;
  onImported: () => Promise<void>;
}

export const ExcelImportWizardModal: React.FC<ExcelImportWizardModalProps> = ({
  open,
  blob,
  fileName,
  ctx,
  user,
  classRoom,
  termNumber,
  subjectKey,
  maxGrade,
  initialMode = 'create_or_update',
  onClose,
  onImported,
}) => {
  const { t } = useI18n();
  const [preview, setPreview] = useState<ParsedExcelSheetPreview | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [lastNameCol, setLastNameCol] = useState(-1);
  const [firstNameCol, setFirstNameCol] = useState(-1);
  const [fullNameCol, setFullNameCol] = useState(-1);
  const [continuousCol, setContinuousCol] = useState(-1);
  const [assignmentCol, setAssignmentCol] = useState(-1);
  const [examCol, setExamCol] = useState(-1);
  const [mode, setMode] = useState<'create_or_update' | 'update_only'>(initialMode);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    addedStudents: number;
    updatedGrades: number;
    skippedDuplicates: number;
    unmatchedNames: string[];
  } | null>(null);

  useEffect(() => {
    if (!open || !blob) return;
    setSummary(null);
    setMode(initialMode);
    services.grades.parseExcelOrCsvForWizard(blob).then((parsed) => {
      setPreview(parsed);
      setSheetName(parsed.sheetNames[0] || '');
      setHeaderRowIdx(parsed.detectedHeaderRow);
      setLastNameCol(parsed.suggestedMapping.lastNameCol);
      setFirstNameCol(parsed.suggestedMapping.firstNameCol);
      setFullNameCol(parsed.suggestedMapping.fullNameCol);
      setContinuousCol(parsed.suggestedMapping.continuousCol);
      setAssignmentCol(parsed.suggestedMapping.assignmentCol);
      setExamCol(parsed.suggestedMapping.examCol);
    });
  }, [open, blob, initialMode]);

  const activeRows = useMemo(() => {
    if (!preview || !sheetName) return [];
    return preview.sheets[sheetName] || [];
  }, [preview, sheetName]);

  const headerCells = activeRows[headerRowIdx] || [];
  const maxCols = useMemo(
    () => activeRows.reduce((m, r) => Math.max(m, r.length), headerCells.length),
    [activeRows, headerCells.length]
  );

  const parsedRecords = useMemo<BulkGradeImportRow[]>(() => {
    if (activeRows.length === 0) return [];
    const out: BulkGradeImportRow[] = [];
    for (let r = headerRowIdx + 1; r < activeRows.length; r++) {
      const row = activeRows[r] || [];
      let last = lastNameCol >= 0 ? (row[lastNameCol] || '').trim() : '';
      let first = firstNameCol >= 0 ? (row[firstNameCol] || '').trim() : '';
      if ((!last && !first) && fullNameCol >= 0) {
        const full = (row[fullNameCol] || '').trim();
        if (full) {
          const parts = full.split(/\s+/);
          last = parts[0] || '';
          first = parts.slice(1).join(' ').trim();
        }
      }
      if (!last && !first) continue;

      const parseCol = (colIdx: number) => {
        if (colIdx < 0) return undefined;
        const raw = (row[colIdx] || '').trim();
        if (!raw) return undefined;
        return services.grades.parseGradeInput(raw, maxGrade) ?? undefined;
      };

      out.push({
        lastName: last,
        firstName: first,
        continuous: parseCol(continuousCol),
        assignment: parseCol(assignmentCol),
        exam: parseCol(examCol),
      });
    }
    return out;
  }, [
    activeRows,
    headerRowIdx,
    lastNameCol,
    firstNameCol,
    fullNameCol,
    continuousCol,
    assignmentCol,
    examCol,
    maxGrade,
  ]);

  if (!open) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const res = await services.grades.bulkImportStudentsAndGrades(ctx, classRoom.id, parsedRecords, {
        termNumber,
        subjectKey,
        mode,
        actorId: user.id,
        actorName: user.displayName,
      });
      setSummary(res);
      await onImported();
    } finally {
      setBusy(false);
    }
  };

  const colOptions = Array.from({ length: Math.max(maxCols, 1) }, (_, idx) => ({
    idx,
    label: headerCells[idx] ? `${idx + 1}. ${headerCells[idx]}` : `Col ${idx + 1}`,
  }));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden">
        <header className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-[var(--color-primary)] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">{t.grades.importWizardTitle}</h3>
              <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                {fileName} · {classRoom.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {summary ? (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <div className="font-extrabold text-sm">{t.grades.importSummary}</div>
                  <div className="tabular-nums">
                    + {summary.addedStudents} {t.grades.studentsCount} · {summary.updatedGrades} grades · {summary.skippedDuplicates} duplicates skipped
                  </div>
                </div>
              </div>

              {summary.unmatchedNames.length > 0 && (
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 text-xs space-y-1">
                  <div className="font-extrabold text-amber-800 dark:text-amber-300">
                    {t.grades.unmatchedWarning} ({summary.unmatchedNames.length})
                  </div>
                  <div className="text-[var(--color-text-muted)]">
                    {summary.unmatchedNames.slice(0, 15).join(' · ')}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[46px] rounded-2xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-sm font-bold"
              >
                {t.common.close}
              </button>
            </div>
          ) : (
            <>
              {preview && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                      {t.grades.sheetSelect}
                    </label>
                    <select
                      value={sheetName}
                      onChange={(e) => {
                        const s = e.target.value;
                        setSheetName(s);
                        const det = services.grades.detectHeaderAndMapping(preview.sheets[s] || []);
                        setHeaderRowIdx(det.headerRow);
                        setLastNameCol(det.mapping.lastNameCol);
                        setFirstNameCol(det.mapping.firstNameCol);
                        setFullNameCol(det.mapping.fullNameCol);
                        setContinuousCol(det.mapping.continuousCol);
                        setAssignmentCol(det.mapping.assignmentCol);
                        setExamCol(det.mapping.examCol);
                      }}
                      className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold"
                    >
                      {preview.sheetNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                      {t.grades.headerRow}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(1, activeRows.length)}
                      value={headerRowIdx + 1}
                      onChange={(e) => setHeaderRowIdx(Math.max(0, Number(e.target.value) - 1))}
                      className="w-full min-h-[42px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs tabular-nums"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.grades.mapLastName}
                  </label>
                  <select
                    value={lastNameCol}
                    onChange={(e) => setLastNameCol(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                  >
                    <option value={-1}>—</option>
                    {colOptions.map((c) => (
                      <option key={c.idx} value={c.idx}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.grades.mapFirstName}
                  </label>
                  <select
                    value={firstNameCol}
                    onChange={(e) => setFirstNameCol(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                  >
                    <option value={-1}>—</option>
                    {colOptions.map((c) => (
                      <option key={c.idx} value={c.idx}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.grades.mapFullName}
                  </label>
                  <select
                    value={fullNameCol}
                    onChange={(e) => setFullNameCol(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                  >
                    <option value={-1}>—</option>
                    {colOptions.map((c) => (
                      <option key={c.idx} value={c.idx}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.grades.mapContinuous}
                  </label>
                  <select
                    value={continuousCol}
                    onChange={(e) => setContinuousCol(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                  >
                    <option value={-1}>—</option>
                    {colOptions.map((c) => (
                      <option key={c.idx} value={c.idx}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.grades.mapAssignment}
                  </label>
                  <select
                    value={assignmentCol}
                    onChange={(e) => setAssignmentCol(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                  >
                    <option value={-1}>—</option>
                    {colOptions.map((c) => (
                      <option key={c.idx} value={c.idx}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[var(--color-text-muted)] mb-1">
                    {t.grades.mapExam}
                  </label>
                  <select
                    value={examCol}
                    onChange={(e) => setExamCol(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-xs"
                  >
                    <option value={-1}>—</option>
                    {colOptions.map((c) => (
                      <option key={c.idx} value={c.idx}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 text-xs font-semibold">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === 'create_or_update'}
                    onChange={() => setMode('create_or_update')}
                    className="accent-[var(--color-primary)]"
                  />
                  <span>{t.grades.importModeCreate}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === 'update_only'}
                    onChange={() => setMode('update_only')}
                    className="accent-[var(--color-primary)]"
                  />
                  <span>{t.grades.importModeUpdate}</span>
                </label>
              </div>

              <div>
                <div className="text-xs font-extrabold mb-1.5 tabular-nums">
                  {t.grades.previewRows} ({parsedRecords.length})
                </div>
                <div className="overflow-auto max-h-52 rounded-2xl border border-[var(--color-border)]">
                  <table className="w-full text-xs text-start border-collapse tabular-nums">
                    <thead className="bg-[var(--color-background)] font-bold">
                      <tr>
                        <th className="p-2 border-b border-[var(--color-border)]">#</th>
                        <th className="p-2 border-b border-[var(--color-border)]">{t.grades.lastName}</th>
                        <th className="p-2 border-b border-[var(--color-border)]">{t.grades.firstName}</th>
                        <th className="p-2 border-b border-[var(--color-border)]">{t.grades.continuous}</th>
                        <th className="p-2 border-b border-[var(--color-border)]">{t.grades.assignment}</th>
                        <th className="p-2 border-b border-[var(--color-border)]">{t.grades.exam}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {parsedRecords.slice(0, 6).map((rec, idx) => (
                        <tr key={idx}>
                          <td className="p-2">{idx + 1}</td>
                          <td className="p-2 font-semibold">{rec.lastName}</td>
                          <td className="p-2 font-semibold">{rec.firstName}</td>
                          <td className="p-2">{services.grades.formatCellDisplay(rec.continuous) || '—'}</td>
                          <td className="p-2">{services.grades.formatCellDisplay(rec.assignment) || '—'}</td>
                          <td className="p-2">{services.grades.formatCellDisplay(rec.exam) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {!summary && (
          <footer className="px-5 py-3.5 border-t border-[var(--color-border)] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 rounded-xl border border-[var(--color-border)] text-xs font-bold"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={busy || parsedRecords.length === 0}
              onClick={handleConfirm}
              className="min-h-[42px] px-5 rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)] text-xs font-bold disabled:opacity-50"
            >
              {busy ? t.common.loading : `${t.grades.confirmImport} (${parsedRecords.length})`}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};
