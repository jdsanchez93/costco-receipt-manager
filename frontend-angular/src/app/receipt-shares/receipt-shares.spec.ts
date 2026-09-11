import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Clipboard } from '@angular/cdk/clipboard';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, of, throwError } from 'rxjs';

import { ReceiptShares } from './receipt-shares';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptShareDto } from '../api/types';

const DAY_MS = 86_400_000;

const share = (
  shareToken: string,
  extra: Partial<ReceiptShareDto> = {},
): ReceiptShareDto => ({
  id: 1,
  receiptId: 'abc',
  shareToken,
  shareUrl: `http://localhost:4200/shared-receipt/${shareToken}`,
  ownerUserId: 'auth0|me',
  createdAt: '2026-01-01T00:00:00Z',
  expiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
  isActive: true,
  currentUses: 0,
  ...extra,
});

describe('ReceiptShares', () => {
  let fixture: ComponentFixture<ReceiptShares>;
  let component: ReceiptShares;
  let apiSpy: {
    getShares: ReturnType<typeof vi.fn>;
    createShare: ReturnType<typeof vi.fn>;
    deactivateShare: ReturnType<typeof vi.fn>;
  };
  let snackSpy: { open: ReturnType<typeof vi.fn> };
  let clipboardSpy: { copy: ReturnType<typeof vi.fn> };

  function setup(opts: {
    getShares?: () => Observable<unknown>;
    createShare?: () => Observable<unknown>;
    deactivateShare?: () => Observable<unknown>;
    clipboardOk?: boolean;
  } = {}): void {
    apiSpy = {
      getShares: vi.fn().mockImplementation(
        () => (opts.getShares ?? (() => of([share('tok-a')])))(),
      ),
      createShare: vi.fn().mockImplementation(
        () => (opts.createShare ?? (() => of({ shareToken: 'new', shareUrl: 'u', expiresAt: 'x' })))(),
      ),
      deactivateShare: vi.fn().mockImplementation(
        () => (opts.deactivateShare ?? (() => of(void 0)))(),
      ),
    };
    snackSpy = { open: vi.fn() };
    clipboardSpy = { copy: vi.fn().mockReturnValue(opts.clipboardOk ?? true) };

    TestBed.configureTestingModule({
      imports: [ReceiptShares],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: apiSpy },
        { provide: MatSnackBar, useValue: snackSpy },
        { provide: Clipboard, useValue: clipboardSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptShares);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('receiptId', 'abc');
    fixture.detectChanges();
  }

  it('loads share links on init and renders them', () => {
    setup();
    expect(apiSpy.getShares).toHaveBeenCalledWith('abc');
    const s = component.state();
    expect(s.kind).toBe('ok');
    const text = (fixture.nativeElement.textContent as string).replace(/\s+/g, ' ');
    expect(text).toContain('Share links (1)');
    expect(text).toContain('http://localhost:4200/shared-receipt/tok-a');
  });

  it('enters error state with the backend message when the load fails', () => {
    setup({ getShares: () => throwError(() => ({ error: { error: 'No' } })) });
    const s = component.state();
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.message).toBe('No');
  });

  describe('expiry helpers', () => {
    it('labels and states a link by how soon it expires', () => {
      setup();
      const soon = new Date(Date.now() + 2 * DAY_MS + 3600_000).toISOString();
      const far = new Date(Date.now() + 40 * DAY_MS).toISOString();
      const past = new Date(Date.now() - DAY_MS).toISOString();

      expect(component.expiryLabel(soon)).toBe('Expires in 3 days');
      expect(component.expiryState(soon)).toBe('soon');
      expect(component.expiryState(far)).toBe('ok');
      expect(component.expiryLabel(past)).toBe('Expired');
      expect(component.expiryState(past)).toBe('expired');
    });

    it('maps expiry state to a status-badge tone', () => {
      setup();
      const soon = new Date(Date.now() + 2 * DAY_MS + 3600_000).toISOString();
      const far = new Date(Date.now() + 40 * DAY_MS).toISOString();
      const past = new Date(Date.now() - DAY_MS).toISOString();

      expect(component.expiryTone(past)).toBe('error');
      expect(component.expiryTone(soon)).toBe('warning');
      expect(component.expiryTone(far)).toBe('neutral');
    });
  });

  it('renders the expiry as an app-status-badge', () => {
    setup();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('app-status-badge .badge');
    expect(badge).not.toBeNull();
  });

  describe('submitCreate', () => {
    it('creates with the selected preset then refetches the list', () => {
      setup();
      component.openForm();
      component.preset = 90;
      component.submitCreate();

      expect(apiSpy.createShare).toHaveBeenCalledWith('abc', 90);
      expect(apiSpy.getShares).toHaveBeenCalledTimes(2); // init + post-create
      expect(component.formOpen()).toBe(false);
      expect(snackSpy.open).toHaveBeenCalledWith('Share link created.', 'Dismiss', expect.anything());
    });

    it('clamps a custom day count to the backend 1–365 range', () => {
      setup();
      component.openForm();
      component.preset = 'custom';
      component.customDays = 5000;
      component.submitCreate();

      expect(apiSpy.createShare).toHaveBeenCalledWith('abc', 365);
    });

    it('surfaces the backend error and keeps the form open on failure', () => {
      setup({
        createShare: () => throwError(() => ({ error: { error: 'expiresInDays must be between 1 and 365' } })),
      });
      component.openForm();
      component.submitCreate();

      expect(snackSpy.open).toHaveBeenCalledWith(
        'expiresInDays must be between 1 and 365',
        'Dismiss',
        expect.anything(),
      );
      expect(component.busy()).toBe(false);
      expect(component.formOpen()).toBe(true);
    });
  });

  describe('copyLink', () => {
    it('copies the share URL and toasts success', () => {
      setup();
      component.copyLink(share('tok-a'));
      expect(clipboardSpy.copy).toHaveBeenCalledWith(
        'http://localhost:4200/shared-receipt/tok-a',
      );
      expect(snackSpy.open).toHaveBeenCalledWith('Link copied.', 'Dismiss', expect.anything());
    });

    it('toasts a failure when the clipboard write is rejected', () => {
      setup({ clipboardOk: false });
      component.copyLink(share('tok-a'));
      expect(snackSpy.open).toHaveBeenCalledWith('Could not copy link.', 'Dismiss', expect.anything());
    });
  });

  describe('confirmRevoke', () => {
    it('deactivates the link and drops it from the list', () => {
      setup({ getShares: () => of([share('tok-a'), share('tok-b')]) });
      component.pendingRevokeToken.set('tok-a');
      component.confirmRevoke(share('tok-a'));

      expect(apiSpy.deactivateShare).toHaveBeenCalledWith('abc', 'tok-a');
      const s = component.state();
      expect(s.kind === 'ok' && s.data.map(x => x.shareToken)).toEqual(['tok-b']);
      expect(component.pendingRevokeToken()).toBeNull();
    });

    it('clears the prompt and toasts on failure', () => {
      setup({
        deactivateShare: () => throwError(() => ({ error: { error: 'Share not found' } })),
      });
      component.pendingRevokeToken.set('tok-a');
      component.confirmRevoke(share('tok-a'));

      expect(component.pendingRevokeToken()).toBeNull();
      expect(snackSpy.open).toHaveBeenCalledWith('Share not found', 'Dismiss', expect.anything());
    });
  });
});
