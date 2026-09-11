import { Routes } from '@angular/router';
import { AuthGuard } from '@auth0/auth0-angular';

import { skipLandingIfAuthed } from './auth/skip-landing-if-authed.guard';

// Routes lazy-load their components so a first paint (and, importantly, an
// anonymous visitor landing on /shared-receipt) doesn't pull the whole
// authenticated app into the initial bundle.
export const routes: Routes = [
  // Public entry point. Authenticated users skip straight to the app.
  {
    path: '',
    loadComponent: () => import('./landing/landing').then(m => m.Landing),
    pathMatch: 'full',
    canActivate: [skipLandingIfAuthed],
  },

  // Authenticated app — shell wraps every child route. AuthGuard bounces
  // unauthenticated users to Auth0 and returns them here post-login via
  // the appState.target round-trip built into @auth0/auth0-angular.
  {
    path: 'app',
    loadComponent: () => import('./shell/shell.component').then(m => m.ShellComponent),
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: '', redirectTo: 'receipts', pathMatch: 'full' },
      {
        path: 'receipts',
        loadComponent: () => import('./receipts/receipts').then(m => m.Receipts),
      },
      {
        path: 'receipts/:receiptId',
        loadComponent: () => import('./receipt/receipt').then(m => m.Receipt),
      },
    ],
  },

  // Public read-only receipt view. No shell, no guard — a share link must
  // work identically for logged-in and logged-out visitors. Invalid or
  // expired tokens are handled inside the component (error state), not here.
  {
    path: 'shared-receipt/:shareToken',
    loadComponent: () => import('./shared-receipt/shared-receipt').then(m => m.SharedReceipt),
  },

  // Anything unrecognized goes to landing.
  { path: '**', redirectTo: '' },
];
