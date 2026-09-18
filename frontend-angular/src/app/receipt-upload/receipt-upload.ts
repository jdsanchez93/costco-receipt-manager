import { Component, computed, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ReceiptsApi } from '../api/receipts-api';

type UploadItemStatus = 'queued' | 'uploading' | 'done' | 'error';

interface UploadItem {
  id: number;
  file: File;
  status: UploadItemStatus;
  receiptId?: string;
  error?: string;
}

const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Drag-and-drop (or click-to-browse) receipt upload. Queues one or more
 * image files, then uploads them **sequentially** — mirrors the old React
 * `ReceiptUpload.tsx`, and keeps per-file progress unambiguous rather than
 * juggling N concurrent progress states.
 *
 * Each file goes through `getUploadUrl()` (which creates the Receipt row
 * server-side) then a raw PUT to the returned presigned S3 URL — the S3
 * origin never matches the Auth0 interceptor's `allowedList`, so no bearer
 * token leaks into that request. Emits `uploaded` with the receiptIds of
 * every file that made it to S3 so the parent can refresh its list; OCR
 * results land later and aren't waited on here.
 */
@Component({
  selector: 'app-receipt-upload',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './receipt-upload.html',
  styleUrl: './receipt-upload.scss',
})
export class ReceiptUpload {
  private api = inject(ReceiptsApi);
  private snackBar = inject(MatSnackBar);

  readonly uploaded = output<string[]>();

  private nextId = 0;
  queue = signal<UploadItem[]>([]);
  dragging = signal(false);
  busy = signal(false);

  hasQueued = computed(() => this.queue().some(i => i.status === 'queued'));

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.busy()) this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.busy() || !event.dataTransfer?.files) return;
    this.enqueue(event.dataTransfer.files);
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.enqueue(input.files);
    input.value = '';
  }

  private enqueue(files: FileList): void {
    const items: UploadItem[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        this.snackBar.open(`${file.name}: unsupported file type.`, 'Dismiss', { duration: 4000 });
        continue;
      }
      if (file.size > MAX_SIZE_BYTES) {
        this.snackBar.open(`${file.name}: file is larger than 10MB.`, 'Dismiss', { duration: 4000 });
        continue;
      }
      items.push({ id: this.nextId++, file, status: 'queued' });
    }
    if (items.length > 0) this.queue.update(q => [...q, ...items]);
  }

  removeFromQueue(id: number): void {
    if (this.busy()) return;
    this.queue.update(q => q.filter(i => i.id !== id));
  }

  retry(id: number): void {
    if (this.busy()) return;
    this.setStatus(id, 'queued', { error: undefined });
  }

  startUpload(): void {
    if (this.busy() || !this.hasQueued()) return;
    this.busy.set(true);
    this.uploadNext();
  }

  private uploadNext(): void {
    const next = this.queue().find(i => i.status === 'queued');
    if (!next) {
      this.finishBatch();
      return;
    }

    this.setStatus(next.id, 'uploading');
    const contentType = next.file.type || 'image/jpeg';

    this.api.getUploadUrl(contentType).subscribe({
      next: ({ receiptId, uploadUrl }) => {
        this.api.uploadToS3(uploadUrl, next.file, contentType).subscribe({
          next: () => {
            this.setStatus(next.id, 'done', { receiptId });
            this.uploadNext();
          },
          error: () => {
            this.setStatus(next.id, 'error', { error: 'Upload to storage failed.' });
            this.uploadNext();
          },
        });
      },
      error: err => {
        this.setStatus(next.id, 'error', {
          error: this.errorText(err, 'Could not start upload.'),
        });
        this.uploadNext();
      },
    });
  }

  private setStatus(id: number, status: UploadItemStatus, extra: Partial<UploadItem> = {}): void {
    this.queue.update(q => q.map(i => (i.id === id ? { ...i, status, ...extra } : i)));
  }

  private finishBatch(): void {
    this.busy.set(false);
    const finished = this.queue();
    const done = finished.filter(i => i.status === 'done');
    const failed = finished.filter(i => i.status === 'error');

    if (done.length > 0) {
      this.snackBar.open(
        `Uploaded ${done.length} receipt${done.length === 1 ? '' : 's'}.`,
        'Dismiss',
        { duration: 3000 },
      );
      this.uploaded.emit(done.map(i => i.receiptId!));
    }
    if (failed.length > 0) {
      this.snackBar.open(
        `${failed.length} upload${failed.length === 1 ? '' : 's'} failed.`,
        'Dismiss',
        { duration: 4000 },
      );
    }

    // Drop completed items; keep failed ones queued for retry/removal.
    this.queue.update(q => q.filter(i => i.status !== 'done'));
  }

  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
