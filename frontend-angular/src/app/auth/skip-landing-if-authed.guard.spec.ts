import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, firstValueFrom, isObservable, of } from 'rxjs';

import { skipLandingIfAuthed } from './skip-landing-if-authed.guard';

describe('skipLandingIfAuthed', () => {
  function setup(loading$: Observable<boolean>, authed$: Observable<boolean>) {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: { isLoading$: loading$, isAuthenticated$: authed$ },
        },
        {
          provide: Router,
          useValue: {
            createUrlTree: (commands: unknown[]) => ({ commands } as unknown as UrlTree),
          },
        },
      ],
    });
  }

  async function runGuard(): Promise<unknown> {
    const result = TestBed.runInInjectionContext(() =>
      skipLandingIfAuthed({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
    return isObservable(result) ? firstValueFrom(result) : result;
  }

  it('allows navigation when the SDK has settled and the user is not authenticated', async () => {
    setup(of(false), of(false));
    const result = await runGuard();
    expect(result).toBe(true);
  });

  it('redirects to /app when the SDK has settled and the user is authenticated', async () => {
    setup(of(false), of(true));
    const result = await runGuard();
    expect((result as { commands: unknown[] }).commands).toEqual(['/app']);
  });
});
