import { CurrencyPipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { ReceiptMemberDto } from '../api/types';
import { EnrichedItem } from '../receipts/receipt-view';
import { StatusBadge } from '../status-badge/status-badge';

/**
 * Presentational list of receipt line items. Read-only by default; the
 * authenticated detail page opts into editing (`editable`) and bulk
 * selection (`selectable`) and handles the emitted intents itself — this
 * component owns no state.
 */
@Component({
  selector: 'app-receipt-items',
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    StatusBadge,
  ],
  templateUrl: './receipt-items.html',
  styleUrl: './receipt-items.scss',
})
export class ReceiptItems {
  readonly items = input.required<EnrichedItem[]>();
  /** Needed for the "add member" menu; also gates the assignee chip row. */
  readonly members = input<ReceiptMemberDto[]>([]);
  readonly editable = input<boolean>(false);
  readonly selectable = input<boolean>(false);
  readonly selectedIds = input<ReadonlySet<number>>(new Set<number>());

  readonly assignmentAdd = output<{ item: EnrichedItem; memberId: number }>();
  readonly assignmentRemove = output<{ item: EnrichedItem; memberId: number }>();
  readonly selectionToggle = output<number>();

  /** Members not yet assigned to this item — populates the add menu. */
  availableMembers(item: EnrichedItem): ReceiptMemberDto[] {
    return this.members().filter(m => !item.assignedMemberIds.includes(m.id));
  }
}
