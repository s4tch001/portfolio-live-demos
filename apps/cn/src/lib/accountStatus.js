// Account/student status helpers — ported verbatim from legacy app.js so
// teachers, admins, and students share identical status semantics + sorting.

export function normalizeAccountStatus(status) {
  return status === 'Inactive' || status === 'Login Blocked' || status === 'End of Contract'
    ? status
    : 'Active';
}

export function isActiveAccount(account) {
  return normalizeAccountStatus(account?.status) === 'Active';
}

// Statuses that block scheduling a new class (Inactive or officially left). Returns the
// normalized status string when blocked, or '' when the student can be scheduled.
export function unschedulableStatus(status) {
  const s = normalizeAccountStatus(status);
  return s === 'Inactive' || s === 'End of Contract' ? s : '';
}

// Active accounts first, then Inactive/Blocked — alphabetical by full name within each.
export function compareAccountsForList(a, b) {
  const ai = isActiveAccount(a) ? 0 : 1;
  const bi = isActiveAccount(b) ? 0 : 1;
  if (ai !== bi) return ai - bi;
  return String(a?.fullname || '').localeCompare(String(b?.fullname || ''));
}

// Pick a readable text color (dark/light) for a colored background (legacy
// getReadableTextColor).
export function getReadableTextColor(bgColor) {
  let hex = String(bgColor || '').replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#fff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#0f172a' : '#fff';
}
