import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '@auth0/auth0-angular';

@Component({
  selector: 'app-landing',
  imports: [MatButtonModule, MatCardModule],
  templateUrl: './landing.html',
  styleUrl: './landing.scss',
})
export class Landing {
  private auth = inject(AuthService);

  login(): void {
    // appState.target is the SDK's post-callback destination. Without it,
    // the SDK returns users to the redirect_uri (i.e., '/') which drops
    // them right back on this landing page.
    this.auth.loginWithRedirect({ appState: { target: '/app' } });
  }

  signup(): void {
    this.auth.loginWithRedirect({
      appState: { target: '/app' },
      authorizationParams: { screen_hint: 'signup' },
    });
  }
}
