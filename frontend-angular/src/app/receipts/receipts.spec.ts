import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';

import { Receipts } from './receipts';
import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto } from '../api/types';

describe('Receipts', () => {
  let fixture: ComponentFixture<Receipts>;
  let component: Receipts;
  let router: Router;
  let getUserReceipts: ReturnType<typeof vi.fn>;

  function setup(response: Observable<ReceiptMemberDto[]>): void {
    getUserReceipts = vi.fn().mockReturnValue(response);
    TestBed.configureTestingModule({
      imports: [Receipts],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: { getUserReceipts } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Receipts);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  it('sets state to ok on successful load', () => {
    setup(of([]));
    expect(component.state().kind).toBe('ok');
  });

  it('sets state to error when the API fails', () => {
    setup(throwError(() => new Error('boom')));
    const s = component.state();
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.message).toBe('boom');
  });

  it('toggleUpload flips the upload panel open and shows app-receipt-upload', () => {
    setup(of([]));
    expect(component.uploadOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('app-receipt-upload')).toBeNull();

    component.toggleUpload();
    fixture.detectChanges();

    expect(component.uploadOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('app-receipt-upload')).not.toBeNull();
  });

  describe('onUploaded', () => {
    it('closes the panel, refreshes the list, and navigates when exactly one receipt was uploaded', () => {
      setup(of([]));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.toggleUpload();

      component.onUploaded(['r1']);

      expect(component.uploadOpen()).toBe(false);
      expect(getUserReceipts).toHaveBeenCalledTimes(2); // init + post-upload refresh
      expect(navigateSpy).toHaveBeenCalledWith(['/app/receipts', 'r1']);
    });

    it('does not navigate when multiple receipts were uploaded', () => {
      setup(of([]));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.onUploaded(['r1', 'r2']);

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(getUserReceipts).toHaveBeenCalledTimes(2);
    });
  });
});
