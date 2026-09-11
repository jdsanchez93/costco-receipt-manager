// Shared, framework-free helpers for rendering a receipt — used by the
// authenticated detail page (`receipt/`), the public shared view
// (`shared-receipt/`), and the share-links panel (`receipt-shares/`).

import { ReceiptItemDto, ReceiptMemberDto } from '../api/types';

/**
 * Discriminated union for a fetched resource. Beats separate `loading` /
 * `error` / `data` fields because a template can `@switch` on `kind` and
 * TypeScript narrows the shape at each branch.
 */
export type Loadable<T> =
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

/**
 * A receipt item with its assignee display names pre-resolved, so the
 * template doesn't re-join against the members list on every render.
 */
export interface EnrichedItem extends ReceiptItemDto {
  assigneeNames: string[];
}

/** Resolve each item's `assignedMemberIds` to display names once. */
export function enrichItems(
  items: ReceiptItemDto[],
  members: ReceiptMemberDto[],
): EnrichedItem[] {
  const nameById = new Map(members.map(m => [m.id, m.displayName]));
  return items.map(item => ({
    ...item,
    assigneeNames: item.assignedMemberIds.map(id => nameById.get(id) ?? `#${id}`),
  }));
}

/** Client-side subtotal: sum of (price − discount) across every item. */
export function receiptTotal(items: ReceiptItemDto[]): number {
  return items.reduce((sum, i) => sum + i.price - (i.discount ?? 0), 0);
}

export interface MemberTotal {
  memberId: number;
  displayName: string;
  /** How many items this member is assigned to (shared or sole). */
  itemCount: number;
  /** Sum of this member's price shares, before discount. */
  subtotal: number;
  /** Sum of this member's discount shares. */
  discount: number;
  /** `subtotal − discount`. */
  total: number;
}

export interface UnassignedTotal {
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface MemberTotalsResult {
  perMember: MemberTotal[];
  unassigned: UnassignedTotal;
  /** `receiptTotal(items)` — the whole receipt. */
  grandTotal: number;
  /** Sum of every member's `total`. */
  assignedTotal: number;
  /**
   * `|grandTotal − (assignedTotal + unassigned.total)|`. Non-zero when an
   * item is assigned to an id that matches no current member — that
   * share is dropped rather than redistributed.
   */
  discrepancy: number;
}

/**
 * "Who owes what": split each item's price and discount **equally** across
 * the members assigned to it. Items with no assignees land in the
 * `unassigned` bucket at full value. Mirrors the old React `MemberTotals`.
 */
export function computeMemberTotals(
  items: ReceiptItemDto[],
  members: ReceiptMemberDto[],
): MemberTotalsResult {
  const byId = new Map<number, MemberTotal>(
    members.map(m => [
      m.id,
      {
        memberId: m.id,
        displayName: m.displayName,
        itemCount: 0,
        subtotal: 0,
        discount: 0,
        total: 0,
      },
    ]),
  );

  const unassigned: UnassignedTotal = {
    itemCount: 0,
    subtotal: 0,
    discount: 0,
    total: 0,
  };

  for (const item of items) {
    const price = item.price;
    const discount = item.discount ?? 0;
    const n = item.assignedMemberIds.length;

    if (n === 0) {
      unassigned.itemCount += 1;
      unassigned.subtotal += price;
      unassigned.discount += discount;
      unassigned.total += price - discount;
      continue;
    }

    const priceShare = price / n;
    const discountShare = discount / n;

    for (const memberId of item.assignedMemberIds) {
      const bucket = byId.get(memberId);
      if (!bucket) continue; // assignee no longer a member — share is dropped
      bucket.itemCount += 1;
      bucket.subtotal += priceShare;
      bucket.discount += discountShare;
      bucket.total += priceShare - discountShare;
    }
  }

  const perMember = [...byId.values()];
  const assignedTotal = perMember.reduce((sum, m) => sum + m.total, 0);
  const grandTotal = receiptTotal(items);
  const discrepancy = Math.abs(grandTotal - (assignedTotal + unassigned.total));

  return { perMember, unassigned, grandTotal, assignedTotal, discrepancy };
}
