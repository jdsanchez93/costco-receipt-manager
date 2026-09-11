import { ReceiptItemDto, ReceiptMemberDto } from '../api/types';
import { enrichItems, receiptTotal } from './receipt-view';

const member = (id: number, displayName: string): ReceiptMemberDto => ({
  id,
  receiptId: 'abc',
  contactId: id,
  userId: null,
  displayName,
  email: null,
  role: 'editor',
  addedByMemberId: null,
  addedAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
  validationStatus: null,
  validatedAt: null,
  comments: null,
});

const item = (
  id: number,
  price: number,
  assignedMemberIds: number[],
  discount: number | null = null,
): ReceiptItemDto => ({
  id,
  receiptId: 'abc',
  itemIndex: id,
  itemNumber: null,
  itemName: `Item ${id}`,
  price,
  discount,
  assignedMemberIds,
  createdAt: '2026-01-01T00:00:00Z',
});

describe('receiptTotal', () => {
  it('sums price minus discount', () => {
    expect(receiptTotal([item(1, 10, [], 2), item(2, 5, []), item(3, 3.5, [], 0.5)])).toBe(16);
  });
});

describe('enrichItems', () => {
  it('resolves assignee ids to names, falling back to #id', () => {
    const [a] = enrichItems([item(1, 10, [1, 9])], [member(1, 'Alice')]);
    expect(a.assigneeNames).toEqual(['Alice', '#9']);
  });
});
