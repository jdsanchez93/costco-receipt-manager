import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { SubtotalMatchDto } from '../api/types';
import { subtotalMatchTone } from '../receipts/receipt-view';
import { StatusBadge } from '../status-badge/status-badge';

/**
 * The at-a-glance stats strip for a receipt — item/people counts, the
 * total, and the server-computed subtotal-match badge. Shared between the
 * authenticated detail page and the public shared-receipt view so both
 * present the same summary the same way. `expiresAt` is only shown when
 * set — that cell is specific to the public shared view's share link.
 */
@Component({
  selector: 'app-receipt-stats',
  imports: [CurrencyPipe, DatePipe, StatusBadge],
  templateUrl: './receipt-stats.html',
  styleUrl: './receipt-stats.scss',
})
export class ReceiptStats {
  readonly itemCount = input.required<number>();
  readonly memberCount = input.required<number>();
  readonly total = input.required<number>();
  readonly subtotalMatch = input.required<SubtotalMatchDto>();
  readonly expiresAt = input<string | null>(null);

  protected readonly tone = computed(() => subtotalMatchTone(this.subtotalMatch()));
}
