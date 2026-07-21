// Shared receipt-card data model. Extracted from ReceiptModalContext so the
// on-screen card, the snapshot download, and the XLSX export all build from the
// exact same logic. Pure helpers + an async fetch that returns { model, usageRows }.
import { apiFetch } from './apiClient.js';
import { getReportAbsentLabel, getReportAbsentLabelT } from './reportHelpers.js';

export const TYPE_LABELS = {
  purchase: 'Class Package',
  'monthly-fee': 'Monthly Fee',
  recommendation: 'Recommendation',
  compensation: 'Compensation',
  transfer: 'Transfer',
  promo: 'Promo',
  manual: 'Manual',
};
// `tr` (optional useT translator) localizes the on-screen card; without it the
// English labels are returned so the XLSX/snapshot exports stay English.
const TYPE_KEYS = {
  purchase: 'rmod.typePackage',
  'monthly-fee': 'rmod.typeMonthlyFee',
  recommendation: 'rmod.typeRecommendation',
  compensation: 'rmod.typeCompensation',
  transfer: 'rmod.typeTransfer',
  promo: 'rmod.typePromo',
  manual: 'rmod.typeManual',
};
export const typeLabel = (type, tr) => {
  if (tr && TYPE_KEYS[type]) return tr(TYPE_KEYS[type]);
  return TYPE_LABELS[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : '');
};

// Ordinal label: 1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th"… (used for the
// recurring monthly-fee payment lines: 1st payment, 2nd payment, …).
export function ordinal(n) {
  const v = Number(n) || 0;
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return v + (s[(m - 20) % 10] || s[m] || s[0]);
}

// Ordered ledger of a student's monthly-fee activity: the enrollment (type
// 'monthly-fee') first, then each recurring payment ('monthly-fee-payment'),
// sorted by date then id. Feeds the receipt banner and the Annual Report
// "view details" modal so both render identical payment lines.
export function buildMonthlyLedger(txns) {
  return (Array.isArray(txns) ? txns : [])
    .filter((t) => t.type === 'monthly-fee' || t.type === 'monthly-fee-payment')
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id);
}

// One payment's detail line: "[date] · Transaction No: [no] · Amount (RMB): [amt] · Remarks: [notes]".
// `tr` (optional) localizes the field labels; without it stays English (exports).
export function monthlyPaymentLine(t, tr) {
  const txnNo = tr ? tr('rmod.transactionNo') : 'Transaction No';
  const amt = tr ? tr('rmod.amountRmb') : 'Amount (RMB)';
  const rem = tr ? tr('rmod.remarks') : 'Remarks';
  return (
    (t.date || '—') +
    ' · ' + txnNo + ': ' + ((t.transaction_no || '').trim() || '—') +
    ' · ' + amt + ': ' + ((t.amount || '').trim() || '—') +
    ' · ' + rem + ': ' + ((t.notes || '').trim() || '—')
  );
}

// Column headers for the receipt usage table (kept in one place so the card UI
// and the XLSX sheet stay in lock-step).
export const RECEIPT_TABLE_HEADERS = ['No.', 'Type', 'Materials', 'Page/s', 'Date', 'Time', 'Duration', 'Teacher', 'Remarks'];

