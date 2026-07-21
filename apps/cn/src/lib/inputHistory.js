// Lightweight per-field input history backed by localStorage. Powers the "autofill"
// suggestions (native <datalist>) on the teacher's class-report inputs — so clicking a
// field shows the values you typed before. Device-local only: no server / D1 reads.

const PREFIX = 'report-hist';
const CAP = 25;

function storageKey(userId, field) {
  return `${PREFIX}:${userId || 'anon'}:${field}`;
}

// Returns the saved values for a field (newest first). Always returns an array.
export function getHistory(userId, field) {
  try {
    const raw = localStorage.getItem(storageKey(userId, field));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [];
  } catch (e) {
    return [];
  }
}

// Adds a value to the front of a field's history (deduped case-insensitively, capped).
// Best-effort: silently ignores private-mode / quota errors.
export function pushHistory(userId, field, value) {
  const v = String(value || '').trim();
  if (!v) return;
  try {
    const lower = v.toLowerCase();
    const prev = getHistory(userId, field).filter((x) => x.toLowerCase() !== lower);
    const next = [v, ...prev].slice(0, CAP);
    localStorage.setItem(storageKey(userId, field), JSON.stringify(next));
  } catch (e) {
    /* ignore */
  }
}
