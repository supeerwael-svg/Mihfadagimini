import type {
  BoardSide,
  SeatingPlanRecord,
  StudentRecord,
} from '@/src/types/models';
import type { StudentBehaviorSummary } from '@/src/services/BehaviorService';

interface ExportPlanParams {
  plan: SeatingPlanRecord;
  students: StudentRecord[];
  schoolName: string;
  className: string;
  subjectName: string;
  termLabel: string;
  hideNames: boolean;
  isRtl: boolean;
  frontLabel: string;
  boardLabel: string;
  emptyLabel: string;
  summaries?: Map<string, StudentBehaviorSummary>;
  showScores?: boolean;
}

function getEffectiveBoardSide(plan: SeatingPlanRecord): BoardSide {
  if (plan.viewOrientation === 'teacher_desk') return plan.boardSide;
  if (plan.boardSide === 'top') return 'bottom';
  if (plan.boardSide === 'bottom') return 'top';
  if (plan.boardSide === 'left') return 'right';
  return 'left';
}

export function buildOrderedGrid(plan: SeatingPlanRecord) {
  const flipped = plan.viewOrientation === 'back_of_class';
  const rowOrder = Array.from({ length: plan.rows }, (_, i) =>
    flipped ? plan.rows - 1 - i : i
  );
  const colOrder = Array.from({ length: plan.cols }, (_, i) =>
    flipped ? plan.cols - 1 - i : i
  );
  const byPos = new Map(plan.desks.map((d) => [`${d.row}_${d.col}`, d]));
  return { rowOrder, colOrder, byPos, effectiveBoardSide: getEffectiveBoardSide(plan) };
}

