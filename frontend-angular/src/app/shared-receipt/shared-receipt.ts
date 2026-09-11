import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto, SubtotalMatchDto } from '../api/types';
import { MemberTotals } from '../member-totals/member-totals';
import { ReceiptItems } from '../receipt-items/receipt-items';
import { ReceiptStats } from '../receipt-stats/receipt-stats';
import { EnrichedItem, Loadable, enrichItems, receiptTotal } from '../receipts/receipt-view';

interface SharedReceiptData {
  items: EnrichedItem[];
  members: ReceiptMemberDto[];
  expiresAt: string;
  subtotalMatch: SubtotalMatchDto;
}

/**
 * Public, read-only receipt view reached via a share link
 * (`/shared-receipt/:shareToken`). No auth, no app shell. Reuses the
 * presentational `<app-receipt-items>` and `<app-member-totals>` from the
 * authenticated detail page.
 */
@Component({
  selector: 'app-shared-receipt',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MemberTotals,
    ReceiptItems,
    ReceiptStats,
  ],
  templateUrl: './shared-receipt.html',
  styleUrl: './shared-receipt.scss',
})
export class SharedReceipt {
  private api = inject(ReceiptsApi);
  private route = inject(ActivatedRoute);

  private readonly shareToken = this.route.snapshot.paramMap.get('shareToken') ?? '';

  state = signal<Loadable<SharedReceiptData>>({ kind: 'loading' });

  total = computed(() => {
    const s = this.state();
    return s.kind === 'ok' ? receiptTotal(s.data.items) : 0;
  });

  constructor() {
    if (this.shareToken) this.load();
    else this.state.set({ kind: 'error', message: 'This share link is invalid or has expired.' });
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.getSharedReceipt(this.shareToken).subscribe({
      next: res =>
        this.state.set({
          kind: 'ok',
          data: {
            items: enrichItems(res.items, res.members),
            members: res.members,
            expiresAt: res.shareInfo.expiresAt,
            subtotalMatch: res.geometry.subtotalMatch,
          },
        }),
      error: (err: unknown) =>
        this.state.set({
          kind: 'error',
          message:
            err instanceof HttpErrorResponse && err.status === 404
              ? 'This share link is invalid or has expired.'
              : "Couldn't load this shared receipt.",
        }),
    });
  }
}
