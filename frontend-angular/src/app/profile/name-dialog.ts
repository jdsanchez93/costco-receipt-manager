import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { ProfileApi } from '../api/profile-api';
import { MeDto } from '../api/types';

export interface NameDialogData {
  /** Prefills the field — usually the name from the ID token. */
  suggestion: string;
}

/**
 * Asks for a display name when the backend fell back to the user's sub (its
 * Auth0 /userinfo fetch failed). Saves through PUT /api/me itself, so a
 * failure keeps the dialog open with the error rather than losing the name.
 *
 * Open with `dialog.open<NameDialog, NameDialogData, MeDto>(...)`:
 * `afterClosed()` yields the saved profile, or `undefined` for "Not now",
 * Escape or a backdrop click.
 */
@Component({
  selector: 'app-name-dialog',
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>What should we call you?</h2>
    <form (ngSubmit)="save()">
      <mat-dialog-content>
        <p>
          Everyone on your receipts sees this name. You can change it later on
          your profile.
        </p>
        <mat-form-field appearance="outline" class="field">
          <mat-label>Display name</mat-label>
          <input
            matInput
            name="displayName"
            [(ngModel)]="name"
            [disabled]="busy()"
            required
            maxlength="256"
            autocomplete="name"
            cdkFocusInitial />
        </mat-form-field>
        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="ref.close()" [disabled]="busy()">Not now</button>
        <button mat-flat-button type="submit" [disabled]="busy() || !name.trim()">Save</button>
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
export class NameDialog {
  private api = inject(ProfileApi);
  readonly ref = inject<MatDialogRef<NameDialog, MeDto>>(MatDialogRef);
  private readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);

  /** A save is in flight. */
  busy = signal(false);
  error = signal<string | null>(null);

  // Form field (a plain property — only read on submit).
  name = this.data.suggestion;

  save(): void {
    const displayName = this.name.trim();
    if (!displayName || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    // No Escape or backdrop close mid-save — the result would have nowhere
    // to show.
    this.ref.disableClose = true;

    this.api.updateMe(displayName).subscribe({
      next: me => this.ref.close(me),
      error: err => {
        this.busy.set(false);
        this.ref.disableClose = false;
        this.error.set(this.errorText(err, 'Could not save your name.'));
      },
    });
  }

  private errorText(err: unknown, fallback: string): string {
    const message = (err as { error?: { error?: unknown } })?.error?.error;
    return typeof message === 'string' && message ? message : fallback;
  }
}
