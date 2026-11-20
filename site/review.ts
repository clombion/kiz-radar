// The review dashboard's entry (review.html), as main.ts is the site's: it loads review.json (pipeline/review.py, built
// with the site's database) and draws the page from it (dashboard.tsx); what goes wrong is said (report.ts).
import { reviewPage } from './dashboard.tsx';
import { get } from './net.ts';
import { reviewOf } from './pending.ts';
import { done, reportUncaught } from './report.ts';

const DATA = new URL(/* @vite-ignore */ '../data/', import.meta.url);

async function start(into: HTMLElement): Promise<void> {
  const r = reviewOf(await (await get(new URL('review.json', DATA), { revalidate: true })).json());
  reviewPage(into, r);
}

reportUncaught();
const page = document.querySelector<HTMLElement>('#review');
if (page) done(start(page), 'loading the review');
