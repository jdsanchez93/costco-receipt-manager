import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MemberTotals } from './member-totals';
import { ReceiptMemberDto } from '../api/types';
import { EnrichedItem } from '../receipts/receipt-view';

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

const enriched = (
  id: number,
  price: number,
  assignedMemberIds: number[],
  discount: number | null = null,
): EnrichedItem => ({
  id,
  receiptId: 'abc',
  itemIndex: id,
  itemNumber: null,
  itemName: `Item ${id}`,
  price,
  discount,
  assignedMemberIds,
  assigneeNames: [],
  createdAt: '2026-01-01T00:00:00Z',
});

describe('MemberTotals', () => {
  let fixture: ComponentFixture<MemberTotals>;
  let component: MemberTotals;

  function setup(items: EnrichedItem[], members: ReceiptMemberDto[]): void {
    TestBed.configureTestingModule({ imports: [MemberTotals] }).compileComponents();
    fixture = TestBed.createComponent(MemberTotals);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('items', items);
    fixture.componentRef.setInput('members', members);
    fixture.detectChanges();
  }

  it('renders a row per member with their split total and a reconciled badge', () => {
    setup(
      [enriched(1, 10, [1, 2]), enriched(2, 6, [1])],
      [member(1, 'Alice'), member(2, 'Bob')],
    );
    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('Alice');
    expect(text).toContain('$11.00'); // 5 + 6
    expect(text).toContain('$5.00'); // Bob
    expect(text).toContain('Balanced');
    expect(component.reconciled()).toBe(true);
  });

  it('shows an unassigned row and stays reconciled', () => {
    setup([enriched(1, 8, [])], [member(1, 'Alice')]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Unassigned');
    expect(text).toContain('not split');
    expect(component.reconciled()).toBe(true);
  });

  it('flags a discrepancy when an assignee is not a current member', () => {
    setup([enriched(1, 10, [1, 99])], [member(1, 'Alice')]);
    expect(component.reconciled()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Off by');
  });

  it('handles an empty roster', () => {
    setup([], []);
    expect(fixture.nativeElement.textContent).toContain('nothing to split');
  });

  describe('debugBadAssignment', () => {
    it('flips a reconciled receipt to a discrepancy without touching the input items', () => {
      const items = [enriched(1, 10, [1])];
      setup(items, [member(1, 'Alice')]);
      expect(component.reconciled()).toBe(true);

      component.debugBadAssignment.set(true);
      fixture.detectChanges();

      expect(component.reconciled()).toBe(false);
      expect(fixture.nativeElement.textContent).toContain('Off by');
      // The input array itself is untouched — this is display-only.
      expect(items[0].assignedMemberIds).toEqual([1]);

      component.debugBadAssignment.set(false);
      fixture.detectChanges();
      expect(component.reconciled()).toBe(true);
    });

    it('is a no-op with no items', () => {
      setup([], [member(1, 'Alice')]);
      component.debugBadAssignment.set(true);
      expect(component.reconciled()).toBe(true);
    });
  });
});
