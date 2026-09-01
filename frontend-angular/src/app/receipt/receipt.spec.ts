import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { Receipt } from './receipt';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptItemDto, ReceiptMemberDto } from '../api/types';

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
  validationStatus: null,
  validatedAt: null,
  comments: null,
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

  function setup(opts: {
    receiptId?: string | null;
    items?: Observable<ReceiptItemDto[]>;
    members?: Observable<ReceiptMemberDto[]>;
  }): void {
    const receiptId = 'receiptId' in opts ? opts.receiptId : 'abc';
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
        {
          provide: ReceiptsApi,
          useValue: {
            getReceiptItems: () => opts.items ?? of([]),
            getReceiptMembers: () => opts.members ?? of([]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Receipt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('enters error state when the receiptId param is missing', () => {
    setup({ receiptId: null });
    const s = component.state();
    expect(s.kind).toBe('error');
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
});
