// XLSX generators — faithful near-verbatim port of the legacy ExcelJS export
// functions (app.js). These are PURE: they take data arrays as params (instead
// of the global DB) and use the CDN ExcelJS via window. Output layout/styling is
// identical to the legacy app; verify the produced .xlsx visually if in doubt.
import { getExcelJS } from '../cdn.js';
import { parseDate, dateToStr, sanitizeReportHtml } from '../format.js';
import { SCHEDULE_TIMESLOTS, compareScheduleTimeslots } from '../scheduleHelpers.js';
import { getReportAbsentLabel, getTrackerRemarks } from '../reportHelpers.js';
import { lessonTrackerHeaders } from '../lessonTracker.js';
import { findStudentForSchedule } from '../studentLookup.js';
import { RECEIPT_TABLE_HEADERS, sumLineText } from '../receiptCard.js';

export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---- colors + cell helpers ----
const XL = {
  YELLOW_PEND: 'FFFFF2CC',
  RED_ABSENT: 'FFFF9999',
  GREEN_DONE: 'FFB7E1CD',
  PINK_TRIAL: 'FFFFD0D0',
  PURPLE_CANCEL: 'FFD6C9FB',
  GRAY_OFF: 'FFD9D9D9',
  WHITE: 'FFFFFFFF',
  BLACK: 'FF000000',
  DARK_TEXT: 'FF1A3300',
  HEADER_TEXT: 'FFFFFFFF',
};

const xlFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const xlFont = (bold = false, argb = XL.BLACK, size = 10) => ({ name: 'Arial', size, bold, color: { argb } });
const xlBorder = () => {
  const s = { style: 'thin', color: { argb: 'FFB0BEC5' } };
  return { top: s, left: s, bottom: s, right: s };
};
const xlAlign = (h = 'center', v = 'middle') => ({ horizontal: h, vertical: v, wrapText: false });

function normalizeExcelHexColor(value, fallback = '#2563eb') {
  let hex = String(value || fallback).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(hex)) hex = hex.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : fallback.replace(/^#/, '').toUpperCase();
}
const excelHexToRgb = (hex) => ({ r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) });
const rgbToExcelArgb = ({ r, g, b }) =>
  'FF' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mixExcelRgb = (from, to, amount) => ({
  r: from.r + (to.r - from.r) * amount,
  g: from.g + (to.g - from.g) * amount,
  b: from.b + (to.b - from.b) * amount,
});
function excelColorLuminance({ r, g, b }) {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}
const readableExcelTextArgb = (bg) => (excelColorLuminance(bg) > 0.45 ? XL.BLACK : XL.HEADER_TEXT);
const excelContrastRatio = (a, b) => {
  const l1 = excelColorLuminance(a);
  const l2 = excelColorLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
function readableExcelAccentRgb(base) {
  const dark = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };
  for (let a = 0; a <= 0.85; a += 0.05) {
    const cand = mixExcelRgb(base, dark, a);
    if (excelContrastRatio(cand, white) >= 4.5) return cand;
  }
  return dark;
}
function getTeacherExcelTheme(teacher) {
  const base = excelHexToRgb(normalizeExcelHexColor(teacher?.color));
  const white = { r: 255, g: 255, b: 255 };
  const light = mixExcelRgb(base, white, 0.84);
  const alt = mixExcelRgb(base, white, 0.94);
  return {
    primary: rgbToExcelArgb(base),
    primaryText: readableExcelTextArgb(base),
    light: rgbToExcelArgb(light),
    lightText: readableExcelTextArgb(light),
    altRow: rgbToExcelArgb(alt),
    linkText: rgbToExcelArgb(readableExcelAccentRgb(base)),
  };
}

const REPORT_DOWNLOAD_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCHEDULE_COL_WIDTH = (141 - 5) / 7;
const REPORTS_ROW_HEIGHT_PT = (45 * 72) / 96;

