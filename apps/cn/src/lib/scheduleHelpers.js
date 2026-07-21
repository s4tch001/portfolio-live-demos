// Schedule timeslots + time helpers — ported from legacy app.js.

export const SCHEDULE_TIMESLOTS = [
  '10:00 - 10:25', '10:30 - 10:55', '11:00 - 11:25', '11:30 - 11:55',
  '12:00 - 12:25', '12:30 - 12:55', '13:00 - 13:25', '13:30 - 13:55',
  '14:00 - 14:25', '14:30 - 14:55', '15:00 - 15:25', '15:30 - 15:55',
  '16:00 - 16:25', '16:30 - 16:55', '17:00 - 17:25', '17:30 - 17:55',
  '18:00 - 18:25', '18:30 - 18:55', '19:00 - 19:25', '19:30 - 19:55',
  '20:00 - 20:25', '20:30 - 20:55', '21:00 - 21:25', '21:30 - 21:55',
];

export function getScheduleStartMinutes(timeslot) {
  const match = String(timeslot || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

export function compareScheduleTimeslots(a, b) {
  const aText = typeof a === 'string' ? a : a?.timeslot || '';
  const bText = typeof b === 'string' ? b : b?.timeslot || '';
  const minuteCompare = getScheduleStartMinutes(aText) - getScheduleStartMinutes(bText);
  if (minuteCompare) return minuteCompare;
  return String(aText).localeCompare(String(bText));
}

export function sortSchedulesByTime(schedules) {
  return schedules.slice().sort((a, b) => {
    const t = compareScheduleTimeslots(a, b);
    if (t) return t;
    return String(a.student || '').localeCompare(String(b.student || ''));
  });
}

// Default class duration in minutes from a "HH:MM - HH:MM" timeslot (legacy).
export function getDefaultClassDuration(timeslot) {
  const match = String(timeslot || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const start = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  let end = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);
  if (end < start) end += 24 * 60;
  const mins = end - start;
  return mins > 0 ? `${mins} mins` : '';
}

export function formatClassStartTime(timeslot) {
  const match = String(timeslot || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return timeslot || '';
  const d = new Date();
  d.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
