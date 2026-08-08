export const MANILA_TIMEZONE = "Asia/Manila";

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function manilaLogicalDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseDateKey(value) {
  const match = DATE_KEY.exec(String(value));
  if (!match) throw new TypeError("Invalid logical date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new TypeError("Invalid logical date.");
  }
  return { year, month, day };
}

export function monthKeyFromLogicalDate(logicalDate) {
  const { year, month } = parseDateKey(logicalDate);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function createHoursSampleEntries(logicalDate) {
  const { year, month } = parseDateKey(logicalDate);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const hourPatterns = [
    [4],
    [3.5, 2],
    [7.5],
    [2.5, 4.25],
    [6],
    [3, 3.5],
    [8],
    [4.5, 2.25],
    [5.5],
    [3.75, 3],
    [7],
    [4, 2.5]
  ];

  const workdays = [];
  for (let day = 1; day <= daysInMonth && workdays.length < hourPatterns.length; day += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) workdays.push(day);
  }

  return workdays.map((day, index) => ({
    dateKey: `${monthKey}-${String(day).padStart(2, "0")}`,
    hoursList: [...hourPatterns[index]]
  }));
}