const scheduleIsTrial = (s) => !!s.trial || String(s.student || '').toLowerCase().includes('trial');
function scheduleExportLabel(s) {
  const name = String(s.student || '');
  if (s.cancelled) return name ? `${name} (Cancelled)` : 'Cancelled';
  if (s.trial && !name.toLowerCase().includes('trial')) return name ? `${name} (Trial)` : 'Trial';
  return name;
}
function setExcelCell(row, col, value, fillArgb, bold = false, fontArgb = XL.BLACK, size = 10) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.fill = xlFill(fillArgb);
  cell.font = xlFont(bold, fontArgb, size);
  cell.alignment = xlAlign();
  cell.border = xlBorder();
  return cell;
}
function dateLabelForExcel(dateStr) {
  return parseDate(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function submittedAtLabelForExcel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
  const hr = String(d.getHours() % 12 || 12).padStart(2, '0');
  return `${mo}/${day}/${d.getFullYear()} at ${hr}:${min} ${ampm}`;
}
function reportHtmlToText(html) {
  const div = document.createElement('div');
  // DOMPurify the (teacher-authored) report HTML before parsing it in the admin's
  // browser — defense-in-depth even though the div is never attached to the DOM.
  div.innerHTML = sanitizeReportHtml(html || '');
  div.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  div.querySelectorAll('div, p, li, tr').forEach((el) => el.before('\n'));
  return (div.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---- date range / filename helpers ----
export function getDateRange(startStr, endStr) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (isNaN(start) || isNaN(end) || start > end) return [];
  const dates = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    dates.push(dateToStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
const getYears = (dateRange) => [...new Set(dateRange.map((d) => parseDate(d).getFullYear()))].sort((a, b) => a - b);
export const filenameDate = (s, e) => (s === e ? s : `${s}-to-${e}`);
export const safeFilenamePart = (v) =>
  String(v || 'teacher').trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'teacher';
export const safeLessonFilenamePart = (v) =>
  String(v || 'teacher').trim().replace(/[<>:"/\\|?*\x00-\x1F]+/g, '_').replace(/\s+/g, ' ').slice(0, 80) || 'teacher';

// ---- generators (per teacher, per year) ----
function getTeacherSlots(schedules, teacherId, dateSet) {
  const set = new Set(SCHEDULE_TIMESLOTS);
  schedules.forEach((s) => {
    if (s.teacher_id == teacherId && dateSet.has(s.date) && s.timeslot) set.add(s.timeslot);
  });
  return [...set].sort(compareScheduleTimeslots);
}

function generateTeacherYearSheet(wb, teacher, year, dateRange, schedules, reports) {
  const theme = getTeacherExcelTheme(teacher);
  const ws = wb.addWorksheet(`${year} schedule`, { views: [{ state: 'frozen', xSplit: 1, ySplit: 0 }] });
  for (let c = 1; c <= 32; c++) ws.getColumn(c).width = SCHEDULE_COL_WIDTH;

  const reportFor = (sid) => reports.find((r) => r.schedule_id == sid);
  const reportsSheetName = `${year} reports`;
  const hyperlinkTargets = {};

  let rowNum = 1;
  const titleRow = ws.getRow(rowNum);
  titleRow.height = 20;
  const titleCell = titleRow.getCell(1);
  titleCell.value = `${teacher.fullname} - ${year}`;
  titleCell.fill = xlFill(theme.primary);
  titleCell.font = xlFont(true, theme.primaryText, 13);
  titleCell.alignment = xlAlign('center');
  titleCell.border = xlBorder();
  ws.mergeCells(rowNum, 1, rowNum, 32);
  rowNum++;

  // Colour guide (matches the SPA legend): No Report / Absent / Present / Trial / Cancelled.
  const legendRow = ws.getRow(rowNum);
  legendRow.height = 18;
  setExcelCell(legendRow, 2, 'No Report', XL.YELLOW_PEND, true);
  setExcelCell(legendRow, 3, 'Absent', XL.RED_ABSENT, true);
  setExcelCell(legendRow, 4, 'Present', XL.GREEN_DONE, true);
  setExcelCell(legendRow, 5, 'Trial', XL.PINK_TRIAL, true);
  setExcelCell(legendRow, 6, 'Cancelled Class', XL.PURPLE_CANCEL, true);
  rowNum += 2;

  const datesForYear = dateRange.filter((d) => parseDate(d).getFullYear() === year);
  const selectedDateSet = new Set(datesForYear);
  const datesByMonth = {};
  datesForYear.forEach((date) => {
    const m = parseDate(date).getMonth();
    (datesByMonth[m] = datesByMonth[m] || []).push(date);
  });

  Object.keys(datesByMonth).map(Number).sort((a, b) => a - b).forEach((monthIdx) => {
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const monthDates = Array.from({ length: daysInMonth }, (_, i) => dateToStr(new Date(year, monthIdx, i + 1)));
    const selectedMonthDates = monthDates.filter((d) => selectedDateSet.has(d));
    const lastCol = monthDates.length + 1;

    const monthTitleRow = ws.getRow(rowNum);
    monthTitleRow.height = 22;
    const mc = monthTitleRow.getCell(1);
    mc.value = `${REPORT_DOWNLOAD_DAYS_MONTHS[monthIdx]} ${year}`;
    mc.fill = xlFill(theme.primary);
    mc.font = xlFont(true, theme.primaryText, 13);
    mc.alignment = xlAlign('center');
    mc.border = xlBorder();
    ws.mergeCells(rowNum, 1, rowNum, lastCol);
    rowNum++;

    const dayRow = ws.getRow(rowNum);
    dayRow.height = 18;
    setExcelCell(dayRow, 1, 'TIME', theme.primary, true, theme.primaryText);
    monthDates.forEach((date, di) => {
      const inRange = selectedDateSet.has(date);
      setExcelCell(dayRow, di + 2, DOW_SHORT[parseDate(date).getDay()], inRange ? theme.light : XL.GRAY_OFF, true, inRange ? theme.lightText : XL.DARK_TEXT);
    });
    rowNum++;

    const dateRow = ws.getRow(rowNum);
    dateRow.height = 16;
    setExcelCell(dateRow, 1, '', theme.light);
    monthDates.forEach((date, di) => {
      const inRange = selectedDateSet.has(date);
      setExcelCell(dateRow, di + 2, parseDate(date).getDate(), inRange ? theme.light : XL.GRAY_OFF, true, inRange ? theme.lightText : XL.DARK_TEXT);
    });
    rowNum++;

    const slots = getTeacherSlots(schedules, teacher.id, new Set(selectedMonthDates));
    for (const ts of slots) {
      const slotRow = ws.getRow(rowNum);
      slotRow.height = 17;
      setExcelCell(slotRow, 1, ts, theme.primary, true, theme.primaryText);
      monthDates.forEach((date, di) => {
        if (!selectedDateSet.has(date)) {
          setExcelCell(slotRow, di + 2, '', XL.GRAY_OFF);
          return;
        }
        const sched = schedules.find((s) => s.teacher_id == teacher.id && s.date === date && s.timeslot === ts);
        if (!sched) {
          setExcelCell(slotRow, di + 2, '', XL.WHITE);
          return;
        }
        const report = reportFor(sched.id);
        const absent = report?.absent;
        const done = report && !absent;
        const isTrial = scheduleIsTrial(sched);
        let bg = XL.YELLOW_PEND;
        if (isTrial && !done && !absent) bg = XL.PINK_TRIAL;
        if (done) bg = XL.GREEN_DONE;
        if (absent) bg = XL.RED_ABSENT;
        if (sched.cancelled) bg = XL.PURPLE_CANCEL; // cancelled wins over report status
        const cell = slotRow.getCell(di + 2);
        cell.value = scheduleExportLabel(sched);
        cell.fill = xlFill(bg);
        cell.font = xlFont(true, XL.DARK_TEXT, 10);
        cell.alignment = xlAlign();
        cell.border = xlBorder();
        if (sched.note) cell.note = sched.note;
        hyperlinkTargets[sched.id] = { wsRow: rowNum, wsCol: di + 2 };
      });
      rowNum++;
    }
    rowNum += 1;
  });

  return { hyperlinkTargets, reportsSheetName };
}

function generateTeacherReportsSheet(wb, teacher, year, dateRange, schedules, reports, { hyperlinkTargets, reportsSheetName }, students = null) {
  const theme = getTeacherExcelTheme(teacher);
  const ws = wb.addWorksheet(reportsSheetName);
  // With a students list (admin Reports download) the sheet gains Username + Info
  // columns after Student; without it (teacher schedule export) the layout is
  // exactly the original. `off` shifts the index-based styling below.
  const withMeta = Array.isArray(students);
  const off = withMeta ? 2 : 0;
  const colWidths = withMeta
    ? [12, 12, 16, 24, 16, 22, 24, 12, 16, 24, 70, 32, 24, 24]
    : [12, 12, 16, 24, 24, 12, 16, 24, 70, 32, 24, 24];
  colWidths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const HEADERS = [
    'Date', 'Day', 'Time Slot', 'Student',
    ...(withMeta ? ['Username', 'Info'] : []),
    'Material', 'Page/s', 'Class Duration', 'Student/Class Status', 'Lesson Memo & Feedback', 'Link', 'Submitted At', 'Remarks',
  ];
  const hRow = ws.getRow(1);
  hRow.height = 20;
  HEADERS.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.fill = xlFill(theme.primary);
    cell.font = xlFont(true, theme.primaryText, 11);
    cell.alignment = xlAlign('center');
    cell.border = xlBorder();
  });

  const reportFor = (sid) => reports.find((r) => r.schedule_id == sid);
  const schedsForDate = (date) =>
    schedules.filter((s) => s.teacher_id == teacher.id && s.date === date).sort((a, b) => (a.timeslot || '').localeCompare(b.timeslot || ''));

  const schedIdToReportRow = {};
  let rowNum = 2;
  const yearDates = dateRange.filter((d) => parseDate(d).getFullYear() === year);
  yearDates.forEach((dateStr) => {
    const d = parseDate(dateStr);
    const scheds = schedsForDate(dateStr);
    const rows = scheds.length ? scheds : [null];
    rows.forEach((sched) => {
      const report = sched ? reportFor(sched.id) : null;
      if (sched) schedIdToReportRow[sched.id] = rowNum;
      const text = report ? reportHtmlToText(report.content) : '';
      const rowBg = rowNum % 2 === 0 ? XL.WHITE : theme.altRow;
      const dataRow = ws.getRow(rowNum);
      dataRow.height = REPORTS_ROW_HEIGHT_PT;
      const cancelled = !!sched?.cancelled;
      // Reports sheet keeps the plain student name (the (Cancelled) suffix lives
      // only on the schedule sheet). The cancellation reason goes in the memo col.
      const memoText = cancelled
        ? sched.cancel_reason
          ? `Cancelled Class: ${sched.cancel_reason}`
          : 'Cancelled (no reason provided).'
        : text;
      // ID-first (sched.student_id when linked), exact-name fallback.
      const sMeta = withMeta && sched ? findStudentForSchedule(students, sched) : null;
      const values = [
        dateLabelForExcel(dateStr),
        REPORT_DOWNLOAD_DAYS[d.getDay()],
        sched?.timeslot || '',
        sched?.student || '',
        ...(withMeta ? [sMeta ? sMeta.username || '' : '', sMeta ? sMeta.notes || '' : ''] : []),
        report?.book || '',
        report?.pages || '',
        report?.class_duration || '',
        cancelled ? 'Cancelled' : report ? getReportAbsentLabel(report) : '',
        memoText,
        report?.link || '',
        submittedAtLabelForExcel(report?.submitted_at),
        report ? getTrackerRemarks(report) : '',
      ];
      values.forEach((v, i) => {
        const cell = dataRow.getCell(i + 1);
        cell.value = i === 9 + off && v ? { text: v, hyperlink: v } : v || '';
        cell.fill = xlFill(rowBg);
        cell.font = i === 9 + off && v ? { ...xlFont(false, 'FF1155CC', 10), color: { argb: theme.linkText }, underline: true } : xlFont(false, XL.BLACK, 10);
        cell.alignment = { horizontal: i === 8 + off ? 'left' : 'center', vertical: 'middle', wrapText: i === 8 + off || i === 11 + off };
        cell.border = xlBorder();
      });
      rowNum++;
    });
  });

  const schedSheet = wb.getWorksheet(`${year} schedule`);
  if (schedSheet && hyperlinkTargets) {
    Object.entries(hyperlinkTargets).forEach(([schedId, { wsRow, wsCol }]) => {
      const reportRow = schedIdToReportRow[schedId];
      if (!reportRow) return;
      const cell = schedSheet.getRow(wsRow).getCell(wsCol);
      const displayText = cell.value?.toString() || '';
      cell.value = { text: displayText, hyperlink: `#'${reportsSheetName}'!A${reportRow}` };
      cell.font = { ...xlFont(true, theme.linkText, 10), underline: true };
    });
  }
}

const REPORT_DOWNLOAD_DAYS_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Build a "Schedule & Reports" workbook for a single teacher (used by both the
// teacher Schedule export and the admin Reports download — looped per teacher).
export async function buildTeacherScheduleReportsFile(teacher, schedules, reports, startStr, endStr, students = null) {
  const ExcelJS = getExcelJS();
  if (!ExcelJS) throw new Error('ExcelJS is not loaded yet.');
  const dateRange = getDateRange(startStr, endStr);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduConnect';
  wb.created = new Date();
  getYears(dateRange).forEach((year) => {
    const meta = generateTeacherYearSheet(wb, teacher, year, dateRange, schedules, reports);
    generateTeacherReportsSheet(wb, teacher, year, dateRange, schedules, reports, meta, students);
  });
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${filenameDate(startStr, endStr)}-${safeFilenamePart(teacher.fullname || teacher.username || `teacher-${teacher.id}`)}-schedule.xlsx`;
  return { filename, buffer, blob: new Blob([buffer], { type: XLSX_MIME }) };
}

// Lesson tracker workbook for one teacher (rows = buildLessonTrackerRows output).
// opts.includeInfo (admin) also adds the Info column (Students tab → Notes);
// the Username column is always included.
export async function buildLessonTrackerFile(teacher, rows, startStr, endStr, opts = {}) {
  const includeInfo = !!opts.includeInfo;
  const ExcelJS = getExcelJS();
  if (!ExcelJS) throw new Error('ExcelJS is not loaded yet.');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduConnect';
  wb.created = new Date();
  const ws = wb.addWorksheet('Lesson Tracker');
  [22, 26, 18, ...(includeInfo ? [24] : []), 34, 16, 16, 16, 18, 28, 24].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const header = ws.getRow(1);
  header.height = 22;
  lessonTrackerHeaders(includeInfo).forEach((title, i) => {
    const cell = header.getCell(i + 1);
    cell.value = title;
    cell.font = { name: 'Georgia', bold: true, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = xlFill('FFFFFFFF');
    cell.border = xlBorder();
  });
  rows.forEach((row, idx) => {
    const r = ws.getRow(idx + 2);
    r.height = 20;
    [row.timestamp, row.student, row.username, ...(includeInfo ? [row.info] : []), row.book, row.pages, row.dateLabel, row.time, row.classDuration, row.studentStatus, row.remarks].forEach((value, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value = value || '';
      cell.font = { name: 'Georgia', size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = xlBorder();
    });
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${filenameDate(startStr, endStr)}-${safeLessonFilenamePart(teacher.fullname)}-lesson_tracker.xlsx`;
  return { filename, buffer, blob: new Blob([buffer], { type: XLSX_MIME }) };
}

// Annual Receipt Report → styled .xlsx mirroring the on-screen yr-table.
// Faithful port of downloadYearlyReportExcel. `rows` are the filtered txns,
// `cancelMap` keyed by student_id|receipt_no → cancellation date.
export async function buildYearlyReportFile(year, rows, cancelMap, teachers) {
  const ExcelJS = getExcelJS();
  if (!ExcelJS) throw new Error('Excel library not loaded yet. Try again.');
  const statusText = (t) => {
    if (t.type === 'monthly-fee') {
      if (t.status === 'inactive') {
        const cd = cancelMap[t.student_id + '|' + (t.receipt_no || '')];
        return 'Monthly Fee — Cancelled' + (cd ? ' (' + cd + ')' : '');
      }
      return 'Monthly Fee';
    }
    return t.status === 'new' ? 'New' : t.status === 'renew' ? 'Renew' : t.status || '';
  };
  const statusArgb = (t) => {
    if (t.type === 'monthly-fee') return t.status === 'inactive' ? 'FFE5E7EB' : 'FFD6F0FB';
    if (t.status === 'new') return 'FFFCDADA';
    if (t.status === 'renew') return 'FFD7F5E3';
    return null;
  };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduConnect';
  wb.created = new Date();
  const ws = wb.addWorksheet('Receipt Report ' + year, { views: [{ state: 'frozen', ySplit: 2 }] });
  const headers = ['Receipt No.', 'Date', 'Name', 'Package', 'Status', 'Amount (RMB)', 'Transaction No.', 'Remarks'];
  ws.columns = [
    { width: 14 }, { width: 13 }, { width: 26 }, { width: 11 },
    { width: 40 }, { width: 18 }, { width: 49 }, { width: 18 },
  ];
  ws.mergeCells(1, 1, 1, headers.length);
  const title = ws.getCell(1, 1);
  title.value = 'Annual Receipt Report ' + year;
  title.fill = xlFill('FF388E3C');
  title.font = xlFont(true, XL.WHITE, 16);
  title.alignment = xlAlign('center', 'middle');
  ws.getRow(1).height = 26;
  const headerRow = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.fill = xlFill('FF059669');
    cell.font = xlFont(true, XL.WHITE, 11);
    cell.alignment = xlAlign('center', 'middle');
    cell.border = xlBorder();
  });
  headerRow.height = 20;
  rows.forEach((t, idx) => {
    const r = ws.getRow(idx + 3);
    const pkg = t.type === 'monthly-fee' ? 'Unlimited' : t.total_classes || 0;
    const values = [
      t.receipt_no || '', t.date || '', t.student_name || '', pkg,
      statusText(t), t.amount || '', t.transaction_no || '', t.notes || '',
    ];
    const rowBg = idx % 2 === 0 ? XL.WHITE : 'FFF1F5F9';
    values.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.font = xlFont(false, XL.BLACK, 10);
      cell.alignment = xlAlign('center', 'middle');
      cell.border = xlBorder();
      if (i === 4 && statusArgb(t)) {
        cell.fill = xlFill(statusArgb(t));
      } else {
        cell.fill = xlFill(rowBg);
      }
    });
    r.height = 18;
  });
  const buffer = await wb.xlsx.writeBuffer();
  return { filename: year + '-receipt-report.xlsx', buffer, blob: new Blob([buffer], { type: XLSX_MIME }) };
}

// ── Annual Report (dashboard) export ──────────────────────────────────────
// Mirrors the Annual Report *tab* (RemainingYearly.jsx): stat cards, movement,
// highlights, a monthly breakdown with in-cell data-bar visualization, the two
// Top-5 leaderboards, and the named lists (moved students / new enrollments /
// inactive teachers). One themed worksheet per year, sheet name = the year.
const ANNUAL_XL = {
  ACCENT: 'FF2563EB',   // --accent (band)
  ACCENT_DK: 'FF1D4ED8',// --accent-dark
  ACCENT_LT: 'FFDCE7FB',// light accent (info / alt)
  ACCENT_BAR: 'FF93B4F6',// data-bar fill
  GREEN: 'FF16A34A',
  GREEN_LT: 'FFD7F5E3',
  RED: 'FFDC2626',
  RED_LT: 'FFFCDADA',
  YELLOW: 'FFCA8A04',
  YELLOW_LT: 'FFFDF0CF',
  PURPLE: 'FF7C3AED',
  WHITE: 'FFFFFFFF',
  ALT_ROW: 'FFF1F5F9',
  TEXT: 'FF1F2937',
  MUTED: 'FF64748B',
};
const ANNUAL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ANNUAL_NCOLS = 6;

function annualMoney(n) {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return Number.isInteger(r) ? r.toLocaleString() : r.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateAnnualYearSheet(wb, year, s) {
  const ws = wb.addWorksheet(String(year));
  const widths = [22, 20, 20, 20, 20, 20];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // Fill + border every cell in a row span so banded rows read cleanly.
  const paintRow = (rowNum, fill) => {
    const row = ws.getRow(rowNum);
    for (let c = 1; c <= ANNUAL_NCOLS; c++) {
      const cell = row.getCell(c);
      cell.fill = xlFill(fill);
      cell.border = xlBorder();
    }
    return row;
  };
  const banner = (rowNum, text, { fill, fontArgb = ANNUAL_XL.WHITE, size = 12, bold = true, align = 'center', height = 22 } = {}) => {
    const row = paintRow(rowNum, fill);
    row.height = height;
    const cell = row.getCell(1);
    cell.value = text;
    cell.font = xlFont(bold, fontArgb, size);
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
    ws.mergeCells(rowNum, 1, rowNum, ANNUAL_NCOLS);
    return row;
  };
  const sectionTitle = (rowNum, text) =>
    banner(rowNum, text, { fill: ANNUAL_XL.ACCENT_DK, fontArgb: ANNUAL_XL.WHITE, size: 12, height: 20 });

  let r = 1;
  // ── Title ──
  banner(r++, 'Annual Report  ·  Year ' + year, { fill: ANNUAL_XL.ACCENT, size: 16, height: 30 });
  r++; // spacer

  // ── Stat cards (label row + value row, 6 across) ──
  const stats = [
    { label: 'Receipts Issued', value: s.totalReceipts || 0 },
    { label: 'Total Collected (RMB)', value: annualMoney(s.totalRmb || 0) },
    { label: 'Active Students', value: s.activeStudents || 0 },
    { label: 'New Enrollments', value: s.newStudents || 0 },
    { label: 'Went Inactive', value: s.becameInactive || 0 },
    { label: 'Left This Year', value: s.leftStudents || 0 },
  ];
  const labelRow = paintRow(r, ANNUAL_XL.ACCENT_LT);
  labelRow.height = 16;
  stats.forEach((st, i) => {
    const cell = labelRow.getCell(i + 1);
    cell.value = st.label;
    cell.font = xlFont(true, ANNUAL_XL.TEXT, 9);
    cell.alignment = xlAlign('center', 'middle');
  });
  r++;
  const valueRow = paintRow(r, ANNUAL_XL.WHITE);
  valueRow.height = 24;
  stats.forEach((st, i) => {
    const cell = valueRow.getCell(i + 1);
    cell.value = st.value;
    cell.font = xlFont(true, ANNUAL_XL.ACCENT_DK, 15);
    cell.alignment = xlAlign('center', 'middle');
  });
  r += 2; // value row + spacer

  // ── Movement + Highlights (two-column key/value block) ──
  sectionTitle(r++, 'Movement & Highlights');
  const net = (s.newStudents || 0) - (s.leftStudents || 0);
  const avgPerReceipt = s.totalReceipts ? (s.totalRmb || 0) / s.totalReceipts : 0;
  const retDen = (s.activeStudents || 0) + (s.leftStudents || 0);
  const retention = retDen ? Math.round(((s.activeStudents || 0) / retDen) * 100) + '%' : '—';
  const busiest = s.busiestMonth ? ANNUAL_MONTHS[Number(s.busiestMonth.month) - 1] + ' (' + s.busiestMonth.receipts + ')' : '—';
  const kv = [
    ['Student movement', `New ${s.newStudents || 0}  ·  Inactive ${s.becameInactive || 0}  ·  Left ${s.leftStudents || 0}`],
    ['Teacher movement', `Active ${s.teacherActive || 0}  ·  Inactive ${s.teacherInactive || 0}`],
    ['Net student change (new − left)', (net >= 0 ? '+' : '−') + Math.abs(net)],
    ['Average per receipt (RMB)', annualMoney(avgPerReceipt)],
    ['Retention rate (active ÷ active + left)', retention],
    ['Busiest month', busiest],
  ];
  kv.forEach((row, i) => {
    const rr = paintRow(r, i % 2 === 0 ? ANNUAL_XL.WHITE : ANNUAL_XL.ALT_ROW);
    rr.height = 18;
    const keyCell = rr.getCell(1);
    keyCell.value = row[0];
    keyCell.font = xlFont(true, ANNUAL_XL.TEXT, 10);
    keyCell.alignment = { horizontal: 'left', vertical: 'middle' };
    const valCell = rr.getCell(2);
    valCell.value = row[1];
    valCell.font = xlFont(false, ANNUAL_XL.TEXT, 10);
    valCell.alignment = { horizontal: 'left', vertical: 'middle' };
    ws.mergeCells(r, 2, r, ANNUAL_NCOLS);
    r++;
  });
  r++; // spacer

  // ── Monthly breakdown — table + in-cell data bars (the visualization) ──
  sectionTitle(r++, 'Monthly Breakdown');
  const mHead = paintRow(r, ANNUAL_XL.ACCENT);
  mHead.height = 18;
  ['Month', 'Receipts', 'RMB Collected'].forEach((h, i) => {
    const cell = mHead.getCell(i + 1);
    cell.value = h;
    cell.font = xlFont(true, ANNUAL_XL.WHITE, 10);
    cell.alignment = xlAlign('center', 'middle');
  });
  r++;
  const monthly = Array.isArray(s.monthly) ? s.monthly : [];
  const firstMonthRow = r;
  for (let m = 0; m < 12; m++) {
    const entry = monthly[m] || { receipts: 0, rmb: 0 };
    const rr = paintRow(r, m % 2 === 0 ? ANNUAL_XL.WHITE : ANNUAL_XL.ALT_ROW);
    rr.height = 16;
    const mc = rr.getCell(1);
    mc.value = ANNUAL_MONTHS[m];
    mc.font = xlFont(true, ANNUAL_XL.TEXT, 10);
    mc.alignment = xlAlign('center', 'middle');
    const rc = rr.getCell(2);
    rc.value = entry.receipts || 0;
    rc.font = xlFont(false, ANNUAL_XL.TEXT, 10);
    rc.alignment = xlAlign('center', 'middle');
    const mmc = rr.getCell(3);
    mmc.value = Math.round((entry.rmb || 0) * 100) / 100;
    mmc.numFmt = '#,##0.##';
    mmc.font = xlFont(false, ANNUAL_XL.TEXT, 10);
    mmc.alignment = xlAlign('center', 'middle');
    r++;
  }
  const lastMonthRow = r - 1;
  // Data-bar conditional formatting = the on-screen bar chart, rendered in-cell.
  ws.addConditionalFormatting({
    ref: `B${firstMonthRow}:B${lastMonthRow}`,
    rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: ANNUAL_XL.ACCENT_BAR } }],
  });
  ws.addConditionalFormatting({
    ref: `C${firstMonthRow}:C${lastMonthRow}`,
    rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: ANNUAL_XL.GREEN_LT } }],
  });
  r++; // spacer

  // ── A themed list block: header band + rows (name + meta). ──
  const listBlock = (title, headFill, rows, emptyText) => {
    sectionTitle(r++, title);
    if (!rows.length) {
      banner(r++, emptyText, { fill: ANNUAL_XL.WHITE, fontArgb: ANNUAL_XL.MUTED, size: 10, bold: false, height: 18 });
      r++; // spacer
      return;
    }
    rows.forEach((row, i) => {
      const rr = paintRow(r, i % 2 === 0 ? ANNUAL_XL.WHITE : ANNUAL_XL.ALT_ROW);
      rr.height = 16;
      const numCell = rr.getCell(1);
      numCell.value = i + 1;
      numCell.font = xlFont(true, ANNUAL_XL.MUTED, 10);
      numCell.alignment = xlAlign('center', 'middle');
      const nameCell = rr.getCell(2);
      nameCell.value = row.name;
      nameCell.font = xlFont(true, ANNUAL_XL.TEXT, 10);
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.mergeCells(r, 2, r, 4);
      const metaCell = rr.getCell(5);
      metaCell.value = row.meta || '';
      metaCell.font = xlFont(false, row.metaArgb || ANNUAL_XL.MUTED, 10);
      metaCell.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.mergeCells(r, 5, r, ANNUAL_NCOLS);
      r++;
    });
    r++; // spacer
  };

  // ── Top 5 students ──
  listBlock(
    'Top 5 Students · Attendance',
    ANNUAL_XL.ACCENT,
    (s.topStudents || []).map((st) => ({
      name: st.student,
      meta: `${st.present} present` + (st.absent > 0 ? ` · ${st.absent} absent` : ' · perfect'),
      metaArgb: st.absent > 0 ? ANNUAL_XL.RED : ANNUAL_XL.GREEN,
    })),
    'No class reports yet for ' + year + '.',
  );

  // ── Left & Inactive students ──
  listBlock(
    'Left & Inactive Students',
    ANNUAL_XL.RED,
    (s.movedStudents || []).map((m) => ({
      name: m.name,
      meta: m.type + (m.date ? ' · ' + m.date : ''),
      metaArgb: m.type === 'Left' ? ANNUAL_XL.RED : ANNUAL_XL.YELLOW,
    })),
    'No students left or went inactive in ' + year + '.',
  );

  // ── New enrollments ──
  listBlock(
    'New Enrollments',
    ANNUAL_XL.GREEN,
    (s.newStudentsList || []).map((n) => ({
      name: n.name,
      meta: n.date ? 'enrolled ' + n.date : 'new',
      metaArgb: ANNUAL_XL.GREEN,
    })),
    'No new enrollments in ' + year + '.',
  );

  // ── Top 5 teachers ──
  listBlock(
    'Top 5 Teachers · Classes',
    ANNUAL_XL.ACCENT,
    (s.topTeachers || []).map((t) => ({
      name: t.teacher || 'Unknown',
      meta: `${t.classes} classes` + (t.cancelled > 0 ? ` · ${t.cancelled} cancelled` : ' · no cancels'),
      metaArgb: t.cancelled > 0 ? ANNUAL_XL.RED : ANNUAL_XL.GREEN,
    })),
    'No class reports yet for ' + year + '.',
  );

  // ── Teachers who went inactive ──
  listBlock(
    'Teachers Who Went Inactive',
    ANNUAL_XL.YELLOW,
    (s.inactiveTeachers || []).map((t) => ({
      name: t.name,
      meta: t.date ? 'inactive ' + t.date : 'inactive',
      metaArgb: ANNUAL_XL.YELLOW,
    })),
    'No teachers went inactive in ' + year + '.',
  );

  // ── Monthly fee students ──
  listBlock(
    'Monthly Fee Students',
    ANNUAL_XL.GREEN,
    (s.monthlyFeeList || []).map((m) => ({
      name: m.name,
      meta: m.date ? 'monthly ' + m.date : 'monthly',
      metaArgb: ANNUAL_XL.GREEN,
    })),
    'No monthly fee in ' + year + '.',
  );

  // ── Cancelled monthly fee ──
  listBlock(
    'Cancelled Monthly Fee',
    ANNUAL_XL.RED,
    (s.cancelMonthlyList || []).map((c) => ({
      name: c.name,
      meta: c.date ? 'cancelled ' + c.date : 'cancelled',
      metaArgb: ANNUAL_XL.RED,
    })),
    'No monthly-fee cancellations in ' + year + '.',
  );

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

