// Copy this file to environment.ts and environment.development.ts,
// then fill in your Auth0 tenant values. Both files are gitignored.
export const environment = {
  apiUrl: '/api',
  auth0: {
    domain: 'YOUR_AUTH0_TENANT.us.auth0.com',   // or your custom domain
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    audience: 'YOUR_API_IDENTIFIER',
  },
};