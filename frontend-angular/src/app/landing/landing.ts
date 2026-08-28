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
    this.auth.loginWithRedirect();
  }

  signup(): void {
    this.auth.loginWithRedirect({
      authorizationParams: { screen_hint: 'signup' },
    });
  }
}