// Build the Annual Report workbook. `selections` = [{ year, summary }, ...]
// (already sorted). Filename: annual-report-<years joined by ->.xlsx.
export async function buildAnnualReportFile(selections) {
  const ExcelJS = getExcelJS();
  if (!ExcelJS) throw new Error('Excel library not loaded yet. Try again.');
  const valid = (selections || []).filter((x) => x && x.summary && typeof x.summary === 'object');
  if (!valid.length) throw new Error('No years to export.');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduConnect';
  wb.created = new Date();
  valid.forEach(({ year, summary }) => generateAnnualYearSheet(wb, year, summary));
  const buffer = await wb.xlsx.writeBuffer();
  const years = valid.map((x) => x.year).join('-');
  return { filename: `annual-report-${years}.xlsx`, buffer, blob: new Blob([buffer], { type: XLSX_MIME }) };
}

// ---- Receipt card export ----
// Themed receipt-card workbook: one worksheet per receipt, named after the
// receipt number. Column widths mirror the on-screen receipt table. `cards` is
// an array of { model, usageRows } (see lib/receiptCard.js).
const RECEIPT_XL = {
  TITLE: 'FF1D4ED8', // primary band
  HEADER: 'FF2563EB', // column-header band
  LIGHT: 'FFE8EEFC', // info band / alt row
  WHITE: 'FFFFFFFF',
  ALT_ROW: 'FFF5F8FF',
  ABSENT: 'FFFDECEC',
  CONSUMED: 'FFF1F5F9',
  CREDIT: 'FF059669',
  DEBIT: 'FFDC2626',
  MONTHLY_ON: 'FFE3F6EC',
  MONTHLY_OFF: 'FFEAEDF1',
  TEXT: 'FF1F2937',
  MUTED: 'FF64748B',
  WHITE_TEXT: 'FFFFFFFF',
};
// Excel column widths (≈ on-screen px / 7). Materials gets the wide min-width.
const RECEIPT_COL_WIDTHS = [6, 14, 32, 9, 13, 10, 11, 20, 26];
const RECEIPT_NCOLS = RECEIPT_COL_WIDTHS.length;

