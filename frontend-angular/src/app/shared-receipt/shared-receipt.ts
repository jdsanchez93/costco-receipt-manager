import { CurrencyPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ReceiptsApi } from '../api/receipts-api';
import { SharedMemberDto, SubtotalMatchDto } from '../api/types';
import { MemberTotals } from '../member-totals/member-totals';
import { ReceiptItems } from '../receipt-items/receipt-items';
import { ReceiptStats } from '../receipt-stats/receipt-stats';
import { EnrichedItem, Loadable, enrichItems, receiptTotal } from '../receipts/receipt-view';

interface SharedReceiptData {
  receiptId: string;
  items: EnrichedItem[];
  members: SharedMemberDto[];
  expiresAt: string;
  subtotalMatch: SubtotalMatchDto;
}

/**
 * Public, read-only receipt view reached via a share link
 * (`/shared-receipt/:shareToken`). No auth guard, no app shell. Reuses the
 * presentational `<app-receipt-items>` and `<app-member-totals>` from the
 * authenticated detail page.
 *
 * A signed-in visitor who is already a member is sent on to the receipt
 * itself — the backend recognizes them from the token the interceptor
 * attaches. `?preview` (the share-links panel's Preview action) opts out,
 * so a member can see what everyone else with the link sees.
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
  private router = inject(Router);

  private readonly shareToken = this.route.snapshot.paramMap.get('shareToken') ?? '';
  readonly preview = this.route.snapshot.queryParamMap.has('preview');

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
    this.api.getSharedReceipt(this.shareToken, this.preview).subscribe({
      next: res => {
        if (res.kind === 'member') {
          // Stays 'loading' through the navigation. Replacing the history
          // entry keeps Back from landing here only to be sent on again.
          this.router.navigate(['/app/receipts', res.receiptId], { replaceUrl: true });
          return;
        }
        this.state.set({
          kind: 'ok',
          data: {
            receiptId: res.receiptId,
            items: enrichItems(res.items, res.members),
            members: res.members,
            expiresAt: res.shareInfo.expiresAt,
            subtotalMatch: res.geometry.subtotalMatch,
          },
        });
      },
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
