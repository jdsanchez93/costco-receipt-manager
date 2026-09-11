import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiptStats } from './receipt-stats';
import { SubtotalMatchDto } from '../api/types';

describe('ReceiptStats', () => {
  let fixture: ComponentFixture<ReceiptStats>;

  function setup(opts: {
    itemCount?: number;
    memberCount?: number;
    total?: number;
    subtotalMatch?: SubtotalMatchDto | null;
    expiresAt?: string | null;
  } = {}): void {
    TestBed.configureTestingModule({ imports: [ReceiptStats] }).compileComponents();
    fixture = TestBed.createComponent(ReceiptStats);
    fixture.componentRef.setInput('itemCount', opts.itemCount ?? 3);
    fixture.componentRef.setInput('memberCount', opts.memberCount ?? 2);
    fixture.componentRef.setInput('total', opts.total ?? 42);
    fixture.componentRef.setInput(
      'subtotalMatch',
      opts.subtotalMatch ?? { ocrSubtotal: 42, calculatedSubtotal: 42, difference: 0, matches: true },
    );
    if ('expiresAt' in opts) fixture.componentRef.setInput('expiresAt', opts.expiresAt);
    fixture.detectChanges();
  }

  it('renders item/people counts and the total', () => {
    setup({ itemCount: 5, memberCount: 3, total: 19.99 });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('5');
    expect(text).toContain('3');
    expect(text).toContain('19.99');
  });

  it('shows "Matches" when the subtotal matches', () => {
    setup({ subtotalMatch: { ocrSubtotal: 10, calculatedSubtotal: 10, difference: 0, matches: true } });
    expect(fixture.nativeElement.textContent).toContain('Matches');
  });

  it('shows the difference when the subtotal does not match', () => {
    setup({ subtotalMatch: { ocrSubtotal: 12, calculatedSubtotal: 10, difference: 2, matches: false } });
    expect(fixture.nativeElement.textContent).toContain('Off by');
  });

  it('shows "Unverified" when there is no OCR subtotal to compare', () => {
    setup({ subtotalMatch: { ocrSubtotal: null, calculatedSubtotal: 10, difference: null, matches: null } });
    expect(fixture.nativeElement.textContent).toContain('Unverified');
  });

  it('omits the "Link expires" cell when expiresAt is not set', () => {
    setup();
    expect(fixture.nativeElement.textContent).not.toContain('Link expires');
  });

  it('shows the "Link expires" cell when expiresAt is set', () => {
    setup({ expiresAt: '2026-02-01T00:00:00Z' });
    expect(fixture.nativeElement.textContent).toContain('Link expires');
  });
});
