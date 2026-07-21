// Receipt numbers use a four-digit year and at least a three-digit sequence.
// The sequence has no upper bound, so the system continues past 999 receipts.
export function isValidReceiptNo(no) {
  return /^\d{4}-\d{3,}$/.test((no || '').trim());
}
