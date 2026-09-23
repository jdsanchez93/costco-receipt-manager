import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ReceiptsApi } from '../api/receipts-api';

type SelectionStatus = 'ready' | 'uploading' | 'error';

/** A presigned upload URL cached from a successful getUploadUrl() call. */
interface CachedUpload {
  receiptId: string;
  uploadUrl: string;
  /** Epoch ms — Date.now() + expiresIn*1000 from the backend response. */
  expiresAt: number;
}

interface Selection {
  file: File;
  status: SelectionStatus;
  error?: string;
  upload?: CachedUpload;
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

// Treat a cached presigned URL as expired this far before its real expiry,
// so a retry never starts a PUT that might not finish in time.
const EXPIRY_SAFETY_MARGIN_MS = 45_000;

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
 *
 * A presigned URL stays valid for a full hour and isn't single-use, so a
 * retry after a failed PUT reuses the same {receiptId, uploadUrl} instead of
 * calling getUploadUrl() again — that call creates a new Receipt row every
 * time, and retrying blindly would otherwise leave several orphaned rows for
 * one flaky upload. When a failed, already-attempted selection is abandoned
 * (replaced, cleared, or this component destroyed) its Receipt row is best-
 * effort deleted instead of left behind.
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
  private destroyRef = inject(DestroyRef);

  readonly uploaded = output<string>();

  selection = signal<Selection | null>(null);
  dragging = signal(false);

  busy = computed(() => this.selection()?.status === 'uploading');

  constructor() {
    this.destroyRef.onDestroy(() => this.cleanupAbandoned(this.selection()));
  }

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
    this.cleanupAbandoned(this.selection());
    this.selection.set({ file, status: 'ready' });
  }

  clear(): void {
    if (this.busy()) return;
    this.cleanupAbandoned(this.selection());
    this.selection.set(null);
  }

  /**
   * Best-effort delete of a Receipt row left behind by a failed, attempted
   * upload that's now being replaced, cleared, or dropped (component
   * destroyed). A no-op for a 'ready' selection (nothing was ever created)
   * or an 'error' selection with no cached upload (the getUploadUrl() call
   * itself failed, so no row exists). Errors are swallowed — this is
   * opportunistic cleanup, not something the user needs to see or wait on.
   */
  private cleanupAbandoned(selection: Selection | null): void {
    const receiptId = selection?.status === 'error' ? selection.upload?.receiptId : undefined;
    if (!receiptId) return;
    this.api.deleteReceipt(receiptId).subscribe({ error: () => {} });
  }

  startUpload(): void {
    const current = this.selection();
    if (!current || this.busy()) return;

    const contentType = current.file.type || 'image/jpeg';
    const cached = current.upload;
    const isFresh = !!cached && Date.now() < cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS;

    this.selection.set({
      ...current,
      status: 'uploading',
      error: undefined,
      upload: isFresh ? cached : undefined,
    });

    if (isFresh) {
      this.putToS3(current.file, contentType, cached);
      return;
    }

    this.api.getUploadUrl(contentType).subscribe({
      next: ({ receiptId, uploadUrl, expiresIn }) => {
        const upload: CachedUpload = { receiptId, uploadUrl, expiresAt: Date.now() + expiresIn * 1000 };
        this.selection.update(sel => (sel ? { ...sel, upload } : sel));
        this.putToS3(current.file, contentType, upload);
      },
      error: err => this.fail(current.file, this.errorText(err, 'Could not start upload.'), undefined),
    });
  }

  private putToS3(file: File, contentType: string, upload: CachedUpload): void {
    this.api.uploadToS3(upload.uploadUrl, file, contentType).subscribe({
      next: () => {
        this.selection.set(null);
        this.uploaded.emit(upload.receiptId);
      },
      error: () => this.fail(file, 'Upload to storage failed.', upload),
    });
  }

  private fail(file: File, error: string, upload: CachedUpload | undefined): void {
    this.selection.set({ file, status: 'error', error, upload });
    this.snackBar.open('Upload failed.', 'Dismiss', { duration: 4000 });
  }

  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
