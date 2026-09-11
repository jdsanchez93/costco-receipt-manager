import { Component, input } from '@angular/core';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error';

/**
 * A non-interactive status/attribute label — the "colored chip" pattern
 * MUI allows but M3's own chip guidance reserves for filter/input/assist
 * affordances. Use this instead of stretching `mat-chip` for things like
 * "reconciled" / "expires soon" / "unassigned".
 *
 * `display: inline-flex; align-items: center` (rather than relying on the
 * host's flex row) keeps the label centered inside the pill regardless of
 * the type-scale token's line-height — a plain padded `<span>` with e.g.
 * `font: var(--mat-sys-label-medium)` can look off-center because M3's
 * compact line-heights don't split evenly around symmetric padding.
 */
@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
})
export class StatusBadge {
  readonly tone = input<BadgeTone>('neutral');
}
