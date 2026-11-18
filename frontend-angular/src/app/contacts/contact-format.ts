// Shared, framework-free helpers for showing contacts — used by the people
// picker and the contacts pages.

import { formatDate } from '@angular/common';

/** The backend's ContactMerger.NameKey: case and surrounding space don't count. */
export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** "JD" for "Jane Doe", "J" for "Jane". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map(w => [...w][0].toUpperCase()).join('');
}

/** "Nov 3", with the year once it isn't this one. */
export function shortDate(iso: string, locale: string): string {
  const date = new Date(iso);
  const format = date.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, y';
  return formatDate(date, format, locale);
}

/**
 * A contact row's second line in the contacts pages: how much they're used,
 * which is what tells two Johns apart. "Joined" pairs with the "Hasn't
 * joined" receipts show for a placeholder.
 */
export function contactMeta(
  c: { hasAccount: boolean; receiptCount: number; lastUsedAt: string | null },
  locale: string,
): string {
  const used = c.lastUsedAt
    ? `${plural(c.receiptCount, 'receipt')} · last ${shortDate(c.lastUsedAt, locale)}`
    : 'Not on a receipt yet';
  return c.hasAccount ? `Joined · ${used}` : used;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
