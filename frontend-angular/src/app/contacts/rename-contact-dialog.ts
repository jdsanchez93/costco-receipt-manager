import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ContactsApi } from '../api/contacts-api';
import { ContactDto } from '../api/types';
import { errorText } from './errors';

export interface RenameContactDialogData {
  contact: ContactDto;
}

/**
 * Renames a placeholder. Saves through PATCH /api/contacts/{id} itself, so a
 * failure keeps the dialog open with the error. `afterClosed()` yields the
 * renamed contact, or `undefined` if nothing was saved.
 */
@Component({
  selector: 'app-rename-contact-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Rename {{ data.contact.displayName }}</h2>
    <form (ngSubmit)="save()">
      <mat-dialog-content>
        <p>Everyone on their receipts sees this name.</p>
        <mat-form-field appearance="outline" class="field">
          <mat-label>Name</mat-label>
          <!-- Selected on focus: a rename usually replaces the name outright. -->
          <input
            #box
            matInput
            name="displayName"
            [(ngModel)]="name"
            [disabled]="busy()"
            required
            maxlength="256"
            autocomplete="off"
            cdkFocusInitial
            (focus)="box.select()" />
        </mat-form-field>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()" [disabled]="busy()">Cancel</button>
        <button mat-flat-button type="submit" [disabled]="busy() || !changed()">Save</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .field {
      width: 100%;
    }

    .error {
      margin: 0;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-error);
    }
  `,
})
export class RenameContactDialog {
  private api = inject(ContactsApi);
  readonly ref = inject<MatDialogRef<RenameContactDialog, ContactDto>>(MatDialogRef);
  readonly data = inject<RenameContactDialogData>(MAT_DIALOG_DATA);

  busy = signal(false);
  error = signal<string | null>(null);

  // Form field (a plain property — read on submit and for the Save state).
  name = this.data.contact.displayName;

  changed(): boolean {
    const name = this.name.trim();
    return !!name && name !== this.data.contact.displayName;
  }

  save(): void {
    if (!this.changed() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.ref.disableClose = true;

    this.api.renameContact(this.data.contact.contactId, this.name.trim()).subscribe({
      next: contact => this.ref.close(contact),
      error: err => {
        this.busy.set(false);
        this.ref.disableClose = false;
        this.error.set(errorText(err, 'Could not rename them.'));
      },
    });
  }
}
