// What a festival's passes cost (event_passes and pass_tiers), on the day the page is viewed (pricing.ts): what its
// card says of its price, and a quick view listing each pass at today's price and its next change. Every word of a
// state is pipeline/states.py's.

import type { JSX } from 'kiz-jsx/jsx-runtime';
import { For } from 'solid-js';
import { own } from './bits.ts';
import { today } from './days.ts';
import { one, q, sql } from './db.ts';
import { type Peek, peek } from './dialog.tsx';
import type { Festival } from './festivals.ts';
import { away } from './marks.tsx';
import { money } from './money.ts';
import { nextChange, type Priced, type PriceLine, priceLine, type TierNow, tierNow, type Window } from './pricing.ts';
import { num, opt, PASS, type RowOf, str, TIER, type TierRow } from './rows.ts';
import { KEY } from './states.ts';
import { dayMonth, dayRange } from './ui.ts';
import { say, text } from './wording.ts';

export type Tier = TierRow;
export type Pass = RowOf<typeof PASS> & { readonly tiers: readonly Tier[] };

let byEvent: ReadonlyMap<number, readonly Pass[]> | undefined;
function load(): ReadonlyMap<number, readonly Pass[]> {
  if (byEvent) return byEvent;
  // each festival's passes as their tiers are added, built in place (Pass is read-only)
  const passes = new Map<number, (RowOf<typeof PASS> & { tiers: Tier[] })[]>();
  for (const p of q(PASS, sql`SELECT * FROM event_passes ORDER BY event_id, pass_no`)) {
    const list = passes.get(p.event_id) ?? [];
    list.push({ ...p, tiers: [] });
    passes.set(p.event_id, list);
  }
  for (const t of q(TIER, sql`SELECT * FROM pass_tiers ORDER BY event_id, pass_no, tier_no`)) {
    const pass = passes.get(t.event_id)?.find((p) => p.pass_no === t.pass_no);
    if (!pass) throw new Error(`pass_tiers: festival ${t.event_id} has no pass ${t.pass_no}`);
    pass.tiers.push(t);
  }
  byEvent = passes;
  return passes;
}
const passesOf = (eventId: number): readonly Pass[] => load().get(eventId) ?? [];

// what the card says of a festival's price today (pricing.ts priceLine)
export const priceToday = (e: Priced & { readonly id: number }): PriceLine => priceLine(e, passesOf(e.id), today());

// a tier's price change, in the card's words ("price goes up 15 Dec") or the passes view's form of them, with its price
// ("then 120 € from 15 Dec")
const change = (t: Window) => ({ day: t.lo === null ? null : dayMonth(t.lo), price: money(t.amount, t.currency) });
export const riseNote = (t: Window): string | null => text('next_change', nextChange(t), change(t));
const thenNote = (t: Window): string | null => text('next_change', nextChange(t), change(t), 'after');

// ----- the quick view: each pass at today's price and its next change -----
// a day or other pass by its own name ("20.Nov Friday PARTY"); the others by kind, style, length and for whom, or by
// their own name when that alone would read the same as another pass's
const ownName = (p: Pass, alike: boolean) => alike || p.kind === KEY.pass_kind.DAY || p.kind === KEY.pass_kind.OTHER;
const passName = (p: Pass, alike = false): string =>
  [
    ownName(p, alike) && p.label !== null && p.label !== '' ? p.label : text('pass_kind', p.kind),
    p.style && !ownName(p, alike) ? text('style', p.style) : null,
    p.days !== null && p.days > 1 ? `${p.days} days` : null,
    text('people', p.people, { n: p.group_size }),
    p.kind === KEY.pass_kind.PACKAGE ? null : text('hotel', p.includes_hotel ? KEY.hotel.INCLUDED : KEY.hotel.NONE),
  ]
    .filter(Boolean)
    .join(' · ');

// the passes' quick view, drawn when first opened
let view: Peek | undefined;
const passesDialog = (): Peek => {
  view ??= peek('passes-title');
  return view;
};

// a pass's price today, its fee and its next change; or why it has none
const passNow = (now: TierNow): JSX.Element =>
  'tier' in now ? (
    <span class="pass-now">
      {say('tier_today', now.state, { price: <strong>{money(now.tier.amount, now.tier.currency)}</strong> })}
      {now.tier.fee !== null && now.tier.fee !== 0 ? (
        <span class="muted"> {text('fee', KEY.fee.INCLUDED, { fee: money(now.tier.fee, now.tier.currency) })}</span>
      ) : null}
      {now.next ? <span class="muted">{` · ${thenNote(now.next)}`}</span> : null}
    </span>
  ) : (
    <span class="muted">{text('tier_today', now.state)}</span>
  );

// each pass whose tiers have not all ended, with today's price or why there is none; or that every pass has ended
function passRows(e: { readonly id: number } & Priced): JSX.Element {
  const day = today();
  const rows = passesOf(e.id)
    .map((p): [Pass, TierNow] => [p, tierNow(p, e, day)])
    .filter(([, now]) => now.state !== KEY.tier_today.ENDED);
  return rows.length === 0 ? (
    <p class="muted">{text('tier_today', KEY.tier_today.ENDED, {}, 'all')}</p>
  ) : (
    <ul class="pass-rows">
      <For each={rows}>
        {([p, now]) => (
          <li>
            <span class="pass-name">
              {passName(p, rows.filter(([other]) => passName(other) === passName(p)).length > 1)}
            </span>
            {passNow(now)}
          </li>
        )}
      </For>
    </ul>
  );
}

// Opens over the page; each pass whose tiers have not all ended, with today's price or why there is none, and the next
// change when one is listed; in its foot, where the prices come from, and a link there. Drawn inside the quick view
// (dialog.tsx peek), which reports what throws as it is drawn.
function openPasses(
  e: { readonly id: number; readonly title: string; readonly url: string } & Priced,
  from?: Element | null,
): void {
  passesDialog().show({
    title: `Passes for ${e.title}`,
    sub: () => dayRange(e.start_date, e.end_date),
    body: () => passRows(e),
    foot: () => {
      // prices read from the ticket page say when, since the page may have moved on since, and whether it shows
      // tickets not read yet
      const page = one(
        { page: str, reseller: opt(str), read_on: str, unread: num },
        sql`SELECT page, reseller, read_on, unread FROM ticket_pages WHERE event_id = ?`,
        [e.id],
      );
      const source = page
        ? text(
            'pass_source',
            KEY.pass_source.TICKET_PAGE,
            { reseller: page.reseller, day: dayMonth(page.read_on) },
            page.reseller !== null && page.reseller !== '' ? 'reseller' : undefined,
          )
        : text('pass_source', KEY.pass_source.DESCRIPTION);
      return [
        <p class={['muted', 'small']}>
          {[source, (page?.unread ?? 0) > 0 ? `${text('ticket', KEY.ticket.UNREAD)}.` : null, 'Check before buying.']
            .filter(Boolean)
            .join(' ')}
        </p>,
        <a target="_blank" rel="noopener" href={page ? page.page : e.url}>
          {page?.reseller ??
            text('pass_source', page ? KEY.pass_source.TICKET_PAGE : KEY.pass_source.DESCRIPTION, {}, 'link')}
          {away()}
        </a>,
      ];
    },
  });
  passesDialog().m.open(from);
}

// a button that opens a festival's passes over the page: a card's price, or a highlight with prices behind it
export const passesButton = (e: Festival, cls: 'pass-btn' | 'trait-link', words: string | null): JSX.Element => (
  <button type="button" class={['link', cls]} onClick={own((b) => openPasses(e, b))}>
    {words}
  </button>
);