// Full right-side text for a credit/debit summary line. `tr` (optional) localizes
// the labels for the on-screen card; without it stays English (XLSX export).
export function sumLineText(it, tr) {
  const isIn = (it.total_classes || 0) > 0;
  const note = (it.notes || '').trim();
  const date = (it.date || '').trim();
  const amount = (it.amount || '').trim();
  if (it.type === 'refund') {
    // Refunded · date · Note: note · Amount (RMB): amount (skip the auto-default "Refund" note).
    const parts = [tr ? tr('rc.refunded') : 'Refunded'];
    if (date) parts.push(date);
    if (note && note.toLowerCase() !== 'refund') parts.push((tr ? tr('rc.notePrefix') : 'Note: ') + note);
    if (amount) parts.push((tr ? tr('rc.amountRmbColon') : 'Amount (RMB): ') + amount);
    return parts.join(' · ');
  }
  let label;
  if (it.type === 'manual') label = note ? (tr ? tr('rc.manualPrefix') : 'Manual: ') + note : (isIn ? (tr ? tr('rc.manualAddition') : 'Manual addition') : (tr ? tr('rc.manualDeduction') : 'Manual deduction'));
  else if (it.type === 'transfer') label = note || (isIn ? (tr ? tr('rc.transferredIn') : 'Transferred in') : (tr ? tr('rc.transferredOut') : 'Transferred out'));
  else if (it.type === 'recommendation') label = note ? (tr ? tr('rc.referredPrefix') : 'Referred ') + note : (tr ? tr('rc.referral') : 'Referral');
  else if (it.type === 'promo') label = note ? (tr ? tr('rc.fromPromoPrefix') : 'From Promo: ') + note : (tr ? tr('rc.fromPromo') : 'From Promo');
  else if (it.type === 'compensation') label = note ? (tr ? tr('rc.compensationPrefix') : 'Compensation: ') + note : (tr ? tr('rmod.typeCompensation') : 'Compensation');
  else label = note;
  return label + (date ? ' · ' + date : '');
}

// Faithful port of showReceiptCard's data assembly (no DOM).
export function buildCardModel(txns, receiptNo, studentName, teachers) {
  receiptNo = (receiptNo || '').trim();
  let items = txns.filter((t) => (t.receipt_no || '').trim() === receiptNo && t.type !== 'cancel-monthly-fee');
  if (!items.length) return { notFound: true };

  const order = { purchase: 0, manual: 1, transfer: 2, recommendation: 3, compensation: 4, promo: 5, refund: 6, 'monthly-fee': 7 };
  items.sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99) || a.id - b.id);

  const additions = items.filter((t) => t.type !== 'monthly-fee' && (t.total_classes || 0) > 0);
  const transferOuts = items.filter((t) => t.type === 'transfer' && (t.total_classes || 0) < 0);
  const transferIns = items.filter((t) => t.type === 'transfer' && (t.total_classes || 0) > 0);
  const refunds = items.filter((t) => t.type === 'refund' && (t.total_classes || 0) < 0);
  const manualDeductions = items.filter((t) => t.type === 'manual' && (t.total_classes || 0) < 0);
  const creditExtras = additions.filter((t) => ['recommendation', 'promo', 'compensation', 'manual'].includes(t.type));
  const consumedTxns = [...transferOuts, ...refunds];
  const monthlyItem = items.find((t) => t.type === 'monthly-fee');
  const monthlyActive = items.some((t) => t.type === 'monthly-fee' && t.status === 'active');
  // Recurring monthly payments recorded after enrollment (2nd, 3rd, … payment).
  const monthlyPayments = items
    .filter((t) => t.type === 'monthly-fee-payment')
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id);
  const cancelItem = txns.find((t) => t.type === 'cancel-monthly-fee' && (t.receipt_no || '').trim() === receiptNo);
  const remaining = items.reduce((s, it) => s + (it.type === 'monthly-fee' ? 0 : it.remaining_classes || 0), 0);
  const head = additions.find((t) => t.type === 'purchase') || additions[0] || items[0];
  const dateStr = head ? head.date || '' : '';
  // Representative txn for the header (class package = purchase/first addition; monthly-only = the monthly item).
  const transactionNo = head ? (head.transaction_no || '').trim() : '';
  const remarks = head ? (head.notes || '').trim() : '';
  const summaryItems = [...creditExtras, ...transferIns, ...transferOuts, ...refunds, ...manualDeductions];
  const isUnlimited = !!monthlyItem;
  const tableSources = isUnlimited ? [...additions, monthlyItem] : additions;
  const remainingDisplay = monthlyActive ? 'Unlimited' : monthlyItem ? 0 : remaining;
  // Identity used by the inline editor: the header fields (date/transaction_no/notes) live on the
  // head txn; receipt_no lives on every row in the group (keyed by student_id + receipt_no).
  const studentId = head ? head.student_id : items[0] ? items[0].student_id : 0;
  const headId = head ? head.id : 0;

  return {
    receiptNo,
    oldReceiptNo: receiptNo,
    studentId,
    headId,
    stName: studentName,
    dateStr,
    transactionNo,
    remarks,
    additions,
    consumedTxns,
    monthlyItem,
    monthlyActive,
    monthlyPayments,
    cancelItem,
    remaining,
    summaryItems,
    isUnlimited,
    tableSources,
    remainingDisplay,
    notFound: false,
  };
}

