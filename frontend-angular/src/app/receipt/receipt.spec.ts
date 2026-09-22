import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, of, throwError } from 'rxjs';

import { Receipt } from './receipt';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptItemDto, ReceiptMemberDto, ReceiptSummaryDto } from '../api/types';

const summary = (extra: Partial<ReceiptSummaryDto> = {}): ReceiptSummaryDto => ({
  receiptId: 'abc',
  processingStatus: 'completed',
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const member = (id: number, displayName: string, extra: Partial<ReceiptMemberDto> = {}): ReceiptMemberDto => ({
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
  ...extra,
});

const item = (id: number, itemName: string, price: number, extra: Partial<ReceiptItemDto> = {}): ReceiptItemDto => ({
  id,
  receiptId: 'abc',
  itemIndex: id,
  itemNumber: null,
  itemName,
  price,
  discount: null,
  assignedMemberIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('Receipt', () => {
  let fixture: ComponentFixture<Receipt>;
  let component: Receipt;
  let apiSpy: {
    getReceipt: ReturnType<typeof vi.fn>;
    getReceiptItems: ReturnType<typeof vi.fn>;
    getReceiptMembers: ReturnType<typeof vi.fn>;
    getReceiptGeometry: ReturnType<typeof vi.fn>;
    updateItemAssignment: ReturnType<typeof vi.fn>;
    bulkUpdateAssignments: ReturnType<typeof vi.fn>;
    addReceiptMember: ReturnType<typeof vi.fn>;
    updateMemberRole: ReturnType<typeof vi.fn>;
    removeReceiptMember: ReturnType<typeof vi.fn>;
    getShares: ReturnType<typeof vi.fn>;
    getDownloadUrl: ReturnType<typeof vi.fn>;
  };
  let snackSpy: { open: ReturnType<typeof vi.fn> };

  function setup(opts: {
    receiptId?: string | null;
    summary?: Observable<ReceiptSummaryDto>;
    items?: Observable<ReceiptItemDto[]>;
    members?: Observable<ReceiptMemberDto[]>;
    user?: Observable<{ sub?: string } | undefined>;
    updateItemAssignment?: () => Observable<void>;
    bulkUpdateAssignments?: () => Observable<void>;
  }): void {
    const receiptId = 'receiptId' in opts ? opts.receiptId : 'abc';
    apiSpy = {
      getReceipt: vi.fn().mockReturnValue(opts.summary ?? of(summary())),
      getReceiptItems: vi.fn().mockReturnValue(opts.items ?? of([])),
      getReceiptMembers: vi.fn().mockReturnValue(opts.members ?? of([])),
      getReceiptGeometry: vi.fn().mockReturnValue(
        of({ subtotalMatch: { ocrSubtotal: null, calculatedSubtotal: 0, difference: null, matches: null } }),
      ),
      updateItemAssignment: vi.fn().mockImplementation(
        () => (opts.updateItemAssignment ?? (() => of(void 0)))(),
      ),
      bulkUpdateAssignments: vi.fn().mockImplementation(
        () => (opts.bulkUpdateAssignments ?? (() => of(void 0)))(),
      ),
      addReceiptMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeReceiptMember: vi.fn(),
      getShares: vi.fn().mockReturnValue(of([])),
      getDownloadUrl: vi.fn().mockReturnValue(of({ downloadUrl: 'https://s3/img.jpg', expiresIn: 3600 })),
    };
    snackSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [Receipt],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (_: string) => receiptId } },
          },
        },
        { provide: ReceiptsApi, useValue: apiSpy },
        { provide: MatSnackBar, useValue: snackSpy },
        { provide: AuthService, useValue: { user$: opts.user ?? of(undefined) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Receipt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('enters error state when the receiptId param is missing', () => {
    setup({ receiptId: null });
    expect(component.state().kind).toBe('error');
  });

  it('enters ok state after successful load and resolves assignee names', () => {
    const members = [member(1, 'Alice'), member(2, 'Bob')];
    const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1, 2] })];
    setup({ items: of(items), members: of(members) });

    const s = component.state();
    expect(s.kind).toBe('ok');
    if (s.kind === 'ok') {
      expect(s.data.items[0].assigneeNames).toEqual(['Alice', 'Bob']);
    }
  });

  it('computes total as sum of price minus discount', () => {
    const items = [
      item(1, 'A', 10, { discount: 2 }),   // net 8
      item(2, 'B', 5),                      // net 5
      item(3, 'C', 3.5, { discount: 0.5 }), // net 3
    ];
    setup({ items: of(items) });
    expect(component.total()).toBe(16);
  });

  it('enters error state when the API fails', () => {
    setup({ items: throwError(() => new Error('boom')) });
    const s = component.state();
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.message).toBe('boom');
  });

  describe('onAssignmentChange', () => {
    it('optimistically updates the item and calls the API', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1] })];
      setup({ items: of(items), members: of(members) });

      const enriched = (component.state() as { kind: 'ok'; data: { items: any[] } }).data.items[0];
      component.onAssignmentChange(enriched, [1, 2]);

      // State reflects new assignments immediately
      const s = component.state() as { kind: 'ok'; data: { items: any[] } };
      expect(s.data.items[0].assignedMemberIds).toEqual([1, 2]);
      expect(s.data.items[0].assigneeNames).toEqual(['Alice', 'Bob']);
      expect(apiSpy.updateItemAssignment).toHaveBeenCalledWith('abc', 10, [1, 2]);
    });

    it('skips the API call when nothing actually changed', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1, 2] })];
      setup({ items: of(items), members: of(members) });

      const enriched = (component.state() as { kind: 'ok'; data: { items: any[] } }).data.items[0];
      // Same ids, different order — should still be a no-op.
      component.onAssignmentChange(enriched, [2, 1]);

      expect(apiSpy.updateItemAssignment).not.toHaveBeenCalled();
    });

    it('reverts the item and toasts the user when the API fails', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1] })];
      setup({
        items: of(items),
        members: of(members),
        updateItemAssignment: () => throwError(() => new Error('nope')),
      });

      const enriched = (component.state() as { kind: 'ok'; data: { items: any[] } }).data.items[0];
      component.onAssignmentChange(enriched, [1, 2]);

      const s = component.state() as { kind: 'ok'; data: { items: any[] } };
      expect(s.data.items[0].assignedMemberIds).toEqual([1]);
      expect(s.data.items[0].assigneeNames).toEqual(['Alice']);
      expect(snackSpy.open).toHaveBeenCalledOnce();
    });
  });

  describe('add / remove helpers', () => {
    it('addAssignment appends the member id and triggers a PUT', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1] })];
      setup({ items: of(items), members: of(members) });

      const enriched = (component.state() as { kind: 'ok'; data: { items: any[] } }).data.items[0];
      component.addAssignment(enriched, 2);

      expect(apiSpy.updateItemAssignment).toHaveBeenCalledWith('abc', 10, [1, 2]);
    });

    it('addAssignment is idempotent — no PUT if member already assigned', () => {
      const members = [member(1, 'Alice')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1] })];
      setup({ items: of(items), members: of(members) });

      const enriched = (component.state() as { kind: 'ok'; data: { items: any[] } }).data.items[0];
      component.addAssignment(enriched, 1);

      expect(apiSpy.updateItemAssignment).not.toHaveBeenCalled();
    });

    it('removeAssignment filters out the member id and triggers a PUT', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1, 2] })];
      setup({ items: of(items), members: of(members) });

      const enriched = (component.state() as { kind: 'ok'; data: { items: any[] } }).data.items[0];
      component.removeAssignment(enriched, 1);

      expect(apiSpy.updateItemAssignment).toHaveBeenCalledWith('abc', 10, [2]);
    });
  });

  it('renders the item list and per-member totals through the child components', () => {
    setup({
      items: of([item(10, 'Milk', 4, { assignedMemberIds: [1] })]),
      members: of([member(1, 'Alice')]),
    });
    expect(fixture.nativeElement.querySelector('app-receipt-items')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-member-totals')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-receipt-image')).not.toBeNull();
    expect(apiSpy.getDownloadUrl).toHaveBeenCalledWith('abc');
  });

  describe('bulk selection', () => {
    it('toggleItemSelection adds and removes ids', () => {
      setup({ items: of([item(1, 'A', 5), item(2, 'B', 10)]) });

      component.toggleItemSelection(1);
      expect(component.selectedItemIds().has(1)).toBe(true);
      expect(component.someSelected()).toBe(true);
      expect(component.partialSelection()).toBe(true);
      expect(component.allSelected()).toBe(false);

      component.toggleItemSelection(1);
      expect(component.selectedItemIds().size).toBe(0);
    });

    it('toggleSelectAll adds every id then clears', () => {
      setup({ items: of([item(1, 'A', 5), item(2, 'B', 10)]) });

      component.toggleSelectAll();
      expect(component.selectedItemIds().size).toBe(2);
      expect(component.allSelected()).toBe(true);

      component.toggleSelectAll();
      expect(component.selectedItemIds().size).toBe(0);
    });
  });

  describe('bulkAssignTo', () => {
    it('adds the member to every selected item that does not yet have them', () => {
      const members = [member(1, 'Alice')];
      const items = [
        item(10, 'A', 5, { assignedMemberIds: [] }),
        item(20, 'B', 10, { assignedMemberIds: [1] }), // already has Alice
        item(30, 'C', 15, { assignedMemberIds: [] }),
      ];
      setup({ items: of(items), members: of(members) });

      component.toggleSelectAll();
      component.bulkAssignTo(1);

      expect(apiSpy.bulkUpdateAssignments).toHaveBeenCalledWith('abc', [
        { itemId: 10, assignedMemberIds: [1] },
        { itemId: 30, assignedMemberIds: [1] },
      ]);
      // Selection cleared on success
      expect(component.selectedItemIds().size).toBe(0);
    });

    it('no-ops when everything selected already has the member', () => {
      const members = [member(1, 'Alice')];
      const items = [item(10, 'A', 5, { assignedMemberIds: [1] })];
      setup({ items: of(items), members: of(members) });

      component.toggleSelectAll();
      component.bulkAssignTo(1);

      expect(apiSpy.bulkUpdateAssignments).not.toHaveBeenCalled();
      expect(component.selectedItemIds().size).toBe(0);
    });
  });

  describe('splitEvenlySelected', () => {
    it('replaces each selected item\'s assignments with the full member roster', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [
        item(10, 'A', 5, { assignedMemberIds: [1] }),
        item(20, 'B', 10, { assignedMemberIds: [] }),
      ];
      setup({ items: of(items), members: of(members) });

      component.toggleSelectAll();
      component.splitEvenlySelected();

      expect(apiSpy.bulkUpdateAssignments).toHaveBeenCalledWith('abc', [
        { itemId: 10, assignedMemberIds: [1, 2] },
        { itemId: 20, assignedMemberIds: [1, 2] },
      ]);
      expect(component.selectedItemIds().size).toBe(0);
    });

    it('skips items already assigned to everyone', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'A', 5, { assignedMemberIds: [1, 2] })];
      setup({ items: of(items), members: of(members) });

      component.toggleSelectAll();
      component.splitEvenlySelected();

      expect(apiSpy.bulkUpdateAssignments).not.toHaveBeenCalled();
      expect(component.selectedItemIds().size).toBe(0);
    });

    it('reverts state and toasts when the bulk PUT fails', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'A', 5, { assignedMemberIds: [1] })];
      setup({
        items: of(items),
        members: of(members),
        bulkUpdateAssignments: () => throwError(() => new Error('nope')),
      });

      component.toggleSelectAll();
      component.splitEvenlySelected();

      const s = component.state() as { kind: 'ok'; data: { items: any[] } };
      expect(s.data.items[0].assignedMemberIds).toEqual([1]); // reverted
      expect(snackSpy.open).toHaveBeenCalledOnce();
    });
  });

  describe('canManageMembers', () => {
    it('is true when the signed-in user is an owner of this receipt', () => {
      setup({
        members: of([member(1, 'Alice', { userId: 'auth0|me', role: 'owner' })]),
        user: of({ sub: 'auth0|me' }),
      });
      expect(component.canManageMembers()).toBe(true);
    });

    it('is false when the signed-in user is only an editor', () => {
      setup({
        members: of([member(1, 'Alice', { userId: 'auth0|me', role: 'editor' })]),
        user: of({ sub: 'auth0|me' }),
      });
      expect(component.canManageMembers()).toBe(false);
    });

    it('is false when the profile has not resolved', () => {
      setup({
        members: of([member(1, 'Alice', { userId: 'auth0|me', role: 'owner' })]),
        user: of(undefined),
      });
      expect(component.canManageMembers()).toBe(false);
    });
  });

  describe('share-links panel', () => {
    it('renders for an owner', () => {
      setup({
        members: of([member(1, 'Alice', { userId: 'auth0|me', role: 'owner' })]),
        user: of({ sub: 'auth0|me' }),
      });
      expect(component.canManageShares()).toBe(true);
      expect(fixture.nativeElement.querySelector('app-receipt-shares')).not.toBeNull();
    });

    it('is hidden for a non-owner', () => {
      setup({
        members: of([member(1, 'Alice', { userId: 'auth0|me', role: 'editor' })]),
        user: of({ sub: 'auth0|me' }),
      });
      expect(component.canManageShares()).toBe(false);
      expect(fixture.nativeElement.querySelector('app-receipt-shares')).toBeNull();
    });
  });

  describe('OCR processing status', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('schedules a poll while pending, and applies the result once it completes', () => {
      vi.useFakeTimers();
      setup({ items: of([]), summary: of(summary({ processingStatus: 'pending' })) });

      let s = component.state() as { kind: 'ok'; data: { processingStatus: string } };
      expect(s.data.processingStatus).toBe('pending');
      expect(component.pollAttempts()).toBe(1);

      apiSpy.getReceiptItems.mockReturnValue(of([item(10, 'Milk', 3.99)]));
      apiSpy.getReceipt.mockReturnValue(of(summary({ processingStatus: 'completed' })));

      vi.advanceTimersByTime(2000); // the first poll's delay

      s = component.state() as { kind: 'ok'; data: { processingStatus: string } };
      expect(s.data.processingStatus).toBe('completed');
      expect((s as any).data.items.length).toBe(1);
      expect(apiSpy.getReceipt).toHaveBeenCalledTimes(2); // initial load + one poll
    });

    it('gives up after the max number of attempts, leaving pollExhausted() true', () => {
      vi.useFakeTimers();
      setup({ items: of([]), summary: of(summary({ processingStatus: 'pending' })) });

      // 2s + 4s + 8s + 16s + 32s + 64s = 126s covers all 6 scheduled attempts.
      vi.advanceTimersByTime(200_000);

      expect(component.pollAttempts()).toBe(6);
      expect(component.pollExhausted()).toBe(true);
      expect(apiSpy.getReceipt).toHaveBeenCalledTimes(7); // initial load + 6 polls
    });

    it('does not poll when processingStatus is failed', () => {
      vi.useFakeTimers();
      setup({ items: of([]), summary: of(summary({ processingStatus: 'failed' })) });

      vi.advanceTimersByTime(200_000);

      expect(component.pollAttempts()).toBe(0);
      expect(apiSpy.getReceipt).toHaveBeenCalledTimes(1);
    });

    it('load() restarts the backoff from the first attempt instead of continuing it', () => {
      vi.useFakeTimers();
      setup({ items: of([]), summary: of(summary({ processingStatus: 'pending' })) });

      vi.advanceTimersByTime(2000); // one poll fires and reschedules
      expect(component.pollAttempts()).toBe(2);

      // load() resets the counter before its own (synchronous, in this test)
      // fetch reschedules — so this should land back on the first attempt,
      // not continue counting up from where the old backoff left off.
      component.load();
      expect(component.pollAttempts()).toBe(1);
    });
  });

  describe('onMembersChange', () => {
    it('swaps in the new roster and re-resolves assignee names', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1, 2] })];
      setup({ items: of(items), members: of(members) });

      component.onMembersChange([member(1, 'Alicia'), member(2, 'Bob')]);

      const s = component.state() as { kind: 'ok'; data: { members: any[]; items: any[] } };
      expect(s.data.members[0].displayName).toBe('Alicia');
      expect(s.data.items[0].assigneeNames).toEqual(['Alicia', 'Bob']);
    });

    it('cascades a removed member off every item', () => {
      const members = [member(1, 'Alice'), member(2, 'Bob')];
      const items = [item(10, 'Milk', 3.99, { assignedMemberIds: [1, 2] })];
      setup({ items: of(items), members: of(members) });

      component.onMembersChange([member(1, 'Alice')]);

      const s = component.state() as { kind: 'ok'; data: { items: any[] } };
      expect(s.data.items[0].assignedMemberIds).toEqual([1]);
      expect(s.data.items[0].assigneeNames).toEqual(['Alice']);
    });
  });
});
