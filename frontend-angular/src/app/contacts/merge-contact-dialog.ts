import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';

import { ContactsApi } from '../api/contacts-api';
import { ContactDto } from '../api/types';
import { ContactAvatar } from './contact-avatar';
import { contactMeta, sameName } from './contact-format';
import { errorText } from './errors';

export interface MergeContactDialogData {
  contact: ContactDto;
  /** Who `contact` can be merged into, same name first (ContactDetailDto.mergeTargets). */
  targets: ContactDto[];
}

/** Past this many, the list gets a search field. */
const SEARCH_FROM = 6;

/**
 * Two steps: pick who the contact really is, then confirm what moves. Merges
 * through POST /api/contacts/{id}/merge itself, so a failure stays in the
 * dialog. `afterClosed()` yields the contact merged into, or `undefined`.
 */
@Component({
  selector: 'app-merge-contact-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    ContactAvatar,
  ],
  template: `
    @if (picked(); as into) {
      <h2 mat-dialog-title>{{ title(into) }}</h2>
      <mat-dialog-content>
        <p>{{ consequence(into) }}</p>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="back()" [disabled]="busy()">Back</button>
        <button mat-flat-button type="button" (click)="merge(into)" [disabled]="busy()">Merge</button>
      </mat-dialog-actions>
    } @else {
      <h2 mat-dialog-title>Merge {{ data.contact.displayName }} into…</h2>
      <mat-dialog-content>
        <p>Pick who {{ data.contact.displayName }} really is. Their receipts move over.</p>
        @if (searchable) {
          <mat-form-field appearance="outline" class="field" subscriptSizing="dynamic">
            <mat-label>Search contacts</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              #box
              matInput
              type="search"
              autocomplete="off"
              (input)="query.set(box.value)" />
          </mat-form-field>
        }
        @if (shown().length === 0) {
          <p class="none">No one matches “{{ query().trim() }}”.</p>
        }
        <mat-action-list class="targets">
          @for (t of shown(); track t.contactId) {
            <button mat-list-item type="button" (click)="picked.set(t)">
              <app-contact-avatar matListItemAvatar [name]="t.displayName" />
              <span matListItemTitle>{{ t.displayName }}</span>
              <span matListItemLine>{{ meta(t) }}</span>
            </button>
          }
        </mat-action-list>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()">Cancel</button>
      </mat-dialog-actions>
    }
  `,
  styles: `
    .field {
      width: 100%;
    }

    .targets {
      // The rows line up with the dialog's text rather than inset from it.
      margin: 0 -24px;
      padding: 0;
    }

    .none,
    .error {
      margin: 0;
      font: var(--mat-sys-body-medium);
    }

    .none {
      color: var(--mat-sys-on-surface-variant);
    }

    .error {
      margin-top: 0.5rem;
      color: var(--mat-sys-error);
    }
  `,
})
export class MergeContactDialog {
  private api = inject(ContactsApi);
  private locale = inject(LOCALE_ID);
  readonly ref = inject<MatDialogRef<MergeContactDialog, ContactDto>>(MatDialogRef);
  readonly data = inject<MergeContactDialogData>(MAT_DIALOG_DATA);

  readonly searchable = this.data.targets.length > SEARCH_FROM;
  query = signal('');
  /** The second step's target. */
  picked = signal<ContactDto | null>(null);
  busy = signal(false);
  error = signal<string | null>(null);

  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q
      ? this.data.targets.filter(t => t.displayName.toLowerCase().includes(q))
      : this.data.targets;
  });

  meta(c: ContactDto): string {
    return contactMeta(c, this.locale);
  }

  /** Two Johns read as "the two Johns", not "merge John into John". */
  sameName(into: ContactDto): boolean {
    return sameName(into.displayName, this.data.contact.displayName);
  }

  title(into: ContactDto): string {
    return this.sameName(into)
      ? `Merge the two contacts named ${into.displayName.trim()}?`
      : `Merge ${this.data.contact.displayName} into ${into.displayName}?`;
  }

  /** What the merge does, in the names the owner knows them by. */
  consequence(into: ContactDto): string {
    const from = this.data.contact;
    const n = from.receiptCount;
    const theirReceipts = n === 1 ? 'receipt' : `${n} receipts`;
    const what = this.sameName(into)
      ? n > 0
        ? `This ${from.displayName}'s ${theirReceipts} will move to the other, with the same items, and the two will be one contact.`
        : `The two will be one contact.`
      : n > 0
        ? `${from.displayName}'s ${theirReceipts} will list ${into.displayName} instead, with the same items, and ${from.displayName} will be removed from your contacts.`
        : `${from.displayName} will be removed from your contacts.`;
    return `${what} This can't be undone.`;
  }

  back(): void {
    this.picked.set(null);
    this.error.set(null);
  }

  merge(into: ContactDto): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.ref.disableClose = true;

    this.api.mergeContact(this.data.contact.contactId, into.contactId).subscribe({
      next: merged => this.ref.close(merged),
      error: err => {
        this.busy.set(false);
        this.ref.disableClose = false;
        this.error.set(errorText(err, 'Could not merge them.'));
      },
    });
  }
}
