// Pure receipt-selection helpers. Kept separate from API code so the same
// business rules can be tested outside the browser.

// Group transactions by receipt. A receipt's age is its first transaction, not
// its most recently added bonus/transfer row. This keeps later adjustments from
// changing which receipt is considered oldest/newest.
export function getReceiptGroups(txns) {
  const groups = new Map();
  for (const txn of Array.isArray(txns) ? txns : []) {
    const receiptNo = String(txn.receipt_no || '').trim();
    if (!receiptNo) continue;
    const id = Number(txn.id) || 0;
    const group = groups.get(receiptNo) || {
      receiptNo,
      firstId: id || Number.MAX_SAFE_INTEGER,
      remaining: 0,
    };
    group.firstId = Math.min(group.firstId, id || Number.MAX_SAFE_INTEGER);
    if (!['monthly-fee', 'cancel-monthly-fee', 'monthly-fee-payment'].includes(txn.type)) {
      group.remaining += Number(txn.remaining_classes) || 0;
    }
    groups.set(receiptNo, group);
  }
  return [...groups.values()].sort((a, b) => a.firstId - b.firstId || a.receiptNo.localeCompare(b.receiptNo));
}

// Split a deduction across receipts in oldest-first order. Keeping each negative
// transfer row on its source receipt prevents a transfer from making the oldest
// receipt negative while later receipts still have unused classes.
export function getOldestReceiptAllocations(txns, classes) {
  let left = Number(classes) || 0;
  if (left <= 0) return [];
  const allocations = [];
  for (const group of getReceiptGroups(txns)) {
    const available = Math.max(0, group.remaining);
    if (!available) continue;
    const count = Math.min(left, available);
    allocations.push({ receiptNo: group.receiptNo, classes: count });
    left -= count;
    if (!left) break;
  }
  return left ? [] : allocations;
}
