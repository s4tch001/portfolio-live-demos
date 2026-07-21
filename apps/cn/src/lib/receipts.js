import { apiFetch, queryPath } from './apiClient.js';
import { getReceiptGroups } from './receiptSelection.js';
import { isValidReceiptNo } from './receiptValidation.js';

export { getOldestReceiptAllocations } from './receiptSelection.js';
export { isValidReceiptNo } from './receiptValidation.js';

// Receipt helpers — ported from legacy app.js (Remaining Classes).

// Receipt format: [year]-[count], e.g. 2026-001. The count has a minimum of
// three digits, but is deliberately unbounded so 2026-1000 remains valid.
export async function isReceiptTaken(no) {
  const n = (no || '').trim();
  if (!n) return false;
  try {
    const d = await apiFetch(queryPath('/receipts/check', { no: n }));
    return !!(d && d.taken);
  } catch (e) {
    return false;
  }
}

export async function getNextReceiptNo() {
  try {
    const d = await apiFetch(queryPath('/receipts/next', { year: new Date().getFullYear() }));
    return d && d.receipt_no ? d.receipt_no : '';
  } catch (e) {
    return '';
  }
}

// Unique receipt numbers a student already has, newest first.
export async function getStudentReceipts(studentId) {
  try {
    const txns = await apiFetch('/class-transactions?student_id=' + studentId);
    if (!Array.isArray(txns)) return [];
    txns.sort((a, b) => b.id - a.id);
    const seen = [];
    for (const t of txns) {
      const r = (t.receipt_no || '').trim();
      if (r && !seen.includes(r)) seen.push(r);
    }
    return seen;
  } catch (e) {
    return [];
  }
}

// The receipt a credit should attach to: the student's newest existing receipt,
// whether or not its current numeric balance is already zero. A new number is
// generated only for a student who has never had a receipt.
export async function resolveAttachReceipt(studentId) {
  try {
    const txns = await apiFetch('/class-transactions?student_id=' + studentId);
    const groups = getReceiptGroups(txns);
    if (groups.length) return groups[groups.length - 1].receiptNo;
  } catch (e) {
    /* fall through */
  }
  return getNextReceiptNo();
}

// Exact-name student resolver (legacy resolveStudentId).
export async function resolveStudentId(name) {
  const q = (name || '').trim();
  if (!q) return null;
  const lower = q.toLowerCase();
  try {
    const data = await apiFetch(queryPath('/students', { search: q, limit: 20 }));
    if (Array.isArray(data)) {
      const exact = data.find((s) => (s.name || '').trim().toLowerCase() === lower);
      if (exact) return exact.id;
    }
  } catch (e) {}
  return null;
}
