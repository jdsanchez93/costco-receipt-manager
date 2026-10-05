// Template for environment.development.ts (gitignored) — copy it there and
// fill in your Auth0 tenant values for local dev.
//
// environment.ts, the production config, IS committed; edit it directly.
export const environment = {
  apiUrl: '/api',
  auth0: {
    domain: 'YOUR_AUTH0_TENANT.us.auth0.com',   // or your custom domain
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    audience: 'YOUR_API_IDENTIFIER',
  },
};