import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ReceiptsApi } from '../api/receipts-api';
import { ReceiptMemberDto, ReceiptRole } from '../api/types';

/**
 * Member management for a receipt: add a placeholder participant, change a
 * member's role, remove a member. Owner-only actions are gated behind
 * `canManage` — non-owners see a read-only roster.
 *
 * The component doesn't own the member list. `members` comes in as an input
 * and every successful mutation emits the full updated list through
 * `membersChange` so the parent (receipt detail) stays the single source of
 * truth and can re-derive item assignments.
 */
@Component({
  selector: 'app-receipt-members',
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
  ],
  templateUrl: './receipt-members.html',
  styleUrl: './receipt-members.scss',
})
export class ReceiptMembers {
  private api = inject(ReceiptsApi);
  private snackBar = inject(MatSnackBar);

  readonly receiptId = input.required<string>();
  readonly members = input.required<ReceiptMemberDto[]>();
  readonly canManage = input<boolean>(false);

  readonly membersChange = output<ReceiptMemberDto[]>();

  /** Whether the "add member" form is expanded. */
  formOpen = signal(false);
  /** A request is in flight — disables every action to avoid overlapping writes. */
  busy = signal(false);
  /** Id of the member whose row is showing the inline "confirm remove" prompt. */
  pendingRemovalId = signal<number | null>(null);

  // Add-member form fields (plain properties — only read on submit).
  newName = '';
  newEmail = '';
  newRole: ReceiptRole = 'editor';

  roleLabel(role: ReceiptRole): string {
    return role === 'owner' ? 'Owner' : 'Editor';
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
    this.newName = '';
    this.newEmail = '';
    this.newRole = 'editor';
  }

  submitAdd(): void {
    const displayName = this.newName.trim();
    if (!displayName || this.busy()) return;

    const email = this.newEmail.trim();
    this.busy.set(true);

    this.api
      .addReceiptMember(this.receiptId(), {
        displayName,
        email: email || null,
        role: this.newRole,
      })
      .subscribe({
        next: res => {
          this.membersChange.emit([...this.members(), res.member]);
          this.busy.set(false);
          this.closeForm();
          this.snackBar.open(`Added ${res.member.displayName}.`, 'Dismiss', {
            duration: 3000,
          });
        },
        error: err => {
          this.busy.set(false);
          this.snackBar.open(this.errorText(err, 'Could not add member.'), 'Dismiss', {
            duration: 4000,
          });
        },
      });
  }

  changeRole(member: ReceiptMemberDto, role: ReceiptRole): void {
    if (member.role === role || this.busy()) return;
    this.busy.set(true);

    this.api.updateMemberRole(this.receiptId(), member.id, role).subscribe({
      next: res => {
        this.membersChange.emit(
          this.members().map(m => (m.id === member.id ? res.member : m)),
        );
        this.busy.set(false);
      },
      error: err => {
        this.busy.set(false);
        this.snackBar.open(this.errorText(err, 'Could not change role.'), 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  confirmRemove(member: ReceiptMemberDto): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.api.removeReceiptMember(this.receiptId(), member.id).subscribe({
      next: () => {
        this.membersChange.emit(this.members().filter(m => m.id !== member.id));
        this.busy.set(false);
        this.pendingRemovalId.set(null);
        this.snackBar.open(`Removed ${member.displayName}.`, 'Dismiss', {
          duration: 3000,
        });
      },
      error: err => {
        this.busy.set(false);
        this.pendingRemovalId.set(null);
        this.snackBar.open(this.errorText(err, 'Could not remove member.'), 'Dismiss', {
          duration: 4000,
        });
      },
    });
  }

  /** Pull the backend's `{ error }` message off a failed response, else fall back. */
  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
