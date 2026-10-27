// What a festival's passes cost (event_passes and pass_tiers), on the day the page is viewed (pricing.js): what its
// card says of its price, and a quick view listing each pass at today's price and its next change. Every word of a
// state is pipeline/states.py's.
import { q } from './db.js';
import { h, away, dayMonth, dayRange } from './ui.js';
import { today } from './days.js';
import { money } from './money.js';
import { modal } from './modal.js';
import { tierNow, priceLine, nextChange } from './pricing.js';
import { KEY } from './states.js';
import { say, text } from './wording.js';

let byEvent;
function load() {
  if (byEvent) return;
  byEvent = {};
  for (const p of q('SELECT * FROM event_passes ORDER BY event_id, pass_no')) (byEvent[p.event_id] ||= []).push({ ...p, tiers: [] });
  for (const t of q('SELECT * FROM pass_tiers ORDER BY event_id, pass_no, tier_no')) byEvent[t.event_id][t.pass_no - 1].tiers.push(t);
}
const passesOf = eventId => { load(); return byEvent[eventId] || []; };

// what the card says of a festival's price today (pricing.js priceLine)
export const priceToday = e => priceLine(e, passesOf(e.id), today());

// a tier's price change, in the card's words ("price goes up 15 Dec") or the passes view's form of them, with its price
// ("then 120 € from 15 Dec")
const change = t => ({ day: t.lo && dayMonth(t.lo), price: money(t.amount, t.currency) });
export const riseNote = t => text('next_change', nextChange(t), change(t));
const thenNote = t => text('next_change', nextChange(t), change(t), 'then');

// ----- the quick view: each pass at today's price and its next change -----
// a day or other pass by its own name ("20.Nov Friday PARTY"); the others by kind, style, length and for whom, or by
// their own name when that alone would read the same as another pass's
const ownName = (p, own) => own || [KEY.pass_kind.DAY, KEY.pass_kind.OTHER].includes(p.kind);
const passName = (p, own = false) => [ownName(p, own) ? p.label || text('pass_kind', p.kind) : text('pass_kind', p.kind),
  p.style && !ownName(p, own) ? text('style', p.style) : null, p.days > 1 ? `${p.days} days` : null,
  text('people', p.people, { n: p.group_size }),
  p.kind !== KEY.pass_kind.PACKAGE ? text('hotel', p.includes_hotel ? KEY.hotel.INCLUDED : KEY.hotel.NONE) : null]
  .filter(Boolean).join(' · ');

let view;
function passesDialog() {
  if (view) return view;
  const title = h('h2', { id: 'passes-title' }), sub = h('p', { class: 'sub' }), body = h('div', { class: 'peek-body' });
  const note = h('p', { class: 'muted small' }), link = h('a', { target: '_blank', rel: 'noopener' });
  const close = h('button', { type: 'button', class: 'peek-close', 'aria-label': 'Close', onclick: () => view.m.shut() }, '×');
  const dlg = h('dialog', { class: 'peek', 'aria-labelledby': 'passes-title' },
    h('div', { class: 'peek-head' }, h('div', {}, title, sub), close), body,
    h('div', { class: 'peek-foot' }, note, link));
  view = { m: modal(dlg), title, sub, body, note, link };
  return view;
}

// Opens over the page; each pass on sale with today's price, and the next change when one is listed.
export function openPasses(e, from) {
  const v = passesDialog();
  v.title.textContent = `Passes for ${e.title}`;
  v.sub.textContent = dayRange(e.start_date, e.end_date);
  // prices read from the ticket page say when, since the page may have moved on since, and whether it shows
  // tickets not read yet
  const page = q('SELECT page, reseller, read_on, unread FROM ticket_pages WHERE event_id = ?', [e.id])[0];
  const source = page ? KEY.pass_source.TICKET_PAGE : KEY.pass_source.DESCRIPTION;
  v.note.textContent = [text('pass_source', source, page && { reseller: page.reseller, day: dayMonth(page.read_on) },
    page?.reseller ? 'reseller' : null), page?.unread ? `${text('ticket', KEY.ticket.UNREAD)}.` : null,
  'Check before buying.'].filter(Boolean).join(' ');
  v.link.href = page ? page.page : e.url;
  v.link.replaceChildren(page?.reseller || text('pass_source', source, {}, 'link'), away());
  const day = today();
  const rows = passesOf(e.id).map(p => [p, tierNow(p, e, day)]).filter(([, now]) => now.state !== KEY.tier_today.ENDED);
  v.body.replaceChildren(rows.length ? h('ul', { class: 'pass-rows' }, rows.map(([p, now]) => h('li', {},
    h('span', { class: 'pass-name' }, passName(p, rows.filter(([q]) => passName(q) === passName(p)).length > 1)),
    now.state === KEY.tier_today.SOLD_OUT ? h('span', { class: 'muted' }, text('tier_today', now.state))
      : h('span', { class: 'pass-now' }, say('tier_today', now.state, { price: h('strong', {}, money(now.tier.amount, now.tier.currency)) }),
        now.tier.fee ? h('span', { class: 'muted' }, ' ', text('fee', KEY.fee.INCLUDED, { fee: money(now.tier.fee, now.tier.currency) })) : null,
        now.next ? h('span', { class: 'muted' }, ` · ${thenNote(now.next)}`) : null))))
    : h('p', { class: 'muted' }, text('tier_today', KEY.tier_today.ENDED, {}, 'all')));
  v.body.scrollTop = 0;
  v.m.open(from);
}
