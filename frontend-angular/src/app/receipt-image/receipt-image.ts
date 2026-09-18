import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ReceiptsApi } from '../api/receipts-api';
import { Loadable } from '../receipts/receipt-view';
import { ReceiptImageDialog } from './receipt-image-dialog';

/**
 * The receipt's original photo, fetched via a presigned S3 GET URL
 * (`getDownloadUrl`). Renders a capped-height thumbnail with a fullscreen
 * toggle; requires no `canManage`-style gating since the backend's
 * download-url endpoint already restricts this to receipt members.
 *
 * The backend hands back a presigned URL even when nothing was ever
 * uploaded to that S3 key (no dedicated "no image" signal exists yet — see
 * docs/redesign-plan.md), so a broken `<img>` load is treated as "no image
 * available" rather than a hard error.
 */
@Component({
  selector: 'app-receipt-image',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './receipt-image.html',
  styleUrl: './receipt-image.scss',
})
export class ReceiptImage implements OnInit {
  private api = inject(ReceiptsApi);
  private dialog = inject(MatDialog);

  readonly receiptId = input.required<string>();

  state = signal<Loadable<string>>({ kind: 'loading' });
  /** The <img> itself failed to load the presigned URL. */
  loadFailed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadFailed.set(false);
    this.state.set({ kind: 'loading' });
    this.api.getDownloadUrl(this.receiptId()).subscribe({
      next: ({ downloadUrl }) => this.state.set({ kind: 'ok', data: downloadUrl }),
      error: err =>
        this.state.set({
          kind: 'error',
          message: this.errorText(err, 'Could not load the receipt image.'),
        }),
    });
  }

  onImageError(): void {
    this.loadFailed.set(true);
  }

  openFullscreen(imageUrl: string): void {
    this.dialog.open(ReceiptImageDialog, {
      data: { imageUrl },
      maxWidth: '95vw',
      maxHeight: '95vh',
    });
  }

  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
