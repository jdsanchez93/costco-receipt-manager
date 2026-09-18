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

  it('rejects an unsupported file type without queueing it', () => {
    setup();
    component['enqueue']([file('doc.pdf', 'application/pdf')] as unknown as FileList);

    expect(component.queue()).toEqual([]);
    expect(snackSpy.open).toHaveBeenCalledWith(
      'doc.pdf: unsupported file type.',
      'Dismiss',
      expect.anything(),
    );
  });

  it('rejects a file over the 10MB limit', () => {
    setup();
    const big = file('huge.jpg', 'image/jpeg', 11 * 1024 * 1024);
    component['enqueue']([big] as unknown as FileList);

    expect(component.queue()).toEqual([]);
    expect(snackSpy.open).toHaveBeenCalledWith(
      'huge.jpg: file is larger than 10MB.',
      'Dismiss',
      expect.anything(),
    );
  });

  it('queues valid files and uploads them sequentially, emitting the resulting receiptIds', () => {
    setup({
      getUploadUrl: () => of({ receiptId: 'r1', uploadUrl: 'https://s3/x', expiresIn: 3600 }),
    });
    let emitted: string[] | undefined;
    component.uploaded.subscribe(ids => (emitted = ids));

    component['enqueue']([file('a.jpg'), file('b.png', 'image/png')] as unknown as FileList);
    expect(component.queue().length).toBe(2);

    component.startUpload();

    expect(apiSpy.getUploadUrl).toHaveBeenCalledTimes(2);
    expect(apiSpy.uploadToS3).toHaveBeenCalledTimes(2);
    expect(component.busy()).toBe(false);
    expect(component.queue()).toEqual([]); // both done items are dropped after the batch
    expect(emitted).toEqual(['r1', 'r1']);
    expect(snackSpy.open).toHaveBeenCalledWith('Uploaded 2 receipts.', 'Dismiss', expect.anything());
  });

  it('keeps a failed item in the queue with its error message, and lets it be retried', () => {
    let calls = 0;
    setup({
      getUploadUrl: () => {
        calls++;
        return calls === 1
          ? throwError(() => ({ error: { error: 'Unsupported content type: image/jpeg' } }))
          : of({ receiptId: 'r2', uploadUrl: 'https://s3/x', expiresIn: 3600 });
      },
    });

    component['enqueue']([file('a.jpg')] as unknown as FileList);
    component.startUpload();

    expect(component.queue().length).toBe(1);
    expect(component.queue()[0].status).toBe('error');
    expect(component.queue()[0].error).toBe('Unsupported content type: image/jpeg');
    expect(snackSpy.open).toHaveBeenCalledWith('1 upload failed.', 'Dismiss', expect.anything());

    component.retry(component.queue()[0].id);
    expect(component.queue()[0].status).toBe('queued');

    component.startUpload();
    expect(component.queue()).toEqual([]);
  });

  it('does not remove or retry items while a batch is in flight', () => {
    setup({ uploadToS3: () => new Observable() }); // never completes
    component['enqueue']([file('a.jpg')] as unknown as FileList);
    const id = component.queue()[0].id;
    component.startUpload();

    expect(component.busy()).toBe(true);
    component.removeFromQueue(id);
    expect(component.queue().length).toBe(1); // unchanged — busy guard
  });
});
