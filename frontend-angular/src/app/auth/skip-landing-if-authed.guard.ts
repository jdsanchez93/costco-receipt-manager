import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { combineLatest, filter, map, take } from 'rxjs';

/**
 * Guard for the public landing route. If the Auth0 SDK has already hydrated
 * with an authenticated session — either from a just-completed login or from
 * a silent-refresh on page load when refresh tokens are enabled — send the
 * user straight into the app instead of showing the marketing page.
 *
 * `isLoading$` starts `true` and flips to `false` once the SDK has resolved
 * the initial auth state; we wait for that before deciding so an early
 * "not yet checked" reading doesn't cause a wrong-way bounce.
 */
export const skipLandingIfAuthed: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.isLoading$, auth.isAuthenticated$]).pipe(
    filter(([loading]) => !loading),
    take(1),
    map(([, authed]) => (authed ? router.createUrlTree(['/app']) : true)),
  );
};
