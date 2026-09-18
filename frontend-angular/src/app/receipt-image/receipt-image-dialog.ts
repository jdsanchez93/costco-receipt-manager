import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ReceiptImageDialogData {
  imageUrl: string;
}

/** Fullscreen view of a receipt image, opened from `<app-receipt-image>`. */
@Component({
  selector: 'app-receipt-image-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './receipt-image-dialog.html',
  styleUrl: './receipt-image-dialog.scss',
})
export class ReceiptImageDialog {
  readonly data = inject<ReceiptImageDialogData>(MAT_DIALOG_DATA);
}
