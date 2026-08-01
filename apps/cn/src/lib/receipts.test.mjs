import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getOldestReceiptAllocations,
  getReceiptGroups,
} from './receiptSelection.js';
import { isValidReceiptNo } from './receiptValidation.js';

const transactions = [
  { id: 10, receipt_no: '2026-118', type: 'purchase', remaining_classes: 2 },
  { id: 20, receipt_no: '2026-119', type: 'purchase', remaining_classes: 4 },
  // This later credit must not make receipt 118 become the latest receipt.
  { id: 30, receipt_no: '2026-118', type: 'compensation', remaining_classes: 1 },
];

test('receipt groups retain the issue order after later credits', () => {
  assert.deepEqual(getReceiptGroups(transactions).map((group) => group.receiptNo), ['2026-118', '2026-119']);
});

test('deductions consume the oldest receipt before newer receipts', () => {
  assert.deepEqual(getOldestReceiptAllocations(transactions, 4), [
    { receiptNo: '2026-118', classes: 3 },
    { receiptNo: '2026-119', classes: 1 },
  ]);
});

test('receipt numbers accept more than three sequence digits', () => {
  assert.equal(isValidReceiptNo('2026-001'), true);
  assert.equal(isValidReceiptNo('2026-0001'), true);
  assert.equal(isValidReceiptNo('2026-1000'), true);
  assert.equal(isValidReceiptNo('2026-99'), false);
  assert.equal(isValidReceiptNo('DEMO-2026-001'), false);
});
