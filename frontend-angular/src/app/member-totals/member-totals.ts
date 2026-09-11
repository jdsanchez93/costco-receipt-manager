import { CurrencyPipe } from '@angular/common';
import { Component, computed, input, isDevMode, signal } from '@angular/core';

import { ReceiptMemberDto } from '../api/types';
import { EnrichedItem, computeMemberTotals } from '../receipts/receipt-view';
import { StatusBadge } from '../status-badge/status-badge';

/** Sentinel id that can never match a real ReceiptMember (those are
 * positive DB auto-increment ids) — used only by the dev debug toggle. */
const DEBUG_UNKNOWN_MEMBER_ID = -1;

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

  /** Exposed for the template — `isDevMode()` can't be called directly there. */
  readonly isDevMode = isDevMode;

  /**
   * Dev-only QA aid: when on, splices a fake assignee (an id no member
   * ever has) onto the first item so the discrepancy path — otherwise
   * unreachable through the app, since removing a member cascades off
   * every item's assignments both client- and server-side — has
   * something to show. Local to this component; never touches the
   * parent's state or calls the API, so nothing can be sent upstream.
   */
  debugBadAssignment = signal(false);

  private effectiveItems = computed(() => {
    const items = this.items();
    if (!this.debugBadAssignment() || items.length === 0) return items;
    const [first, ...rest] = items;
    return [
      { ...first, assignedMemberIds: [...first.assignedMemberIds, DEBUG_UNKNOWN_MEMBER_ID] },
      ...rest,
    ];
  });

  readonly totals = computed(() => computeMemberTotals(this.effectiveItems(), this.members()));

  /** Receipt is fully accounted for once the drift is below a cent. */
  readonly reconciled = computed(() => this.totals().discrepancy < 0.01);
}
