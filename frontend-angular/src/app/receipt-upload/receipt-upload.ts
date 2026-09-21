import { Component, computed, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ReceiptsApi } from '../api/receipts-api';

type SelectionStatus = 'ready' | 'uploading' | 'error';

interface Selection {
  file: File;
  status: SelectionStatus;
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
 * Drag-and-drop (or click-to-browse) receipt upload for a single image at a
 * time — real usage was always one receipt per upload, so this skips the
 * multi-file queue the old React `ReceiptUpload.tsx` had.
 *
 * The file goes through `getUploadUrl()` (which creates the Receipt row
 * server-side) then a raw PUT to the returned presigned S3 URL — the S3
 * origin never matches the Auth0 interceptor's `allowedList`, so no bearer
 * token leaks into that request. Emits `uploaded` with the receiptId once it
 * lands in S3 so the parent can refresh its list and navigate to it; OCR
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

  readonly uploaded = output<string>();

  selection = signal<Selection | null>(null);
  dragging = signal(false);

  busy = computed(() => this.selection()?.status === 'uploading');

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
    this.select(event.dataTransfer.files);
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) this.select(input.files);
    input.value = '';
  }

  private select(files: FileList): void {
    if (files.length === 0) return;
    if (files.length > 1) {
      this.snackBar.open(
        'Only one receipt can be uploaded at a time — using the first file.',
        'Dismiss',
        { duration: 4000 },
      );
    }

    const file = files[0];
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.snackBar.open(`${file.name}: unsupported file type.`, 'Dismiss', { duration: 4000 });
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      this.snackBar.open(`${file.name}: file is larger than 10MB.`, 'Dismiss', { duration: 4000 });
      return;
    }
    this.selection.set({ file, status: 'ready' });
  }

  clear(): void {
    if (this.busy()) return;
    this.selection.set(null);
  }

  startUpload(): void {
    const current = this.selection();
    if (!current || this.busy()) return;
    this.selection.set({ ...current, status: 'uploading', error: undefined });

    const contentType = current.file.type || 'image/jpeg';
    this.api.getUploadUrl(contentType).subscribe({
      next: ({ receiptId, uploadUrl }) => {
        this.api.uploadToS3(uploadUrl, current.file, contentType).subscribe({
          next: () => {
            this.selection.set(null);
            this.uploaded.emit(receiptId);
          },
          error: () => this.fail(current.file, 'Upload to storage failed.'),
        });
      },
      error: err => this.fail(current.file, this.errorText(err, 'Could not start upload.')),
    });
  }

  private fail(file: File, error: string): void {
    this.selection.set({ file, status: 'error', error });
    this.snackBar.open('Upload failed.', 'Dismiss', { duration: 4000 });
  }

  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
