import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ContactsApi } from '../api/contacts-api';
import { ContactDetailDto, ContactDto, ContactReceiptDto } from '../api/types';
import { ConfirmDialog, ConfirmDialogData } from '../confirm-dialog/confirm-dialog';
import { Loadable } from '../receipts/receipt-view';
import { StatusBadge } from '../status-badge/status-badge';
import { ContactAvatar } from './contact-avatar';
import { plural, sameName } from './contact-format';
import { ContactReview } from './contact-review';
import { errorText } from './errors';
import { MergeContactDialog, MergeContactDialogData } from './merge-contact-dialog';
import { RenameContactDialog, RenameContactDialogData } from './rename-contact-dialog';

/** Wide enough for a list of names, never wider than a phone. */
const DIALOG_SIZE: MatDialogConfig = { width: '480px', maxWidth: 'calc(100vw - 32px)' };

/**
 * One contact: the receipts they're on, and — for a placeholder — rename,
 * merge into someone else, and delete once they're on no receipts. An
 * account's name is its user's, and an account can't be merged away.
 */
@Component({
  selector: 'app-contact',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    ContactAvatar,
    StatusBadge,
  ],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class Contact {
  private api = inject(ContactsApi);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private review = inject(ContactReview);

  state = signal<Loadable<ContactDetailDto>>({ kind: 'loading' });
  private contactId = 0;

  constructor() {
    // Not the snapshot: a merge navigates from one contact's page straight
    // to another's, which reuses this component.
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe(params => {
        this.contactId = Number(params.get('contactId'));
        this.load();
      });
  }

  load(): void {
    this.state.set({ kind: 'loading' });
    this.api.getContact(this.contactId).subscribe({
      next: data => this.state.set({ kind: 'ok', data }),
      error: err =>
        this.state.set({
          kind: 'error',
          message:
            err?.status === 404
              ? "This contact isn't in your contacts."
              : errorText(err, 'Could not load this contact.'),
        }),
    });
  }

  receiptLine(r: ContactReceiptDto): string {
    return `${plural(r.itemCount, 'item')} · ${plural(r.memberCount, 'person', 'people')}`;
  }

  readonly plural = plural;

  rename(contact: ContactDto): void {
    this.dialog
      .open<RenameContactDialog, RenameContactDialogData, ContactDto>(RenameContactDialog, {
        ...DIALOG_SIZE,
        data: { contact },
      })
      .afterClosed()
      .subscribe(renamed => {
        if (!renamed) return;
        this.state.update(s => (s.kind === 'ok' ? { kind: 'ok', data: { ...s.data, contact: renamed } } : s));
        this.review.refresh();
        this.snackBar.open('Renamed.', 'Dismiss', { duration: 3000 });
      });
  }

  merge(detail: ContactDetailDto): void {
    const from = detail.contact;
    this.dialog
      .open<MergeContactDialog, MergeContactDialogData, ContactDto>(MergeContactDialog, {
        ...DIALOG_SIZE,
        // Not the search field: on a phone, focusing it raises the keyboard
        // over the list it filters.
        autoFocus: 'dialog',
        data: { contact: from, targets: detail.mergeTargets },
      })
      .afterClosed()
      .subscribe(into => {
        if (!into) return;
        this.review.refresh();
        const message = sameName(from.displayName, into.displayName)
          ? `Merged the two contacts named ${into.displayName.trim()}.`
          : `Merged ${from.displayName} into ${into.displayName}.`;
        this.snackBar.open(message, 'Dismiss', { duration: 4000 });
        // The page they were on no longer exists.
        this.router.navigate(['/app/contacts', into.contactId], { replaceUrl: true });
      });
  }

  remove(contact: ContactDto): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        data: {
          title: `Delete ${contact.displayName}?`,
          message: `They aren't on any receipts. This removes them from your contacts.`,
          confirmLabel: 'Delete',
          destructive: true,
        },
      })
      .afterClosed()
      .subscribe(ok => {
        if (ok !== true) return;
        this.api.deleteContact(contact.contactId).subscribe({
          next: () => {
            this.review.refresh();
            this.snackBar.open(`Deleted ${contact.displayName}.`, 'Dismiss', { duration: 3000 });
            this.router.navigate(['/app/contacts'], { replaceUrl: true });
          },
          error: err => {
            this.snackBar.open(errorText(err, 'Could not delete them.'), 'Dismiss', { duration: 4000 });
            this.load();
          },
        });
      });
  }
}
