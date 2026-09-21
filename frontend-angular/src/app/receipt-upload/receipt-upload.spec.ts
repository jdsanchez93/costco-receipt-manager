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
  };
  let snackSpy: { open: ReturnType<typeof vi.fn> };

  function setup(opts: {
    getUploadUrl?: (contentType?: string) => Observable<unknown>;
    uploadToS3?: () => Observable<unknown>;
  } = {}): void {
    apiSpy = {
      getUploadUrl: vi.fn().mockImplementation(
        (contentType?: string) =>
          (opts.getUploadUrl
            ?? (() => of({ receiptId: 'r1', uploadUrl: 'https://s3/x', expiresIn: 3600 })))(contentType),
      ),
      uploadToS3: vi.fn().mockImplementation(() => (opts.uploadToS3 ?? (() => of(void 0)))()),
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

  it('keeps a failed upload selected with its error message, and lets it be retried', () => {
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
    expect(snackSpy.open).toHaveBeenCalledWith('Upload failed.', 'Dismiss', expect.anything());

    component.startUpload();
    expect(component.selection()).toBeNull();
  });

  it('does not clear the selection while an upload is in flight', () => {
    setup({ uploadToS3: () => new Observable() }); // never completes
    component['select'](fileList([file('a.jpg')]));
    component.startUpload();

    expect(component.busy()).toBe(true);
    component.clear();
    expect(component.selection()).not.toBeNull(); // unchanged — busy guard
  });
});
