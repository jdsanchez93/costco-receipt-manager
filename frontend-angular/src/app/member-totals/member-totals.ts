import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { ReceiptMemberDto } from '../api/types';
import { EnrichedItem, computeMemberTotals } from '../receipts/receipt-view';
import { StatusBadge } from '../status-badge/status-badge';

/**
 * "Who owes what" — each item's cost split equally across its assigned
 * members, with an unassigned bucket and a reconcile check. Pure display;
 * recomputes whenever `items` or `members` change.
 */
@Component({
  selector: 'app-member-totals',
  imports: [CurrencyPipe, StatusBadge],
  templateUrl: './member-totals.html',
  styleUrl: './member-totals.scss',
})
export class MemberTotals {
  readonly items = input.required<EnrichedItem[]>();
  readonly members = input.required<ReceiptMemberDto[]>();

  readonly totals = computed(() => computeMemberTotals(this.items(), this.members()));

  /** Receipt is fully accounted for once the drift is below a cent. */
  readonly reconciled = computed(() => this.totals().discrepancy < 0.01);
}
