import { Routes } from '@angular/router';
import { AuthGuard } from '@auth0/auth0-angular';

import { skipLandingIfAuthed } from './auth/skip-landing-if-authed.guard';
import { Landing } from './landing/landing';
import { Receipt } from './receipt/receipt';
import { Receipts } from './receipts/receipts';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  // Public entry point. Authenticated users skip straight to the app.
  {
    path: '',
    component: Landing,
    pathMatch: 'full',
    canActivate: [skipLandingIfAuthed],
  },

  // Authenticated app — shell wraps every child route. AuthGuard bounces
  // unauthenticated users to Auth0 and returns them here post-login via
  // the appState.target round-trip built into @auth0/auth0-angular.
  {
    path: 'app',
    component: ShellComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: '', redirectTo: 'receipts', pathMatch: 'full' },
      { path: 'receipts', component: Receipts },
      { path: 'receipts/:receiptId', component: Receipt },
    ],
  },

  // Anything unrecognized goes to landing.
  { path: '**', redirectTo: '' },
];
