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
