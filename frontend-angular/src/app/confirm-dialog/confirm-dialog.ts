import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';

export interface ConfirmDialogData {
  /** The specific question, e.g. "Delete this receipt?" — not a generic "Confirm". */
  title: string;
  /** What happens if the user goes ahead. */
  message: string;
  /** Names the action, e.g. "Delete". Defaults to "Confirm". */
  confirmLabel?: string;
  /** Styles the confirm button in the error colour. */
  destructive?: boolean;
}

/**
 * A yes/no confirmation. Open with
 * `dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(...)`: `afterClosed()`
 * yields `true` on confirm, `false` on Cancel, and `undefined` on Escape or a
 * backdrop click, so callers should test `=== true`.
 *
 * Initial focus is on Cancel, so a reflexive Enter never confirms.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <!-- Explicit false: a bare mat-dialog-close attribute closes with ''. -->
      <button mat-button [mat-dialog-close]="false" cdkFocusInitial>Cancel</button>
      <button mat-flat-button [mat-dialog-close]="true" [class.destructive]="data.destructive">
        {{ data.confirmLabel ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
