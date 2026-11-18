import { Component, computed, input } from '@angular/core';

import { initials } from './contact-format';

/** A contact's initials in a circle. Decorative: the name is always beside it. */
@Component({
  selector: 'app-contact-avatar',
  template: `{{ letters() }}`,
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      flex: none;
      display: grid;
      place-items: center;
      width: var(--contact-avatar-size, 2.5rem);
      height: var(--contact-avatar-size, 2.5rem);
      border-radius: 50%;
      font: var(--contact-avatar-font, var(--mat-sys-label-large));
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class ContactAvatar {
  readonly name = input.required<string>();
  readonly letters = computed(() => initials(this.name()));
}