// Faithful port of loadMergedUsage → returns an array of row descriptors
// { cls, cells:[{text, style}] } instead of mutating the DOM.
// opts.t (optional useT translator) localizes the on-screen usage rows; without
// it the rows stay English (XLSX export path via fetchReceiptCard).
export async function loadMergedUsage(additions, consumedTxns, teachers, opts = {}) {
  const tr = opts.t;
  const usageByTxn = {};
  for (const it of additions) {
    const usage = await apiFetch('/class-usage?transaction_id=' + it.id);
    usageByTxn[it.id] = Array.isArray(usage)
      ? usage.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id - b.id)
      : [];
  }
  const slots = [];
  if (opts.unlimited) {
    for (const it of additions) {
      for (const u of usageByTxn[it.id] || []) slots.push({ type: it.type, usage: u, txnId: it.id });
    }
  } else {
    for (const it of additions) {
      const n = it.total_classes || 0;
      const us = usageByTxn[it.id] || [];
      for (let k = 0; k < n; k++) slots.push({ type: it.type, usage: us[k] || null, txnId: it.id });
    }
  }
  const reportedSlots = slots.filter((s) => s.usage && s.usage.report_id);
  const reservedSlots = slots.filter((s) => s.usage && !s.usage.report_id);
  const freeSlots = slots.filter((s) => !s.usage);

  const consumedUnits = [];
  for (const t of consumedTxns || []) {
    const q = Math.abs(t.total_classes || 0);
    const label = t.type === 'refund' ? (tr ? tr('rc.refunded') : 'Refunded') : t.notes || (tr ? tr('rc.transferredOut') : 'Transferred out');
    const typeTxt = t.type === 'refund' ? (tr ? tr('rmod.typeRefund') : 'Refund') : (tr ? tr('rmod.typeTransfer') : 'Transfer');
    for (let i = 0; i < q; i++) consumedUnits.push({ label, typeTxt, date: t.date || '' });
  }
  const consumedSlots = freeSlots.slice(0, consumedUnits.length);
  const remaining = opts.remainingCls != null ? opts.remainingCls : slots.length - reportedSlots.length - consumedUnits.length;
  const reservedShown = opts.unlimited ? reservedSlots : reservedSlots.slice(0, Math.max(0, remaining));
  const availableCount = opts.unlimited ? 0 : Math.max(0, remaining - reservedShown.length);
  // When deductions (manual subtract / refund / transfer-out) shrink the balance below the
  // number of free slots, consume the OLDEST classes first (FIFO) and keep the NEWEST
  // additions visible — so a freshly-added Promo/Compensation row shows its OWN type
  // instead of being hidden behind an earlier Manual/Class-Package slot.
  const availPool = freeSlots.slice(consumedUnits.length);
  const availableSlots = availableCount >= availPool.length ? availPool : availPool.slice(availPool.length - availableCount);

  const matOf = (u) => (u.report_id ? u.report_book || u.materials || '' : u.materials || '');
  const pagesOf = (u) => (u.report_id ? u.report_pages || u.pages || '' : u.pages || '');
  const durOf = (u) => (u.report_id ? u.report_duration || u.duration || '' : u.duration || '');
  const teacherOf = (u) => {
    const id = u && u.schedule_teacher_id;
    const t = id && teachers ? teachers.find((x) => x.id == id) : null;
    return t ? t.fullname : '';
  };
  const typeCellStyle = { fontSize: 11, color: 'var(--text3)' };

  const rows = [];
  let no = 0;
  // Consumed (transferred-out / refunded) rows go at the TOP of the list.
  for (let i = 0; i < consumedSlots.length; i++) {
    const cu = consumedUnits[i];
    const rem = cu.label + (cu.date ? ' · ' + cu.date : '');
    rows.push({
      cls: 'row-consumed',
      cells: [
        { text: '' }, { text: cu.typeTxt, style: typeCellStyle }, { text: '' }, { text: '' },
        { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: rem },
      ],
    });
  }
  for (const s of reportedSlots) {
    no++;
    const u = s.usage;
    // Absence class-flag keys off the English label (getReportAbsentLabel) so
    // the CSS highlight is language-independent; the shown text uses `tr`.
    const absentEn = getReportAbsentLabel({ absent: 1, absent_reason: u.report_absent_reason, absent_other: u.report_absent_other });
    const remarks = u.report_absent
      ? (tr ? getReportAbsentLabelT({ absent: 1, absent_reason: u.report_absent_reason, absent_other: u.report_absent_other }, tr) : absentEn)
      : (tr ? tr('rc.completed') : 'Completed');
    const absClass = u.report_absent && absentEn.toLowerCase().startsWith('absent') ? 'row-absent' : '';
    rows.push({
      cls: absClass,
      cells: [
        { text: no }, { text: typeLabel(s.type, tr), style: typeCellStyle }, { text: matOf(u) },
        { text: pagesOf(u) }, { text: u.date || '' }, { text: u.time || '' }, { text: durOf(u) },
        { text: teacherOf(u) }, { text: remarks },
      ],
    });
  }
  for (const s of reservedShown) {
    no++;
    const u = s.usage;
    rows.push({
      cls: '',
      cells: [
        { text: no }, { text: typeLabel(s.type, tr), style: typeCellStyle }, { text: u.materials || '' },
        { text: u.pages || '' }, { text: u.date || '' }, { text: u.time || '' }, { text: u.duration || '' },
        { text: teacherOf(u) }, { text: '' },
      ],
    });
  }
  for (const s of availableSlots) {
    no++;
    rows.push({
      cls: '',
      // Available (unused) slot — the only kind the inline editor may remove. srcTxnId is the
      // addition txn whose total/remaining we decrement server-side (guarded there too).
      removable: true,
      srcTxnId: s.txnId,
      cells: [
        { text: no }, { text: typeLabel(s.type, tr), style: typeCellStyle }, { text: '' }, { text: '' },
        { text: '' }, { text: '' }, { text: '' }, { text: '' }, { text: '' },
      ],
    });
  }
  return rows;
}

// One-shot fetch + assembly used by the XLSX exporters (the modal builds these in
// two render passes itself). Returns { model, usageRows } or { model:{notFound} }.
export async function fetchReceiptCard(studentId, receiptNo, studentName, teachers) {
  const txns = await apiFetch('/class-transactions?student_id=' + studentId);
  const list = Array.isArray(txns) ? txns : [];
  const model = buildCardModel(list, receiptNo, studentName, teachers);
  if (!model || model.notFound) return { model: { notFound: true } };
  let usageRows = [];
  if (model.tableSources.length) {
    usageRows = await loadMergedUsage(model.tableSources, model.isUnlimited ? [] : model.consumedTxns, teachers, {
      remainingCls: model.remaining,
      unlimited: model.isUnlimited,
    });
  }
  return { model, usageRows };
}
