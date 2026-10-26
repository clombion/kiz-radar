// What a festival's passes cost (event_passes and pass_tiers, from the prices pass), worked out on the day the page
// is viewed: a card prices one pass at today's tier, and a quick view lists each pass at today's price and its next
// change.
//
// Today's tier: a tier applies from its valid_from (else the day after the tier before it ends) to its valid_until
// (else the day before the tier after it starts); door prices apply during the festival. Of the tiers that apply
// today and aren't sold out, the cheapest; when several undated tiers apply, the price reads "from". When none
// applies yet, the first one to come. The next change is the first later tier, not sold out, that costs more.
import { q } from './db.js';
import { h, dayMonth, dayRange, today, addDays } from './ui.js';
import { money } from './money.js';
import { modal } from './modal.js';

let byEvent;
function load() {
  if (byEvent) return;
  byEvent = {};
  for (const p of q('SELECT * FROM event_passes ORDER BY event_id, pass_no')) (byEvent[p.event_id] ||= []).push({ ...p, tiers: [] });
  for (const t of q('SELECT * FROM pass_tiers ORDER BY event_id, pass_no, tier_no')) byEvent[t.event_id][t.pass_no - 1].tiers.push(t);
}
const passesOf = eventId => { load(); return byEvent[eventId] || []; };

// each tier's first and last day (null: open), from its own dates or its neighbours'
function windows(pass, e) {
  const sold = pass.tiers.filter(t => !t.door);
  return pass.tiers.map(t => {
    if (t.door) return { ...t, lo: e.start_date, hi: e.end_date };
    const i = sold.indexOf(t), prev = sold[i - 1], next = sold[i + 1];
    return { ...t, lo: t.valid_from ?? (prev?.valid_until ? addDays(prev.valid_until, 1) : null),
      hi: t.valid_until ?? (next?.valid_from ? addDays(next.valid_from, -1) : null) };
  });
}
const cheapest = ts => ts.reduce((a, b) => (b.amount < a.amount ? b : a));

// A pass's price today: { tier, from (several undated tiers apply), next }, or { soldOut }, or null when every dated
// tier has ended and there is no door price.
function tierNow(pass, e) {
  const ts = windows(pass, e), day = today();
  const open = ts.filter(t => !t.sold_out);
  if (!open.length) return { soldOut: true };
  const now = open.filter(t => (t.lo == null || t.lo <= day) && (t.hi == null || day <= t.hi) && (!t.door || day >= e.start_date));
  const later = open.filter(t => t.lo != null && t.lo > day).sort((a, b) => a.lo.localeCompare(b.lo));
  const tier = now.length ? cheapest(now) : later[0];
  if (!tier) return null;
  const next = ts.slice(ts.indexOf(tier) + 1).find(t => !t.sold_out && t.amount > tier.amount && (t.lo == null || t.lo > day));
  return { tier, from: now.filter(t => t.lo == null && t.hi == null).length > 1, next };
}

// The pass a card prices (a full pass that doesn't say for how many is for one): the per-person full pass (the longest
// when sold in several lengths, the Kizomba one when a festival sells one per dance), else the cheapest per-person
// package with a hotel; with its price today. Null when the festival gives no price or it is over.
export function priceNow(e) {
  if (!e.upcoming) return null;
  const ps = passesOf(e.id).filter(p => p.group_size === 1 || (p.group_size == null && p.kind === 'full'));
  const kiz = p => /kiz|semba|tarraxo/i.test(p.label || '');     // "Kizomba Full Pass" over "Bachata Full Pass"
  const full = ps.filter(p => p.kind === 'full' && !p.includes_hotel).sort((a, b) => (b.days ?? 99) - (a.days ?? 99) || kiz(b) - kiz(a));
  const pass = full[0] || ps.filter(p => p.kind === 'package').sort((a, b) => cheapest(a.tiers).amount - cheapest(b.tiers).amount)[0];
  const now = pass && tierNow(pass, e);
  return now && { pass, hotel: pass.kind === 'package' || !!pass.includes_hotel, ...now };
}

// when a price changes: "from 15 Dec", "at the door", "later"
const changeWhen = t => t.door ? 'at the door' : t.lo ? `from ${dayMonth(t.lo)}` : 'later';
// the card's note of it: "price goes up 15 Dec", "price is higher at the door"
export const riseNote = t => t.door ? 'price is higher at the door' : t.lo ? `price goes up ${dayMonth(t.lo)}` : 'price goes up later';

// ----- the quick view: each pass at today's price and its next change -----
const KIND = { full: 'Full pass', party: 'Party pass', day: 'Day pass', workshop: 'Workshop pass', package: 'Package', other: 'Pass' };
const forWhom = p => p.group_size == null || p.group_size === 1 ? null : p.group_size === 2 ? 'for a couple' : `for ${p.group_size}`;
// a day or other pass by its own name ("20.Nov Friday PARTY"); the others by kind, length and for whom, or by their own
// name when that alone would read the same as another pass's ("Single KIZOMBA Fullpass", "Bachata Fullpass")
const passName = (p, own = false) => [own || ['day', 'other'].includes(p.kind) ? p.label || KIND[p.kind] : KIND[p.kind],
  p.days > 1 ? `${p.days} days` : null, forWhom(p),
  p.includes_hotel && p.kind !== 'package' ? 'with hotel' : null].filter(Boolean).join(' · ');

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
  v.note.textContent = page ? `Prices from ${page.reseller ? `${page.reseller}, a reseller selling at its own prices,`
      : 'the festival’s ticket page,'} as of ${dayMonth(page.read_on)}`
      + (page.unread ? `; the page has ${page.unread === 1 ? 'a new ticket' : 'new tickets'}, not read yet` : '')
      + '; check before buying.'
    : 'Prices as the festival lists them; check before buying.';
  v.link.href = page ? page.page : e.url;
  v.link.textContent = page ? (page.reseller ? `${page.reseller} ↗` : 'The ticket page ↗') : 'The festival on kizomba-world ↗';
  const rows = passesOf(e.id).map(p => [p, tierNow(p, e)]).filter(([, now]) => now);
  v.body.replaceChildren(rows.length ? h('ul', { class: 'pass-rows' }, rows.map(([p, now]) => h('li', {},
    h('span', { class: 'pass-name' }, passName(p, rows.filter(([q]) => passName(q) === passName(p)).length > 1)),
    now.soldOut ? h('span', { class: 'muted' }, 'sold out')
      : h('span', { class: 'pass-now' }, now.from ? 'from ' : null, h('strong', {}, money(now.tier.amount, now.tier.currency)),
        now.tier.fee ? h('span', { class: 'muted' }, ` incl. ${money(now.tier.fee, now.tier.currency)} fee`) : null,
        now.next ? h('span', { class: 'muted' }, ` · then ${money(now.next.amount, now.next.currency)} ${changeWhen(now.next)}`) : null))))
    : h('p', { class: 'muted' }, 'No passes on sale any more.'));
  v.body.scrollTop = 0;
  v.m.open(from);
}
