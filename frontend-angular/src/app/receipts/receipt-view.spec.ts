import { ReceiptItemDto, ReceiptMemberDto } from '../api/types';
import { computeMemberTotals, enrichItems, receiptTotal } from './receipt-view';

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

describe('computeMemberTotals', () => {
  it('splits price and discount equally across assignees', () => {
    const members = [member(1, 'Alice'), member(2, 'Bob')];
    const items = [
      item(1, 10, [1, 2], 2), // 4 each after discount
      item(2, 6, [1]), // Alice only
    ];
    const r = computeMemberTotals(items, members);

    const alice = r.perMember.find(m => m.memberId === 1)!;
    const bob = r.perMember.find(m => m.memberId === 2)!;
    expect(alice.total).toBeCloseTo(10, 5); // 4 + 6
    expect(alice.itemCount).toBe(2);
    expect(bob.total).toBeCloseTo(4, 5);
    expect(r.unassigned.total).toBe(0);
    expect(r.discrepancy).toBeCloseTo(0, 5);
  });

  it('routes unassigned items to their own bucket at full value', () => {
    const r = computeMemberTotals([item(1, 12, [], 2)], [member(1, 'Alice')]);
    expect(r.unassigned).toEqual({ itemCount: 1, subtotal: 12, discount: 2, total: 10 });
    expect(r.perMember[0].total).toBe(0);
    expect(r.discrepancy).toBeCloseTo(0, 5);
  });

  it('drops the share of an assignee with no matching member and reports it as discrepancy', () => {
    const r = computeMemberTotals([item(1, 10, [1, 99])], [member(1, 'Alice')]);
    expect(r.perMember[0].total).toBeCloseTo(5, 5);
    expect(r.assignedTotal).toBeCloseTo(5, 5);
    expect(r.grandTotal).toBe(10);
    expect(r.discrepancy).toBeCloseTo(5, 5);
  });
});
