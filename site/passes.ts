// What a festival's passes cost (event_passes and pass_tiers), on the day the page is viewed (pricing.ts): what its
// card says of its price, and a quick view listing each pass at today's price and its next change. Every word of a
// state is pipeline/states.py's.

import { today } from './days.ts';
import { one, q } from './db.ts';
import { h } from './dom.ts';
import { type Modal, modal } from './modal.ts';
import { money } from './money.ts';
import { nextChange, type Priced, type PriceLine, priceLine, type TierNow, tierNow, type Window } from './pricing.ts';
import { num, opt, PASS, type RowOf, str, TIER, type TierRow } from './rows.ts';
import { KEY } from './states.ts';
import { away, dayMonth, dayRange } from './ui.ts';
import { say, text } from './wording.ts';

export type Tier = TierRow;
export type Pass = RowOf<typeof PASS> & { tiers: Tier[] };

let byEvent: Map<number, Pass[]> | undefined;
function load(): Map<number, Pass[]> {
  if (byEvent) return byEvent;
  const passes = new Map<number, Pass[]>();
  for (const p of q(PASS, 'SELECT * FROM event_passes ORDER BY event_id, pass_no')) {
    const list = passes.get(p.event_id) ?? [];
    list.push({ ...p, tiers: [] });
    passes.set(p.event_id, list);
  }
  for (const t of q(TIER, 'SELECT * FROM pass_tiers ORDER BY event_id, pass_no, tier_no')) {
    const pass = passes.get(t.event_id)?.find((p) => p.pass_no === t.pass_no);
    if (!pass) throw new Error(`pass_tiers: festival ${t.event_id} has no pass ${t.pass_no}`);
    pass.tiers.push(t);
  }
  byEvent = passes;
  return passes;
}
const passesOf = (eventId: number): Pass[] => load().get(eventId) ?? [];

// what the card says of a festival's price today (pricing.ts priceLine)
export const priceToday = (e: Priced & { id: number }): PriceLine => priceLine(e, passesOf(e.id), today());

// a tier's price change, in the card's words ("price goes up 15 Dec") or the passes view's form of them, with its price
// ("then 120 € from 15 Dec")
const change = (t: Window) => ({ day: t.lo === null ? null : dayMonth(t.lo), price: money(t.amount, t.currency) });
export const riseNote = (t: Window): string | null => text('next_change', nextChange(t), change(t));
const thenNote = (t: Window): string | null => text('next_change', nextChange(t), change(t), 'after');

// ----- the quick view: each pass at today's price and its next change -----
// a day or other pass by its own name ("20.Nov Friday PARTY"); the others by kind, style, length and for whom, or by
// their own name when that alone would read the same as another pass's
const ownName = (p: Pass, own: boolean) => own || p.kind === KEY.pass_kind.DAY || p.kind === KEY.pass_kind.OTHER;
const passName = (p: Pass, own = false): string =>
  [
    ownName(p, own) ? p.label || text('pass_kind', p.kind) : text('pass_kind', p.kind),
    p.style && !ownName(p, own) ? text('style', p.style) : null,
    p.days !== null && p.days > 1 ? `${p.days} days` : null,
    text('people', p.people, { n: p.group_size }),
    p.kind === KEY.pass_kind.PACKAGE ? null : text('hotel', p.includes_hotel ? KEY.hotel.INCLUDED : KEY.hotel.NONE),
  ]
    .filter(Boolean)
    .join(' · ');

interface PassesView {
  m: Modal;
  title: HTMLElement;
  sub: HTMLElement;
  body: HTMLElement;
  note: HTMLElement;
  link: HTMLAnchorElement;
}
let view: PassesView | undefined;
function passesDialog(): PassesView {
  if (view) return view;
  const title = h('h2', { id: 'passes-title' }),
    sub = h('p', { class: 'sub' }),
    body = h('div', { class: 'peek-body' });
  const note = h('p', { class: 'muted small' }),
    link = h('a', { target: '_blank', rel: 'noopener' });
  const close = h(
    'button',
    { type: 'button', class: 'peek-close', 'aria-label': 'Close', onclick: () => void view?.m.shut() },
    '×',
  );
  const dlg = h(
    'dialog',
    { class: 'peek', 'aria-labelledby': 'passes-title' },
    h('div', { class: 'peek-head' }, h('div', {}, title, sub), close),
    body,
    h('div', { class: 'peek-foot' }, note, link),
  );
  const made = { m: modal(dlg), title, sub, body, note, link };
  view = made;
  return made;
}

// Opens over the page; each pass on sale with today's price, and the next change when one is listed.
export function openPasses(e: { id: number; title: string; url: string } & Priced, from?: Element | null): void {
  const v = passesDialog();
  v.title.textContent = `Passes for ${e.title}`;
  v.sub.textContent = dayRange(e.start_date, e.end_date);
  // prices read from the ticket page say when, since the page may have moved on since, and whether it shows
  // tickets not read yet
  const page = one(
    { page: str, reseller: opt(str), read_on: str, unread: num },
    'SELECT page, reseller, read_on, unread FROM ticket_pages WHERE event_id = ?',
    [e.id],
  );
  const from_ = page
    ? text(
        'pass_source',
        KEY.pass_source.TICKET_PAGE,
        { reseller: page.reseller, day: dayMonth(page.read_on) },
        page.reseller ? 'reseller' : undefined,
      )
    : text('pass_source', KEY.pass_source.DESCRIPTION);
  v.note.textContent = [from_, page?.unread ? `${text('ticket', KEY.ticket.UNREAD)}.` : null, 'Check before buying.']
    .filter(Boolean)
    .join(' ');
  v.link.href = page ? page.page : e.url;
  v.link.replaceChildren(
    page?.reseller ??
      text('pass_source', page ? KEY.pass_source.TICKET_PAGE : KEY.pass_source.DESCRIPTION, {}, 'link') ??
      '',
    away(),
  );
  const day = today();
  const rows = passesOf(e.id)
    .map((p): [Pass, TierNow] => [p, tierNow(p, e, day)])
    .filter(([, now]) => now.state !== KEY.tier_today.ENDED);
  v.body.replaceChildren(
    rows.length > 0
      ? h(
          'ul',
          { class: 'pass-rows' },
          rows.map(([p, now]) =>
            h(
              'li',
              {},
              h(
                'span',
                { class: 'pass-name' },
                passName(p, rows.filter(([other]) => passName(other) === passName(p)).length > 1),
              ),
              'tier' in now
                ? h(
                    'span',
                    { class: 'pass-now' },
                    say('tier_today', now.state, { price: h('strong', {}, money(now.tier.amount, now.tier.currency)) }),
                    now.tier.fee
                      ? h(
                          'span',
                          { class: 'muted' },
                          ' ',
                          text('fee', KEY.fee.INCLUDED, { fee: money(now.tier.fee, now.tier.currency) }),
                        )
                      : null,
                    now.next ? h('span', { class: 'muted' }, ` · ${thenNote(now.next)}`) : null,
                  )
                : h('span', { class: 'muted' }, text('tier_today', now.state)),
            ),
          ),
        )
      : h('p', { class: 'muted' }, text('tier_today', KEY.tier_today.ENDED, {}, 'all')),
  );
  v.body.scrollTop = 0;
  v.m.open(from);
}
