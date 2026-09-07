import { DatePipe } from '@angular/common';
import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterLink } from '@angular/router';

import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto } from '../api/types';

/**
 * Discriminated union for a fetched resource. Beats booleans (`loading`,
 * `error`, `data`) because the template can `@switch` on `kind` and TypeScript
 * narrows the shape at each branch.
 */
type Loadable<T> =
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-receipts',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './receipts.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './receipts.scss',
})
export class Receipts {
  private api = inject(ReceiptsApi);
  state = signal<Loadable<ReceiptMemberDto[]>>({ kind: 'loading' });

  constructor() {
    this.load();
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.getUserReceipts().subscribe({
      next: data => this.state.set({ kind: 'ok', data }),
      error: err => this.state.set({
        kind: 'error',
        message: err?.message ?? 'Failed to load receipts.',
      }),
    });
  }
}
