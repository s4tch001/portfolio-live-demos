import { parseDate, dateToStr } from './format.js';
import { formatClassStartTime } from './scheduleHelpers.js';
import { getReportAbsentLabel, getTrackerRemarks } from './reportHelpers.js';
import { findStudentForSchedule } from './studentLookup.js';

export const LESSON_TRACKER_HEADERS = [
  'Timestamp', 'Name of the Student', 'Material', 'Page/s', 'Date',
  'Time', 'Class Duration', 'The Student is', 'Remarks',
];

// Tracker table/export headers with the student's login Username (and, for
// admins, the Info column = Students tab → Notes) inserted after the name.
// LESSON_TRACKER_HEADERS above stays untouched (the tracker Editor still uses it).
export function lessonTrackerHeaders(includeInfo) {
  return [
    'Timestamp', 'Name of the Student', 'Username',
    ...(includeInfo ? ['Info'] : []),
    'Material', 'Page/s', 'Date', 'Time', 'Class Duration', 'The Student is', 'Remarks',
  ];
}

export function formatLessonTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.toLocaleDateString('en-US')} ${d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

export function lessonDateLabel(dateStr) {
  const d = parseDate(dateStr);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US');
}

// Inclusive list of "YYYY-MM-DD" date strings from start to end.
export function dateRangeArray(startStr, endStr) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (isNaN(start) || isNaN(end) || start > end) return [];
  const out = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur <= end) {
    out.push(dateToStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// Parse a tracker status string ("Present" / "Absent: …") → report absence fields.
export function parseTrackerStatus(value) {
  const text = String(value || '').trim();
  if (!/^absent/i.test(text)) return { absent: false, absent_reason: '', absent_other: '' };
  if (/late notice/i.test(text)) return { absent: true, absent_reason: 'Late Notice', absent_other: '' };
  if (/no notice/i.test(text)) return { absent: true, absent_reason: 'No Notice', absent_other: '' };
  const other = text
    .replace(/^absent\s*:?\s*/i, '')
    .replace(/^other\s*:?\s*/i, '')
    .replace(/^-\s*/, '')
    .trim();
  return { absent: true, absent_reason: 'Other', absent_other: other };
}

// Build tracker rows (one per filed report) for a teacher within a date range.
// Ported from legacy buildLessonTrackerRows. `students` is optional: when given,
// each row also carries the student's login username + admin note (Info).
export function buildLessonTrackerRows(reports, schedules, teachers, teacherId, dateRange, students) {
  const dateSet = new Set(dateRange);
  const studentList = Array.isArray(students) ? students : [];
  return reports
    .map((report) => {
      const sched = schedules.find((s) => s.id == report.schedule_id);
      if (!sched || sched.teacher_id != teacherId || !dateSet.has(sched.date)) return null;
      if (sched.cancelled) return null; // cancelled classes never appear in the tracker
      const teacher = teachers.find((t) => t.id == sched.teacher_id);
      // Trial classes pay a flat 50 — the Remarks column shows that figure for
      // trials (present or absent) instead of the teacher's free-text remarks.
      const isTrial = !!sched.trial || String(sched.student || '').toLowerCase().includes('trial');
      // Tag trial classes on the student name (shown in the tracker table, the
      // search, and the downloaded XLSX — all read this field).
      const studentName = sched.student || '';
      const studentLabel = isTrial && !studentName.toLowerCase().includes('trial')
        ? (studentName ? `${studentName} (Trial)` : 'Trial')
        : studentName;
      // ID-first (sched.student_id when linked), exact-name fallback.
      const sObj = findStudentForSchedule(studentList, sched);
      return {
        report,
        sched,
        teacher,
        reportId: report.id,
        timestamp: formatLessonTimestamp(report.submitted_at),
        student: studentLabel,
        username: sObj ? String(sObj.username || '') : '',
        info: sObj ? String(sObj.notes || '') : '',
        book: report.book || '',
        pages: report.pages || '',
        date: sched.date || '',
        dateLabel: lessonDateLabel(sched.date),
        time: formatClassStartTime(sched.timeslot),
        classDuration: report.class_duration || '',
        studentStatus: getReportAbsentLabel(report),
        remarks: isTrial ? '50' : getTrackerRemarks(report),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.sched.timeslot || '').localeCompare(b.sched.timeslot || '');
    });
}
