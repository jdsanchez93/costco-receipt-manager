import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let ref: MatDialogRef<ConfirmDialog, boolean>;
  let overlay: HTMLElement;

  // Opened through a real MatDialog rather than TestBed.createComponent, so
  // MAT_DIALOG_DATA, MatDialogRef and the mat-dialog-close wiring are all real.
  function open(data: ConfirmDialogData): void {
    TestBed.configureTestingModule({ providers: [provideAnimationsAsync('noop')] });
    ref = TestBed.inject(MatDialog).open<ConfirmDialog, ConfirmDialogData, boolean>(
      ConfirmDialog,
      { data },
    );
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    TestBed.tick();
  }

  function button(label: string): HTMLButtonElement {
    const match = Array.from(overlay.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === label);
    if (!match) throw new Error(`No "${label}" button`);
    return match;
  }

  /** Click a button and resolve with what the dialog closed with. */
  function click(label: string): Promise<boolean | undefined> {
    const closed = firstValueFrom(ref.afterClosed());
    button(label).click();
    TestBed.tick();
    return closed;
  }

  it('renders the title, message and confirm label', () => {
    open({ title: 'Delete this receipt?', message: 'Gone for good.', confirmLabel: 'Delete' });
    expect(overlay.querySelector('[mat-dialog-title]')?.textContent).toContain('Delete this receipt?');
    expect(overlay.textContent).toContain('Gone for good.');
    expect(button('Delete')).toBeTruthy();
  });

  it('labels the confirm button "Confirm" when no label is given', () => {
    open({ title: 'Sure?', message: 'Really.' });
    expect(button('Confirm')).toBeTruthy();
  });

  it('closes with true on confirm', async () => {
    open({ title: 'Sure?', message: 'Really.', confirmLabel: 'Delete' });
    expect(await click('Delete')).toBe(true);
  });

  it('closes with false on cancel', async () => {
    open({ title: 'Sure?', message: 'Really.', confirmLabel: 'Delete' });
    expect(await click('Cancel')).toBe(false);
  });

  // jsdom has no layout, so the focus trap sees nothing as tabbable and
  // focuses the container instead; assert the marker rather than real focus.
  it('marks Cancel, not the confirm button, for initial focus', () => {
    open({ title: 'Sure?', message: 'Really.', confirmLabel: 'Delete' });
    expect(button('Cancel').hasAttribute('cdkfocusinitial')).toBe(true);
    expect(button('Delete').hasAttribute('cdkfocusinitial')).toBe(false);
  });

  it('styles the confirm button as destructive only when asked', () => {
    open({ title: 'Sure?', message: 'Really.', confirmLabel: 'Delete', destructive: true });
    expect(button('Delete').classList).toContain('destructive');
    expect(button('Cancel').classList).not.toContain('destructive');
  });
});
