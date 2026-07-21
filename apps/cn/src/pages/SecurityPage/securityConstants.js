import { uiLocale } from '../../lib/format.js';

export const SECURITY_RANGES = [
  { id: '24h', labelKey: 'sec.range24h' },
  { id: '7d', labelKey: 'sec.range7d' },
  { id: '30d', labelKey: 'sec.range30d' },
];

// Status buckets in the order they should read: healthy first, then the
// security-relevant ones the server keeps exact, then the rest.
export const STATUS_META = [
  { key: '2xx', color: 'var(--green)' },
  { key: '3xx', color: 'var(--accent-light)' },
  { key: '401', color: 'var(--yellow)' },
  { key: '403', color: 'var(--orange)' },
  { key: '404', color: 'var(--text3)' },
  { key: '429', color: 'var(--purple)' },
  { key: '4xx', color: 'var(--orange)' },
  { key: '5xx', color: 'var(--red)' },
];

export const ROLE_LABEL_KEYS = {
  admin: 'sec.roleAdmin',
  teacher: 'sec.roleTeacher',
  student: 'sec.roleStudent',
};

export const ROLE_ICON = {
  admin: 'fa-user-shield',
  teacher: 'fa-chalkboard-user',
  student: 'fa-graduation-cap',
};

// Buckets are stored in UTC. Render compact, localized labels so raw ISO values
// do not leak into the UI and hourly buckets reflect the user's local time.
export function formatBucketTick(t) {
  const value = String(t || '');
  const hourly = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(value);
  if (hourly) {
    const [, year, month, day, hour] = hourly;
    const date = new Date(Date.UTC(+year, +month - 1, +day, +hour));
    return date.toLocaleString(uiLocale(), {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    });
  }

  const daily = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (daily) {
    const [, year, month, day] = daily;
    const date = new Date(+year, +month - 1, +day);
    return date.toLocaleDateString(uiLocale(), { month: 'short', day: 'numeric' });
  }

  return value || '--';
}
