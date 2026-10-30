import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, of, throwError } from 'rxjs';

import { Profile } from './profile';
import { ProfileApi } from '../api/profile-api';
import { MeDto } from '../api/types';

const me = (displayName: string, email: string | null = 'ana@example.com'): MeDto => ({
  userId: 'auth0|1',
  displayName,
  email,
  needsName: displayName === 'auth0|1',
});

describe('Profile', () => {
  let fixture: ComponentFixture<Profile>;
  let component: Profile;
  let getMe: ReturnType<typeof vi.fn>;
  let updateMe: ReturnType<typeof vi.fn>;
  let snackSpy: { open: ReturnType<typeof vi.fn> };

  function setup(opts: {
    getMe?: () => Observable<MeDto>;
    updateMe?: (displayName: string) => Observable<MeDto>;
  } = {}): void {
    getMe = vi.fn().mockImplementation(opts.getMe ?? (() => of(me('Ana'))));
    updateMe = vi.fn().mockImplementation(opts.updateMe ?? ((name: string) => of(me(name))));
    snackSpy = { open: vi.fn() };

    TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideAnimationsAsync('noop'),
        { provide: ProfileApi, useValue: { getMe, updateMe } },
        { provide: MatSnackBar, useValue: snackSpy },
        { provide: AuthService, useValue: { user$: of({ name: 'Ana Silva', email: 'ana@example.com' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('loads the profile and prefills the name', () => {
    setup();
    expect(component.state()).toEqual({ kind: 'ok', data: me('Ana') });
    expect(component.name).toBe('Ana');
    expect(fixture.nativeElement.textContent).toContain('ana@example.com');
  });

  it('prefills the ID token name, not the sub, when the backend fell back', () => {
    setup({ getMe: () => of(me('auth0|1')) });
    expect(component.name).toBe('Ana Silva');
    expect(component.canSave(me('auth0|1'))).toBe(true);
    expect(fixture.nativeElement.textContent).toContain("You haven't picked a name yet");
  });

  it('shows the backend error when loading fails', () => {
    setup({ getMe: () => throwError(() => ({ error: { error: 'User is not provisioned' } })) });
    expect(component.state()).toEqual({ kind: 'error', message: 'User is not provisioned' });
  });

  it('canSave only for a non-blank name that differs from the saved one', () => {
    setup();
    const saved = me('Ana');

    component.name = 'Ana';
    expect(component.canSave(saved)).toBe(false);
    component.name = '   ';
    expect(component.canSave(saved)).toBe(false);
    component.name = ' Ana ';
    expect(component.canSave(saved)).toBe(false);
    component.name = 'Ana B';
    expect(component.canSave(saved)).toBe(true);
  });

  it('save sends the trimmed name and keeps the response', () => {
    setup();
    component.name = '  Ana B  ';

    component.save();

    expect(updateMe).toHaveBeenCalledWith('Ana B');
    expect(component.state()).toEqual({ kind: 'ok', data: me('Ana B') });
    expect(component.name).toBe('Ana B');
    expect(component.busy()).toBe(false);
    expect(snackSpy.open).toHaveBeenCalledWith('Saved.', 'Dismiss', { duration: 3000 });
  });

  it('save does nothing when the name is unchanged', () => {
    setup();
    component.save();
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('save surfaces the backend error and keeps the saved profile', () => {
    setup({ updateMe: () => throwError(() => ({ error: { error: 'Display name is required' } })) });
    component.name = 'Ana B';

    component.save();

    expect(component.state()).toEqual({ kind: 'ok', data: me('Ana') });
    expect(component.busy()).toBe(false);
    expect(snackSpy.open).toHaveBeenCalledWith('Display name is required', 'Dismiss', {
      duration: 4000,
    });
  });
});