// Excel forbids \ / ? * [ ] : in sheet names and caps length at 31.
function safeSheetName(name, used) {
  let base = String(name || '').replace(/[\\/?*[\]:]+/g, ' ').trim().slice(0, 31) || 'Receipt';
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ' (' + n++ + ')';
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildReceiptCardSheet(wb, card, used) {
  const { model } = card;
  const usageRows = Array.isArray(card.usageRows) ? card.usageRows : [];
  const ws = wb.addWorksheet(safeSheetName(model.receiptNo || 'Receipt', used));
  RECEIPT_COL_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  // mergedRow: fill a full-width banner row.
  const mergedRow = (rowNum, text, { fill, fontArgb, size = 11, bold = false, align = 'left', height = 18 } = {}) => {
    const row = ws.getRow(rowNum);
    row.height = height;
    const cell = row.getCell(1);
    cell.value = text;
    cell.fill = xlFill(fill);
    cell.font = xlFont(bold, fontArgb || RECEIPT_XL.TEXT, size);
    cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true };
    cell.border = xlBorder();
    for (let c = 2; c <= RECEIPT_NCOLS; c++) {
      const cc = row.getCell(c);
      cc.fill = xlFill(fill);
      cc.border = xlBorder();
    }
    ws.mergeCells(rowNum, 1, rowNum, RECEIPT_NCOLS);
    return row;
  };

  let rowNum = 1;
  // Title band — receipt number.
  mergedRow(rowNum++, 'Receipt: ' + (model.receiptNo || '(no receipt)'), {
    fill: RECEIPT_XL.TITLE, fontArgb: RECEIPT_XL.WHITE_TEXT, size: 14, bold: true, align: 'center', height: 24,
  });
  // Info band — student + transaction date. Username/Info are included only when
  // the caller resolved them (the single-card download); bulk exports without
  // them are unchanged.
  const info = ['Student: ' + (model.stName || '—')];
  if (model.stUsername != null || model.stNotes != null) {
    info.push('Username: ' + (model.stUsername || '—'), 'Info: ' + (model.stNotes || '—'));
  }
  if (model.dateStr) info.push('Transaction Date: ' + model.dateStr);
  mergedRow(rowNum++, info.join('     ·     '), {
    fill: RECEIPT_XL.LIGHT, fontArgb: RECEIPT_XL.TEXT, size: 11, bold: true, align: 'center', height: 20,
  });

  const hasTable = usageRows.length > 0;
  if (hasTable) {
    // Column header row.
    const hRow = ws.getRow(rowNum++);
    hRow.height = 20;
    RECEIPT_TABLE_HEADERS.forEach((h, i) => {
      const cell = hRow.getCell(i + 1);
      cell.value = h;
      cell.fill = xlFill(RECEIPT_XL.HEADER);
      cell.font = xlFont(true, RECEIPT_XL.WHITE_TEXT, 10);
      cell.alignment = xlAlign('center', 'middle');
      cell.border = xlBorder();
    });
    // Data rows.
    usageRows.forEach((r, idx) => {
      const dataRow = ws.getRow(rowNum++);
      dataRow.height = 18;
      let bg = idx % 2 === 0 ? RECEIPT_XL.WHITE : RECEIPT_XL.ALT_ROW;
      let fontArgb = RECEIPT_XL.TEXT;
      let italic = false;
      if (r.cls === 'row-absent') bg = RECEIPT_XL.ABSENT;
      else if (r.cls === 'row-consumed') { bg = RECEIPT_XL.CONSUMED; fontArgb = RECEIPT_XL.MUTED; italic = true; }
      r.cells.forEach((c, i) => {
        const cell = dataRow.getCell(i + 1);
        cell.value = c.text === 0 ? 0 : c.text || '';
        const font = xlFont(false, fontArgb, 10);
        font.italic = italic;
        cell.font = font;
        // Materials (col 3) & Remarks (col 9) read left-aligned + wrap.
        const left = i === 2 || i === 8;
        cell.alignment = { horizontal: left ? 'left' : 'center', vertical: 'middle', wrapText: left };
        cell.fill = xlFill(bg);
        cell.border = xlBorder();
      });
    });
  } else if (!model.monthlyItem && !model.summaryItems.length) {
    mergedRow(rowNum++, 'No classes on this receipt.', {
      fill: RECEIPT_XL.WHITE, fontArgb: RECEIPT_XL.MUTED, size: 11, align: 'center', height: 20,
    });
  }

  // Credit / debit summary lines.
  (model.summaryItems || []).forEach((it) => {
    const n = Math.abs(it.total_classes || 0);
    const isIn = (it.total_classes || 0) > 0;
    const text = (isIn ? '+' : '−') + n + ' class(es)     ' + sumLineText(it);
    mergedRow(rowNum++, text, {
      fill: RECEIPT_XL.WHITE, fontArgb: isIn ? RECEIPT_XL.CREDIT : RECEIPT_XL.DEBIT, size: 11, bold: true, align: 'left', height: 18,
    });
  });

  // Monthly fee banner.
  if (model.monthlyItem) {
    const m = model.monthlyItem;
    const active = model.monthlyActive;
    const head = 'Monthly Fee — unlimited classes ' + (active ? '(active)' : '(inactive)');
    const detail = 'Enrolled: ' + (m.date || '—') + ' · Transaction No: ' + (m.transaction_no || '—') + ' · Remarks: ' + (m.notes || '—');
    mergedRow(rowNum++, head, {
      fill: active ? RECEIPT_XL.MONTHLY_ON : RECEIPT_XL.MONTHLY_OFF,
      fontArgb: active ? RECEIPT_XL.CREDIT : RECEIPT_XL.MUTED, size: 11, bold: true, align: 'left', height: 18,
    });
    mergedRow(rowNum++, detail, {
      fill: active ? RECEIPT_XL.MONTHLY_ON : RECEIPT_XL.MONTHLY_OFF,
      fontArgb: RECEIPT_XL.TEXT, size: 10, align: 'left', height: 18,
    });
    if (!active && model.cancelItem) {
      mergedRow(rowNum++, 'Monthly Fee Cancelled · Information: ' + (model.cancelItem.notes || '—'), {
        fill: RECEIPT_XL.MONTHLY_OFF, fontArgb: RECEIPT_XL.DEBIT, size: 10, bold: true, align: 'left', height: 18,
      });
    }
  }

  // Remaining class summary.
  mergedRow(rowNum++, 'Remaining Class: ' + model.remainingDisplay, {
    fill: RECEIPT_XL.LIGHT, fontArgb: RECEIPT_XL.TITLE, size: 12, bold: true, align: 'left', height: 22,
  });

  ws.views = [{ state: 'frozen', ySplit: 2 }];
  return ws;
}

// Build a single .xlsx for one or more receipt cards (one sheet each). Returns
// { filename, blob, buffer }. Caller supplies `cards` = [{ model, usageRows }].
export async function buildReceiptCardsFile(cards) {
  const ExcelJS = getExcelJS();
  if (!ExcelJS) throw new Error('Excel library not loaded yet. Try again.');
  const valid = (cards || []).filter((c) => c && c.model && !c.model.notFound);
  if (!valid.length) throw new Error('No receipts to export.');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduConnect';
  wb.created = new Date();
  const used = new Set();
  valid.forEach((card) => buildReceiptCardSheet(wb, card, used));
  const buffer = await wb.xlsx.writeBuffer();
  const stamp = dateToStr(new Date());
  const filename = valid.length === 1
    ? 'receipt-' + safeFilenamePart(valid[0].model.receiptNo || 'receipt') + '.xlsx'
    : 'receipts-' + valid.length + '-' + stamp + '.xlsx';
  return { filename, buffer, blob: new Blob([buffer], { type: XLSX_MIME }) };
}

// Trigger a browser download of a blob.
export function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
