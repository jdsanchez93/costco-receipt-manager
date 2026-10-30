import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Router, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, of, throwError } from 'rxjs';

import { ShellComponent } from './shell.component';
import { ProfileApi } from '../api/profile-api';
import { MeDto } from '../api/types';
import { NameDialog } from '../profile/name-dialog';

const me = (needsName: boolean): MeDto => ({
  userId: 'google-oauth2|1',
  displayName: needsName ? 'google-oauth2|1' : 'Ana',
  email: null,
  needsName,
});

describe('ShellComponent', () => {
  let component: ShellComponent;
  let fixture: ComponentFixture<ShellComponent>;
  let authSpy: { logout: ReturnType<typeof vi.fn>; user$: Observable<unknown> };
  let dialogSpy: { open: ReturnType<typeof vi.fn> };
  let snackSpy: { open: ReturnType<typeof vi.fn> };

  async function setup(opts: {
    getMe?: Observable<MeDto>;
    /** The URL the app landed on. */
    url?: string;
    /** What the name dialog closes with. */
    closedWith?: MeDto;
  } = {}): Promise<void> {
    const getMe = opts.getMe ?? of(me(false));
    authSpy = { logout: vi.fn(), user$: of({ name: 'Ana Silva', email: 'ana@example.com' }) };
    dialogSpy = { open: vi.fn().mockReturnValue({ afterClosed: () => of(opts.closedWith) }) };
    snackSpy = { open: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        provideRouter([]),
        provideAnimationsAsync('noop'),
        // BreakpointObserver relies on window.matchMedia, which jsdom doesn't
        // implement. Stub it out so the "shell renders on desktop" default
        // (matches=false) is deterministic in tests.
        {
          provide: BreakpointObserver,
          useValue: {
            observe: () => of({ matches: false, breakpoints: {} }),
          },
        },
        { provide: AuthService, useValue: authSpy },
        { provide: ProfileApi, useValue: { getMe: () => getMe } },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: MatSnackBar, useValue: snackSpy },
      ],
    }).compileComponents();

    // getMe() is synchronous here, so the URL must be in place before the
    // constructor runs.
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(opts.url ?? '/app/receipts');

    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('asks for a name, prefilled from the ID token, when the backend fell back to the sub', async () => {
    await setup({ getMe: of(me(true)) });
    expect(dialogSpy.open).toHaveBeenCalledWith(NameDialog, { data: { suggestion: 'Ana Silva' } });
  });

  it('confirms with a snackbar once the dialog saves', async () => {
    await setup({ getMe: of(me(true)), closedWith: me(false) });
    expect(snackSpy.open).toHaveBeenCalledWith('Saved.', 'Dismiss', { duration: 3000 });
  });

  it('shows no snackbar when the dialog is dismissed', async () => {
    await setup({ getMe: of(me(true)) });
    expect(snackSpy.open).not.toHaveBeenCalled();
  });

  it('does not ask when the user already has a name', async () => {
    await setup({ getMe: of(me(false)) });
    expect(dialogSpy.open).not.toHaveBeenCalled();
  });

  it('does not ask when the app loads on the profile page, which already asks', async () => {
    await setup({ getMe: of(me(true)), url: '/app/profile' });
    expect(dialogSpy.open).not.toHaveBeenCalled();
  });

  it('stays quiet when the profile check fails', async () => {
    await setup({ getMe: throwError(() => new Error('boom')) });
    expect(dialogSpy.open).not.toHaveBeenCalled();
  });

  it('logout() calls AuthService.logout with returnTo = origin', async () => {
    await setup();
    component.logout();
    expect(authSpy.logout).toHaveBeenCalledWith({
      logoutParams: { returnTo: window.location.origin },
    });
  });
});
