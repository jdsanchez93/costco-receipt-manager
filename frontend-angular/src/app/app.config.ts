import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';
import { environment } from '../environments/environment';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authHttpInterceptorFn])),
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
        allowedList: [`${environment.apiUrl}/*`],
      },
    }),
  ]
};
