import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, of, throwError } from 'rxjs';

import { ReceiptUpload } from './receipt-upload';
import { ReceiptsApi } from '../api/receipts-api';

function file(name: string, type = 'image/jpeg', sizeBytes = 1024): File {
  const f = new File([new Uint8Array(sizeBytes)], name, { type });
  return f;
}

function fileList(files: File[]): FileList {
  return files as unknown as FileList;
}

describe('ReceiptUpload', () => {
  let fixture: ComponentFixture<ReceiptUpload>;
  let component: ReceiptUpload;
  let apiSpy: {
    getUploadUrl: ReturnType<typeof vi.fn>;
    uploadToS3: ReturnType<typeof vi.fn>;
    deleteReceipt: ReturnType<typeof vi.fn>;
  };
  let snackSpy: { open: ReturnType<typeof vi.fn> };

  function setup(opts: {
    getUploadUrl?: (contentType?: string) => Observable<unknown>;
    uploadToS3?: () => Observable<unknown>;
    deleteReceipt?: () => Observable<unknown>;
  } = {}): void {
    apiSpy = {
      getUploadUrl: vi.fn().mockImplementation(
        (contentType?: string) =>
          (opts.getUploadUrl
            ?? (() => of({ receiptId: 'r1', uploadUrl: 'https://s3/x', expiresIn: 3600 })))(contentType),
      ),
      uploadToS3: vi.fn().mockImplementation(() => (opts.uploadToS3 ?? (() => of(void 0)))()),
      deleteReceipt: vi.fn().mockImplementation(() => (opts.deleteReceipt ?? (() => of(void 0)))()),
    };
    snackSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [ReceiptUpload],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: ReceiptsApi, useValue: apiSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptUpload);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('rejects an unsupported file type without selecting it', () => {
    setup();
    component['select'](fileList([file('doc.pdf', 'application/pdf')]));

    expect(component.selection()).toBeNull();
    expect(snackSpy.open).toHaveBeenCalledWith(
      'doc.pdf: unsupported file type.',
      'Dismiss',
      expect.anything(),
    );
  });

  it('rejects a file over the 10MB limit', () => {
    setup();
    const big = file('huge.jpg', 'image/jpeg', 11 * 1024 * 1024);
    component['select'](fileList([big]));

    expect(component.selection()).toBeNull();
    expect(snackSpy.open).toHaveBeenCalledWith(
      'huge.jpg: file is larger than 10MB.',
      'Dismiss',
      expect.anything(),
    );
  });

  it('selects only the first file when multiple are dropped, and warns about it', () => {
    setup();
    component['select'](fileList([file('a.jpg'), file('b.png', 'image/png')]));

    expect(component.selection()?.file.name).toBe('a.jpg');
    expect(snackSpy.open).toHaveBeenCalledWith(
      'Only one receipt can be uploaded at a time — using the first file.',
      'Dismiss',
      expect.anything(),
    );
  });

  it('selecting a new file replaces the current selection', () => {
    setup();
    component['select'](fileList([file('a.jpg')]));
    component['select'](fileList([file('b.png', 'image/png')]));

    expect(component.selection()?.file.name).toBe('b.png');
  });

  it('uploads the selected file and emits the resulting receiptId', () => {
    setup({
      getUploadUrl: () => of({ receiptId: 'r1', uploadUrl: 'https://s3/x', expiresIn: 3600 }),
    });
    let emitted: string | undefined;
    component.uploaded.subscribe(id => (emitted = id));

    component['select'](fileList([file('a.jpg')]));
    component.startUpload();

    expect(apiSpy.getUploadUrl).toHaveBeenCalledTimes(1);
    expect(apiSpy.uploadToS3).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(false);
    expect(component.selection()).toBeNull();
    expect(emitted).toBe('r1');
  });

  it('retries a failed getUploadUrl call by calling it again, since nothing was ever cached', () => {
    let calls = 0;
    setup({
      getUploadUrl: () => {
        calls++;
        return calls === 1
          ? throwError(() => ({ error: { error: 'Unsupported content type: image/jpeg' } }))
          : of({ receiptId: 'r2', uploadUrl: 'https://s3/x', expiresIn: 3600 });
      },
    });

    component['select'](fileList([file('a.jpg')]));
    component.startUpload();

    expect(component.selection()?.status).toBe('error');
    expect(component.selection()?.error).toBe('Unsupported content type: image/jpeg');
    expect(component.selection()?.upload).toBeUndefined();
    expect(snackSpy.open).toHaveBeenCalledWith('Upload failed.', 'Dismiss', expect.anything());

    component.startUpload();
    expect(apiSpy.getUploadUrl).toHaveBeenCalledTimes(2);
    expect(component.selection()).toBeNull();
  });

  it('reuses the cached upload on retry after a failed PUT, without calling getUploadUrl again', () => {
    let putAttempt = 0;
    setup({
      uploadToS3: () => (++putAttempt === 1 ? throwError(() => new Error('blip')) : of(void 0)),
    });
    let emitted: string | undefined;
    component.uploaded.subscribe(id => (emitted = id));

    component['select'](fileList([file('a.jpg')]));
    component.startUpload();

    expect(component.selection()?.status).toBe('error');
    expect(component.selection()?.upload?.receiptId).toBe('r1');
    expect(apiSpy.getUploadUrl).toHaveBeenCalledTimes(1);

    component.startUpload();

    expect(apiSpy.getUploadUrl).toHaveBeenCalledTimes(1); // still 1 — reused the cache
    expect(apiSpy.uploadToS3).toHaveBeenCalledTimes(2);
    expect(component.selection()).toBeNull();
    expect(emitted).toBe('r1');
  });

  it('requests a fresh upload URL when the cached one has expired', () => {
    vi.useFakeTimers();
    let urlCalls = 0;
    setup({
      getUploadUrl: () => {
        urlCalls++;
        return of({ receiptId: urlCalls === 1 ? 'r1' : 'r2', uploadUrl: 'https://s3/x', expiresIn: 3600 });
      },
      uploadToS3: () => (urlCalls === 1 ? throwError(() => new Error('blip')) : of(void 0)),
    });

    component['select'](fileList([file('a.jpg')]));
    component.startUpload();
    expect(urlCalls).toBe(1);

    vi.advanceTimersByTime(3600_000); // past expiresIn + the safety margin

    component.startUpload();
    expect(urlCalls).toBe(2);

    vi.useRealTimers();
  });

  it('does not clear the selection while an upload is in flight', () => {
    setup({ uploadToS3: () => new Observable() }); // never completes
    component['select'](fileList([file('a.jpg')]));
    component.startUpload();

    expect(component.busy()).toBe(true);
    component.clear();
    expect(component.selection()).not.toBeNull(); // unchanged — busy guard
  });

  describe('cleanup of abandoned uploads', () => {
    it('fires a best-effort delete when a replacement file is selected after a failed attempt', () => {
      setup({ uploadToS3: () => throwError(() => new Error('blip')) });
      component['select'](fileList([file('a.jpg')]));
      component.startUpload();
      const abandonedId = component.selection()!.upload!.receiptId;

      component['select'](fileList([file('b.png', 'image/png')]));

      expect(apiSpy.deleteReceipt).toHaveBeenCalledWith(abandonedId);
      expect(component.selection()?.file.name).toBe('b.png');
    });

    it('fires a best-effort delete when the user clears a failed selection', () => {
      setup({ uploadToS3: () => throwError(() => new Error('blip')) });
      component['select'](fileList([file('a.jpg')]));
      component.startUpload();
      const abandonedId = component.selection()!.upload!.receiptId;

      component.clear();

      expect(apiSpy.deleteReceipt).toHaveBeenCalledWith(abandonedId);
      expect(component.selection()).toBeNull();
    });

    it('fires a best-effort delete when destroyed while a failed upload is still selected', () => {
      setup({ uploadToS3: () => throwError(() => new Error('blip')) });
      component['select'](fileList([file('a.jpg')]));
      component.startUpload();
      const abandonedId = component.selection()!.upload!.receiptId;

      fixture.destroy();

      expect(apiSpy.deleteReceipt).toHaveBeenCalledWith(abandonedId);
    });

    it('does not call deleteReceipt when clearing a ready (never-attempted) selection', () => {
      setup();
      component['select'](fileList([file('a.jpg')]));
      component.clear();
      expect(apiSpy.deleteReceipt).not.toHaveBeenCalled();
    });

    it('does not call deleteReceipt when the failed attempt never got a cached upload', () => {
      setup({ getUploadUrl: () => throwError(() => ({ error: { error: 'boom' } })) });
      component['select'](fileList([file('a.jpg')]));
      component.startUpload();
      expect(component.selection()?.upload).toBeUndefined();

      component.clear();

      expect(apiSpy.deleteReceipt).not.toHaveBeenCalled();
    });
  });
});
