import { OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';

import { NameDialog, NameDialogData } from './name-dialog';
import { ProfileApi } from '../api/profile-api';
import { MeDto } from '../api/types';

const me = (displayName: string): MeDto => ({
  userId: 'auth0|1',
  displayName,
  email: 'ana@example.com',
  needsName: false,
});

describe('NameDialog', () => {
  let ref: MatDialogRef<NameDialog, MeDto>;
  let overlay: HTMLElement;
  let updateMe: ReturnType<typeof vi.fn>;

  // Opened through a real MatDialog, as in confirm-dialog.spec.ts, so
  // MAT_DIALOG_DATA and MatDialogRef are real.
  function open(
    suggestion: string,
    response: (displayName: string) => Observable<MeDto> = name => of(me(name)),
  ): void {
    updateMe = vi.fn().mockImplementation(response);
    TestBed.configureTestingModule({
      providers: [provideAnimationsAsync('noop'), { provide: ProfileApi, useValue: { updateMe } }],
    });
    ref = TestBed.inject(MatDialog).open<NameDialog, NameDialogData, MeDto>(NameDialog, {
      data: { suggestion },
    });
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
    TestBed.tick();
  }

  function button(label: string): HTMLButtonElement {
    const match = Array.from(overlay.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === label);
    if (!match) throw new Error(`No "${label}" button`);
    return match;
  }

  it('prefills the field with the suggestion', () => {
    open('Ana Silva');
    expect(ref.componentInstance.name).toBe('Ana Silva');
  });

  it('saves the trimmed name and closes with the saved profile', async () => {
    open('Ana Silva');
    const closed = firstValueFrom(ref.afterClosed());
    ref.componentInstance.name = '  Ana S  ';

    ref.componentInstance.save();
    TestBed.tick();

    expect(updateMe).toHaveBeenCalledWith('Ana S');
    expect(await closed).toEqual(me('Ana S'));
  });

  it('closes with undefined on "Not now" without saving', async () => {
    open('Ana Silva');
    const closed = firstValueFrom(ref.afterClosed());

    button('Not now').click();
    TestBed.tick();

    expect(await closed).toBeUndefined();
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('does not save a blank name', () => {
    open('');
    ref.componentInstance.save();
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('stays open and shows the backend error when saving fails', () => {
    open('Ana Silva', () => throwError(() => ({ error: { error: 'Display name is required' } })));
    const close = vi.spyOn(ref, 'close');

    ref.componentInstance.save();
    TestBed.tick();

    expect(close).not.toHaveBeenCalled();
    expect(ref.componentInstance.busy()).toBe(false);
    expect(ref.disableClose).toBe(false);
    expect(overlay.querySelector('[role="alert"]')?.textContent).toContain('Display name is required');
  });

  it('cannot be dismissed while a save is in flight', () => {
    const pending = new Subject<MeDto>();
    open('Ana Silva', () => pending);

    ref.componentInstance.save();

    expect(ref.disableClose).toBe(true);
    pending.error({ error: { error: 'boom' } });
    expect(ref.disableClose).toBe(false);
  });
});
