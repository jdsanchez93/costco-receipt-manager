import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto } from '../api/types';
import { ReceiptUpload } from '../receipt-upload/receipt-upload';
import { Loadable } from './receipt-view';

@Component({
  selector: 'app-receipts',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    ReceiptUpload,
  ],
  templateUrl: './receipts.html',
  styleUrl: './receipts.scss',
})
export class Receipts {
  private api = inject(ReceiptsApi);
  private router = inject(Router);

  state = signal<Loadable<ReceiptMemberDto[]>>({ kind: 'loading' });
  uploadOpen = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.getUserReceipts().subscribe({
      next: data => this.state.set({ kind: 'ok', data }),
      error: err => this.state.set({
        kind: 'error',
        message: err?.message ?? 'Failed to load receipts.',
      }),
    });
  }

  toggleUpload(): void {
    this.uploadOpen.update(v => !v);
  }

  /** The upload finished — close the panel and jump straight to the new receipt. */
  onUploaded(receiptId: string): void {
    this.uploadOpen.set(false);
    this.router.navigate(['/app/receipts', receiptId]);
  }
}
