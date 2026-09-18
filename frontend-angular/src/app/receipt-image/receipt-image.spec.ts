import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, throwError } from 'rxjs';

import { ReceiptImage } from './receipt-image';
import { ReceiptsApi } from '../api/receipts-api';

describe('ReceiptImage', () => {
  let fixture: ComponentFixture<ReceiptImage>;
  let component: ReceiptImage;
  let apiSpy: { getDownloadUrl: ReturnType<typeof vi.fn> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };

  function setup(opts: { getDownloadUrl?: () => Observable<unknown> } = {}): void {
    apiSpy = {
      getDownloadUrl: vi.fn().mockImplementation(
        () => (opts.getDownloadUrl ?? (() => of({ downloadUrl: 'https://s3/img.jpg', expiresIn: 3600 })))(),
      ),
    };
    dialogSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [ReceiptImage],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: apiSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptImage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('receiptId', 'abc');
    fixture.detectChanges();
  }

  it('loads the download URL on init and renders the image', () => {
    setup();
    expect(apiSpy.getDownloadUrl).toHaveBeenCalledWith('abc');
    const s = component.state();
    expect(s.kind).toBe('ok');
    const img = (fixture.nativeElement as HTMLElement).querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://s3/img.jpg');
  });

  it('enters error state with the backend message when the URL fetch fails', () => {
    setup({ getDownloadUrl: () => throwError(() => ({ error: { error: 'Receipt not found' } })) });
    const s = component.state();
    expect(s.kind).toBe('error');
    if (s.kind === 'error') expect(s.message).toBe('Receipt not found');
  });

  it('shows a "no image available" message when the <img> itself fails to load', () => {
    setup();
    component.onImageError();
    fixture.detectChanges();
    expect(component.loadFailed()).toBe(true);
    const text = (fixture.nativeElement.textContent as string);
    expect(text).toContain('No receipt image available.');
  });

  it('opens the fullscreen dialog with the image URL', () => {
    setup();
    component.openFullscreen('https://s3/img.jpg');
    expect(dialogSpy.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: { imageUrl: 'https://s3/img.jpg' } }),
    );
  });
});
