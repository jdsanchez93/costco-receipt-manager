import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { SharedReceipt } from './shared-receipt';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptItemDto, ReceiptMemberDto, SharedReceiptResponse } from '../api/types';

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
});

const item = (id: number, price: number, assignedMemberIds: number[]): ReceiptItemDto => ({
  id,
  receiptId: 'abc',
  itemIndex: id,
  itemNumber: null,
  itemName: `Item ${id}`,
  price,
  discount: null,
  assignedMemberIds,
  createdAt: '2026-01-01T00:00:00Z',
});

const response = (): SharedReceiptResponse => ({
  receiptId: 'abc',
  items: [item(1, 10, [1]), item(2, 4, [])],
  members: [member(1, 'Alice')],
  geometry: { subtotalMatch: { ocrSubtotal: null, calculatedSubtotal: 14, difference: null, matches: null } },
  shareInfo: { createdAt: '2026-01-01T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z' },
});

describe('SharedReceipt', () => {
  let fixture: ComponentFixture<SharedReceipt>;
  let component: SharedReceipt;

  function setup(opts: {
    shareToken?: string | null;
    getSharedReceipt?: () => Observable<unknown>;
  } = {}): void {
    const token = 'shareToken' in opts ? opts.shareToken : 'tok-1';
    const apiSpy = {
      getSharedReceipt: vi
        .fn()
        .mockImplementation(() => (opts.getSharedReceipt ?? (() => of(response())))()),
    };

    TestBed.configureTestingModule({
      imports: [SharedReceipt],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: apiSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: (_: string) => token } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SharedReceipt);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('loads the shared receipt and renders items + totals', () => {
    setup();
    const s = component.state();
    expect(s.kind).toBe('ok');
    expect(component.total()).toBe(14);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('app-receipt-items')).not.toBeNull();
    expect(host.querySelector('app-member-totals')).not.toBeNull();
    expect(host.textContent).toContain('Get started');
  });

  it('shows an invalid/expired message on a 404', () => {
    setup({
      getSharedReceipt: () =>
        throwError(() => new HttpErrorResponse({ status: 404, error: { error: 'nope' } })),
    });
    const s = component.state();
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.message).toBe('This share link is invalid or has expired.');
  });

  it('shows a generic message on other errors', () => {
    setup({
      getSharedReceipt: () => throwError(() => new HttpErrorResponse({ status: 500 })),
    });
    const s = component.state();
    if (s.kind === 'error') expect(s.message).toBe("Couldn't load this shared receipt.");
  });

  it('errors immediately when the route has no token', () => {
    setup({ shareToken: null });
    expect(component.state().kind).toBe('error');
  });
});
