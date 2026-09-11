import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptShareDto } from '../api/types';
import { Loadable } from '../receipts/receipt-view';
import { BadgeTone, StatusBadge } from '../status-badge/status-badge';

/** Preset expiry durations offered in the create form, plus a custom escape hatch. */
type ExpiryPreset = 7 | 30 | 90 | 'custom';

const DAY_MS = 86_400_000;

/**
 * Share-link management for a receipt: create a public link (with an
 * expiry), copy it, and deactivate it. Owner-only — the parent
 * (receipt detail) only mounts this panel when the caller owns the
 * receipt, so unlike the members panel there is no `canManage` input.
 *
 * This component owns its own list: share links don't feed into any
 * parent-derived state, so there's no `@Output` back to the receipt page.
 */
@Component({
  selector: 'app-receipt-shares',
  imports: [
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    StatusBadge,
  ],
  templateUrl: './receipt-shares.html',
  styleUrl: './receipt-shares.scss',
})
export class ReceiptShares implements OnInit {
  private api = inject(ReceiptsApi);
  private snackBar = inject(MatSnackBar);
  private clipboard = inject(Clipboard);

  readonly receiptId = input.required<string>();

  state = signal<Loadable<ReceiptShareDto[]>>({ kind: 'loading' });

  /** Whether the "create link" form is expanded. */
  formOpen = signal(false);
  /** A request is in flight — disables every action to avoid overlapping writes. */
  busy = signal(false);
  /** Token of the link whose row is showing the inline "confirm deactivate" prompt. */
  pendingRevokeToken = signal<string | null>(null);

  // Create-form fields (plain properties — only read on submit).
  preset: ExpiryPreset = 30;
  customDays = 30;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.getShares(this.receiptId()).subscribe({
      next: shares => this.state.set({ kind: 'ok', data: shares }),
      error: err =>
        this.state.set({
          kind: 'error',
          message: this.errorText(err, 'Failed to load share links.'),
        }),
    });
  }

  openForm(): void {
    this.resetForm();
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.resetForm();
  }

  private resetForm(): void {
    this.preset = 30;
    this.customDays = 30;
  }

  /** Days the current form selection resolves to, clamped to the backend's 1–365. */
  resolvedDays(): number {
    const raw = this.preset === 'custom' ? this.customDays : this.preset;
    return Math.max(1, Math.min(365, Math.floor(raw) || 1));
  }

  /** Human date the link would expire on, for the form hint. */
  resolvedExpiryDate(): string {
    return new Date(Date.now() + this.resolvedDays() * DAY_MS).toLocaleDateString();
  }

  submitCreate(): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.api.createShare(this.receiptId(), this.resolvedDays()).subscribe({
      next: () => {
        this.busy.set(false);
        this.closeForm();
        this.snackBar.open('Share link created.', 'Dismiss', { duration: 3000 });
        this.load();
      },
      error: err => {
        this.busy.set(false);
        this.snackBar.open(
          this.errorText(err, 'Could not create share link.'),
          'Dismiss',
          { duration: 4000 },
        );
      },
    });
  }

  copyLink(share: ReceiptShareDto): void {
    const ok = this.clipboard.copy(share.shareUrl);
    this.snackBar.open(ok ? 'Link copied.' : 'Could not copy link.', 'Dismiss', {
      duration: 3000,
    });
  }

  confirmRevoke(share: ReceiptShareDto): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.api.deactivateShare(this.receiptId(), share.shareToken).subscribe({
      next: () => {
        const s = this.state();
        if (s.kind === 'ok') {
          this.state.set({
            kind: 'ok',
            data: s.data.filter(x => x.shareToken !== share.shareToken),
          });
        }
        this.busy.set(false);
        this.pendingRevokeToken.set(null);
        this.snackBar.open('Share link deactivated.', 'Dismiss', { duration: 3000 });
      },
      error: err => {
        this.busy.set(false);
        this.pendingRevokeToken.set(null);
        this.snackBar.open(
          this.errorText(err, 'Could not deactivate link.'),
          'Dismiss',
          { duration: 4000 },
        );
      },
    });
  }

  /** Relative expiry copy for a link's chip. Ported from the old React UI. */
  expiryLabel(iso: string): string {
    const diffDays = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
    if (diffDays < 0) return 'Expired';
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    if (diffDays <= 7) return `Expires in ${diffDays} days`;
    return `Expires ${new Date(iso).toLocaleDateString()}`;
  }

  /** Drives the badge colour: expired / expiring soon / fine. */
  expiryState(iso: string): 'expired' | 'soon' | 'ok' {
    const diffDays = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
    if (diffDays < 0) return 'expired';
    if (diffDays <= 3) return 'soon';
    return 'ok';
  }

  /** Maps expiry state to the badge tone. */
  expiryTone(iso: string): BadgeTone {
    const state = this.expiryState(iso);
    if (state === 'expired') return 'error';
    if (state === 'soon') return 'warning';
    return 'neutral';
  }

  /** Pull the backend's `{ error }` message off a failed response, else fall back. */
  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
