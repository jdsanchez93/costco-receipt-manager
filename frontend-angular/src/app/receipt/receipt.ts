import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptItemDto, ReceiptMemberDto } from '../api/types';

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
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './receipt.html',
  styleUrl: './receipt.scss',
})
export class Receipt {
  private api = inject(ReceiptsApi);
  private route = inject(ActivatedRoute);

  readonly receiptId = this.route.snapshot.paramMap.get('receiptId') ?? '';
  state = signal<Loadable<ReceiptDetailData>>({ kind: 'loading' });

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
        const memberById = new Map(members.map(m => [m.id, m.displayName]));
        const enriched: EnrichedItem[] = items.map(item => ({
          ...item,
          assigneeNames: item.assignedMemberIds.map(
            id => memberById.get(id) ?? `#${id}`,
          ),
        }));
        this.state.set({
          kind: 'ok',
          data: { receiptId: this.receiptId, members, items: enriched },
        });
      },
      error: err => this.state.set({
        kind: 'error',
        message: err?.message ?? 'Failed to load receipt.',
      }),
    });
  }
}
