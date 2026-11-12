import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';
import { environment } from '../environments/environment';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withXhr(), withInterceptors([authHttpInterceptorFn])),
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      // useRefreshTokens: SDK requests + rotates refresh tokens so returning
      // users are silently re-authenticated on page load (no click required)
      // instead of being kicked back through the Auth0 login flow. Requires
      // "Allow Offline Access" enabled on the Auth0 API in the dashboard.
      useRefreshTokens: true,
      // cacheLocation: persist tokens in localStorage so they survive a tab
      // close. Default is in-memory, which forces a re-login on every tab
      // restart. The Auth0 SDK still rotates + revokes on logout.
      cacheLocation: 'localstorage',
      authorizationParams: {
        redirect_uri: window.location.origin,
        audience: environment.auth0.audience,
        scope: 'openid profile email',
      },
      httpInterceptor: {
        // Order matters — the SDK attaches a token to the first match.
        // The public shared-receipt read must still go out for a logged-out
        // visitor instead of erroring, so it needs its own `allowAnonymous`
        // entry ahead of the catch-all. That still attaches a token when
        // there is one, which is how the backend recognizes a member and
        // sends them on to the receipt.
        allowedList: [
          { uri: `${environment.apiUrl}/receipts/shared/*`, allowAnonymous: true },
          `${environment.apiUrl}/*`,
        ],
      },
    }),
  ]
};
