// The small marks the views share, drawn by Solid: the arrow after words that lead off the site, On now before a
// festival's name, and the animated mark while something loads, which main.ts draws through placed.tsx as a view waits
// for the database, and the line in its place when the load failed.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { message } from './report.ts';
import { KEY } from './states.ts';
import { type Key, text } from './wording.ts';

// the arrow after words that lead off the site, shown and not read out (the link's own words say where it goes)
export const away = (): JSX.Element => <span aria-hidden="true">{' ↗'}</span>;

// "On now" before a festival's name while it is on (phase on), as its card, the Friends lists and the plans say it
export const nowTag = (e: { readonly phase: Key<'phase'> }): JSX.Element =>
  e.phase === KEY.phase.ON ? [<span class="now-tag">{text('phase', e.phase)}</span>, ' '] : null;

// the animated mark, while something loads (index.html holds the same, for before the scripts run)
export const loadingMark = (words = ''): JSX.Element => (
  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a line of the page that says it loads, as index.html's does: an <output>, the rule's tag, is inline and a form's control, not a paragraph
  <p class={['status', 'loading']} role="status">
    <img src="loading.svg" alt="" width="56" height="56" />
    <span>{words || <span class="visually-hidden">Loading</span>}</span>
  </p>
);

// what a view says in place of the loading mark when the data failed to load (or the page, when site.json did)
export const loadFailed = (e: unknown): JSX.Element => (
  <p class={['status', 'error']}>{`Could not load the data: ${message(e)}`}</p>
);
