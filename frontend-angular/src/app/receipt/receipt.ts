import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ReceiptsApi } from '../api/receipts-api';
import { ItemAssignmentUpdate, ReceiptItemDto, ReceiptMemberDto } from '../api/types';

/**
 * Items already resolved against the members list so the template doesn't
 * have to re-join per render. Names are looked up once when the data lands.
 */
export interface EnrichedItem extends ReceiptItemDto {
  assigneeNames: string[];
}

export interface ReceiptDetailData {
  receiptId: string;
  members: ReceiptMemberDto[];
  items: EnrichedItem[];
}

type Loadable<T> =
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-receipt',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './receipt.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './receipt.scss',
})
export class Receipt {
  private api = inject(ReceiptsApi);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);

  readonly receiptId = this.route.snapshot.paramMap.get('receiptId') ?? '';
  state = signal<Loadable<ReceiptDetailData>>({ kind: 'loading' });

  /** Set of item ids currently ticked for bulk actions. */
  selectedItemIds = signal<ReadonlySet<number>>(new Set());

  allSelected = computed(() => {
    const s = this.state();
    if (s.kind !== 'ok' || s.data.items.length === 0) return false;
    return this.selectedItemIds().size === s.data.items.length;
  });

  someSelected = computed(() => this.selectedItemIds().size > 0);

  /** For the header checkbox's indeterminate state. */
  partialSelection = computed(() => this.someSelected() && !this.allSelected());

  /** Sum of (price - discount) across all items — client-side subtotal. */
  total = computed(() => {
    const s = this.state();
    if (s.kind !== 'ok') return 0;
    return s.data.items.reduce(
      (sum, item) => sum + item.price - (item.discount ?? 0),
      0,
    );
  });

  constructor() {
    if (this.receiptId) this.load();
    else this.state.set({ kind: 'error', message: 'Missing receipt id.' });
  }

  load(): void {
    this.state.set({ kind: 'loading' });

    forkJoin({
      items: this.api.getReceiptItems(this.receiptId),
      members: this.api.getReceiptMembers(this.receiptId),
    }).subscribe({
      next: ({ items, members }) => {
        this.state.set({
          kind: 'ok',
          data: {
            receiptId: this.receiptId,
            members,
            items: items.map(i => this.enrichItem(i, members)),
          },
        });
      },
      error: err => this.state.set({
        kind: 'error',
        message: err?.message ?? 'Failed to load receipt.',
      }),
    });
  }

  /** Add one member to an item's assignments (idempotent). */
  addAssignment(item: EnrichedItem, memberId: number): void {
    if (item.assignedMemberIds.includes(memberId)) return;
    this.onAssignmentChange(item, [...item.assignedMemberIds, memberId]);
  }

  /** Remove one member from an item's assignments. */
  removeAssignment(item: EnrichedItem, memberId: number): void {
    this.onAssignmentChange(
      item,
      item.assignedMemberIds.filter(id => id !== memberId),
    );
  }

  /** Members not yet assigned to this item — populates the "add" menu. */
  availableMembers(item: EnrichedItem, members: ReceiptMemberDto[]): ReceiptMemberDto[] {
    return members.filter(m => !item.assignedMemberIds.includes(m.id));
  }

  // ---- Bulk selection ----

  toggleItemSelection(itemId: number): void {
    const next = new Set(this.selectedItemIds());
    next.has(itemId) ? next.delete(itemId) : next.add(itemId);
    this.selectedItemIds.set(next);
  }

  toggleSelectAll(): void {
    const s = this.state();
    if (s.kind !== 'ok') return;
    if (this.allSelected()) {
      this.selectedItemIds.set(new Set());
    } else {
      this.selectedItemIds.set(new Set(s.data.items.map(i => i.id)));
    }
  }

  /** Add one member to every currently-selected item that doesn't have them yet. */
  bulkAssignTo(memberId: number): void {
    const s = this.state();
    if (s.kind !== 'ok') return;
    const selected = this.selectedItemIds();
    const affected = s.data.items.filter(i => selected.has(i.id));
    if (affected.length === 0) return;

    const updates: ItemAssignmentUpdate[] = affected
      .filter(i => !i.assignedMemberIds.includes(memberId))
      .map(i => ({
        itemId: i.id,
        assignedMemberIds: [...i.assignedMemberIds, memberId],
      }));

    if (updates.length === 0) {
      // Already assigned everywhere — nothing to send, just clear selection.
      this.selectedItemIds.set(new Set());
      return;
    }

    this.applyBulkUpdate(updates, 'Could not assign selected items.');
  }

  /** Replace assignments on every selected item with the full member roster. */
  splitEvenlySelected(): void {
    const s = this.state();
    if (s.kind !== 'ok') return;
    const selected = this.selectedItemIds();
    const affected = s.data.items.filter(i => selected.has(i.id));
    if (affected.length === 0) return;

    const allMemberIds = s.data.members.map(m => m.id);
    const allSet = new Set(allMemberIds);

    // Skip items already assigned to everyone — no need to re-PUT.
    const updates: ItemAssignmentUpdate[] = affected
      .filter(i =>
        i.assignedMemberIds.length !== allMemberIds.length
          || !i.assignedMemberIds.every(id => allSet.has(id)),
      )
      .map(i => ({
        itemId: i.id,
        assignedMemberIds: [...allMemberIds],
      }));

    if (updates.length === 0) {
      this.selectedItemIds.set(new Set());
      return;
    }

    this.applyBulkUpdate(updates, 'Could not split selected items.');
  }

  private applyBulkUpdate(
    updates: ItemAssignmentUpdate[],
    errorMessage: string,
  ): void {
    const s = this.state();
    if (s.kind !== 'ok') return;

    // Snapshot each affected item's original assignments so we can revert
    // atomically on failure. The backend applies the bulk update in one
    // transaction, so partial-revert is not a case we need to handle.
    const original = new Map<number, number[]>();
    for (const u of updates) {
      const item = s.data.items.find(i => i.id === u.itemId);
      if (item) original.set(u.itemId, item.assignedMemberIds);
    }

    this.replaceMultipleItemAssignments(updates, s.data.members);

    this.api.bulkUpdateAssignments(this.receiptId, updates).subscribe({
      next: () => this.selectedItemIds.set(new Set()),
      error: () => {
        const revert: ItemAssignmentUpdate[] = Array
          .from(original.entries())
          .map(([itemId, assignedMemberIds]) => ({ itemId, assignedMemberIds }));
        this.replaceMultipleItemAssignments(revert, s.data.members);
        this.snackBar.open(`${errorMessage} Reverted.`, 'Dismiss', { duration: 4000 });
      },
    });
  }

  private replaceMultipleItemAssignments(
    updates: ItemAssignmentUpdate[],
    members: ReceiptMemberDto[],
  ): void {
    const s = this.state();
    if (s.kind !== 'ok') return;

    const memberById = new Map(members.map(m => [m.id, m.displayName]));
    const updateMap = new Map(updates.map(u => [u.itemId, u.assignedMemberIds]));

    const items = s.data.items.map(i => {
      const newIds = updateMap.get(i.id);
      if (!newIds) return i;
      return {
        ...i,
        assignedMemberIds: newIds,
        assigneeNames: newIds.map(id => memberById.get(id) ?? `#${id}`),
      };
    });

    this.state.set({ kind: 'ok', data: { ...s.data, items } });
  }

  /**
   * Optimistically apply an assignment change, then fire the PUT.
   * On failure, revert to the previous ids and toast the user — no
   * partial-write ambiguity, no spinner during the round-trip.
   */
  onAssignmentChange(item: EnrichedItem, newMemberIds: number[]): void {
    const s = this.state();
    if (s.kind !== 'ok') return;

    const previousIds = item.assignedMemberIds;
    // Sort so ordering-only differences don't trigger a PUT.
    const sortedNew = [...newMemberIds].sort((a, b) => a - b);
    const sortedOld = [...previousIds].sort((a, b) => a - b);
    if (sortedNew.length === sortedOld.length
        && sortedNew.every((v, i) => v === sortedOld[i])) {
      return;
    }

    this.replaceItemAssignments(item.id, newMemberIds, s.data.members);

    this.api.updateItemAssignment(this.receiptId, item.id, newMemberIds).subscribe({
      error: () => {
        this.replaceItemAssignments(item.id, previousIds, s.data.members);
        this.snackBar.open('Could not update assignment. Reverted.', 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  /** Immutably rebuild the state signal with one item's assignments swapped. */
  private replaceItemAssignments(
    itemId: number,
    memberIds: number[],
    members: ReceiptMemberDto[],
  ): void {
    const s = this.state();
    if (s.kind !== 'ok') return;

    const memberById = new Map(members.map(m => [m.id, m.displayName]));
    const items = s.data.items.map(i =>
      i.id === itemId
        ? {
            ...i,
            assignedMemberIds: memberIds,
            assigneeNames: memberIds.map(id => memberById.get(id) ?? `#${id}`),
          }
        : i,
    );
    this.state.set({ kind: 'ok', data: { ...s.data, items } });
  }

  private enrichItem(item: ReceiptItemDto, members: ReceiptMemberDto[]): EnrichedItem {
    const memberById = new Map(members.map(m => [m.id, m.displayName]));
    return {
      ...item,
      assigneeNames: item.assignedMemberIds.map(id => memberById.get(id) ?? `#${id}`),
    };
  }
}