export async function exportSeatingPlanPng(params: ExportPlanParams): Promise<void> {
  const { plan, students, hideNames, isRtl } = params;
  const studentMap = new Map(students.map((s, i) => [s.id, { student: s, num: i + 1 }]));
  const { rowOrder, colOrder, byPos, effectiveBoardSide } = buildOrderedGrid(plan);

  const cellW = 240;
  const cellH = 112;
  const gap = 16;
  const padX = 40;
  const headerH = 110;
  const boardBarH = effectiveBoardSide === 'top' || effectiveBoardSide === 'bottom' ? 60 : 0;
  const boardSideW = effectiveBoardSide === 'left' || effectiveBoardSide === 'right' ? 92 : 0;

  const gridW = colOrder.length * cellW + Math.max(0, colOrder.length - 1) * gap;
  const gridH = rowOrder.length * cellH + Math.max(0, rowOrder.length - 1) * gap;
  const width = padX * 2 + gridW + (boardSideW ? boardSideW + 20 : 0);
  const height = headerH + gridH + (boardBarH ? boardBarH + 24 : 0) + 52;

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(2, 2);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // Header bar
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(0, 0, width, 88);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Cairo, system-ui, sans-serif';
  ctx.textAlign = isRtl ? 'right' : 'left';
  const titleX = isRtl ? width - 28 : 28;
  ctx.fillText(`${params.className} — ${plan.name}`, titleX, 38);

  ctx.font = '600 14px Cairo, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  const subText = `${params.schoolName} · ${params.subjectName} · ${params.termLabel} · ${new Date().toISOString().slice(0, 10)}`;
  ctx.fillText(subText, titleX, 66);

  const gridOffsetX = padX + (effectiveBoardSide === 'left' ? boardSideW + 20 : 0);
  const gridOffsetY = headerH + (effectiveBoardSide === 'top' ? boardBarH + 16 : 0);

  // Draw Board / Front marker
  const drawBoardRect = (bx: number, by: number, bw: number, bh: number, vertical: boolean) => {
    ctx.fillStyle = '#dbeafe';
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 14);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 14px Cairo, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (vertical) {
      ctx.translate(bx + bw / 2, by + bh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`▲ ${params.boardLabel}`, 0, 0);
    } else {
      ctx.fillText(`▲ ${params.frontLabel}: ${params.boardLabel}`, bx + bw / 2, by + bh / 2);
    }
    ctx.restore();
  };

  if (effectiveBoardSide === 'top') {
    drawBoardRect(gridOffsetX, headerH, gridW, boardBarH, false);
  } else if (effectiveBoardSide === 'bottom') {
    drawBoardRect(gridOffsetX, gridOffsetY + gridH + 18, gridW, boardBarH, false);
  } else if (effectiveBoardSide === 'left') {
    drawBoardRect(padX, gridOffsetY, boardSideW, gridH, true);
  } else {
    drawBoardRect(gridOffsetX + gridW + 20, gridOffsetY, boardSideW, gridH, true);
  }

  // Desks & Seats
  rowOrder.forEach((rIdx, visR) => {
    colOrder.forEach((cIdx, visC) => {
      const desk = byPos.get(`${rIdx}_${cIdx}`);
      if (!desk || desk.isAisle) return;

      const x = gridOffsetX + visC * (cellW + gap);
      const y = gridOffsetY + visR * (cellH + gap);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, cellW, cellH, 14);
      ctx.fill();
      ctx.stroke();

      const seatCount = desk.seatsPerDesk;
      const seatGap = 6;
      const innerPad = 8;
      const seatW = (cellW - innerPad * 2 - seatGap * (seatCount - 1)) / seatCount;
      const seatH = cellH - innerPad * 2;

      for (let s = 0; s < seatCount; s++) {
        const sx = x + innerPad + s * (seatW + seatGap);
        const sy = y + innerPad;
        const sid = desk.studentIds[s];
        const info = sid ? studentMap.get(sid) : undefined;

        ctx.fillStyle = info ? '#eff6ff' : '#f1f5f9';
        ctx.strokeStyle = info ? '#93c5fd' : '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(sx, sy, seatW, seatH, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = info ? '#0f172a' : '#64748b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (!info) {
          ctx.font = '600 12px Cairo, system-ui, sans-serif';
          ctx.fillText(params.emptyLabel, sx + seatW / 2, sy + seatH / 2);
        } else if (hideNames) {
          ctx.font = 'bold 16px Cairo, system-ui, sans-serif';
          ctx.fillText(`#${info.num}`, sx + seatW / 2, sy + seatH / 2);
        } else {
          ctx.font = seatCount === 3 ? 'bold 11px Cairo, system-ui, sans-serif' : 'bold 12px Cairo, system-ui, sans-serif';
          const line1 = info.student.lastName;
          const line2 = info.student.firstName;
          ctx.fillText(line1, sx + seatW / 2, sy + seatH / 2 - 10, seatW - 8);
          ctx.font = seatCount === 3 ? '600 11px Cairo, system-ui, sans-serif' : '600 12px Cairo, system-ui, sans-serif';
          ctx.fillText(line2, sx + seatW / 2, sy + seatH / 2 + 10, seatW - 8);
        }

        if (info && params.showScores && params.summaries) {
          const sum = params.summaries.get(info.student.id);
          if (sum) {
            ctx.fillStyle = '#1e40af';
            ctx.font = 'bold 10px Cairo, system-ui, sans-serif';
            ctx.fillText(`${sum.suggestedGrade.toFixed(1)}`, sx + seatW / 2, sy + seatH - 10);
          }
        }
      }
    });
  });

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `seating_${params.className}_${new Date().toISOString().slice(0, 10)}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printSeatingPlanHtml(params: ExportPlanParams): void {
  const { plan, students, hideNames, isRtl } = params;
  const studentMap = new Map(students.map((s, i) => [s.id, { student: s, num: i + 1 }]));
  const { rowOrder, colOrder, byPos, effectiveBoardSide } = buildOrderedGrid(plan);

  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const boardHtml = `<div style="border:2px solid #1d4ed8;background:#eff6ff;color:#1e3a8a;border-radius:10px;padding:8px 14px;text-align:center;font-weight:800;font-size:13px;">
    ▲ ${escapeHtml(params.frontLabel)}: ${escapeHtml(params.boardLabel)}
  </div>`;

  const gridRowsHtml = rowOrder
    .map((rIdx) => {
      const cells = colOrder
        .map((cIdx) => {
          const desk = byPos.get(`${rIdx}_${cIdx}`);
          if (!desk || desk.isAisle) {
            return `<td style="border:none;padding:4px;"></td>`;
          }
          const seatsHtml = Array.from({ length: desk.seatsPerDesk }, (_, sIdx) => {
            const sid = desk.studentIds[sIdx];
            const info = sid ? studentMap.get(sid) : undefined;
            const text = !info
              ? escapeHtml(params.emptyLabel)
              : hideNames
              ? `#${info.num}`
              : `<strong>${escapeHtml(info.student.lastName)}</strong><br/><span>${escapeHtml(info.student.firstName)}</span>`;
            return `<div style="flex:1;border:1px solid ${info ? '#93c5fd' : '#cbd5e1'};background:${
              info ? '#f8fafc' : '#f1f5f9'
            };border-radius:8px;padding:6px 4px;text-align:center;font-size:11px;line-height:1.25;">${text}</div>`;
          }).join('');
          return `<td style="border:1.5px solid #94a3b8;border-radius:10px;padding:6px;background:#fff;vertical-align:top;">
            <div style="display:flex;gap:4px;">${seatsHtml}</div>
          </td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html dir="${isRtl ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(params.className)} - ${escapeHtml(plan.name)}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    body { font-family: Cairo, system-ui, sans-serif; color: #0f172a; margin: 0; }
    table { width: 100%; border-collapse: separate; border-spacing: 8px; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:12px;">
    <div>
      <div style="font-size:16px;font-weight:800;">${escapeHtml(params.schoolName)}</div>
      <div style="font-size:12px;color:#475569;">${escapeHtml(params.subjectName)} · ${escapeHtml(params.termLabel)}</div>
    </div>
    <div style="text-align:end;">
      <div style="font-size:15px;font-weight:800;">${escapeHtml(params.className)} — ${escapeHtml(plan.name)}</div>
      <div style="font-size:11px;color:#475569;">${new Date().toISOString().slice(0, 10)}</div>
    </div>
  </div>
  ${effectiveBoardSide === 'top' || effectiveBoardSide === 'left' ? boardHtml : ''}
  <table>${gridRowsHtml}</table>
  ${effectiveBoardSide === 'bottom' || effectiveBoardSide === 'right' ? boardHtml : ''}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 1500);
  }, 250);
}
