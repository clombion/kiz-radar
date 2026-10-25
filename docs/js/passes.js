// What a festival's passes cost (event_passes and pass_tiers, from the prices pass), worked out on the day the page
// is viewed: a card shows the per-person full pass at today's tier and the next rise; an opened card lists every
// pass and tier.
//
// Today's tier: a tier applies from its valid_from (else the day after the tier before it ends) to its valid_until
// (else the day before the tier after it starts); door prices apply during the festival. Of the tiers that apply
// today and aren't sold out, the cheapest; when several undated tiers apply, the price reads "from". When none
// applies yet, the first one to come. The next rise is the first later tier, not sold out, that costs more.
import { q } from './db.js';
import { h, dayMonth, today, addDays } from './ui.js';
import { money, moneyEl } from './money.js';

let byEvent, notes;
function load() {
  if (byEvent) return;
  byEvent = {};
  for (const p of q('SELECT * FROM event_passes ORDER BY event_id, pass_no')) (byEvent[p.event_id] ||= []).push({ ...p, tiers: [] });
  for (const t of q('SELECT * FROM pass_tiers ORDER BY event_id, pass_no, tier_no')) byEvent[t.event_id][t.pass_no - 1].tiers.push(t);
  notes = Object.fromEntries(q('SELECT event_id, notes FROM event_price_notes').map(r => [r.event_id, r.notes]));
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

// A pass's price today: { tier, from (several undated tiers apply), starts (it isn't on sale yet), next }, or
// { soldOut }, or null when every dated tier has ended and there is no door price.
function tierNow(pass, e) {
  const ts = windows(pass, e), day = today();
  const open = ts.filter(t => !t.sold_out);
  if (!open.length) return { soldOut: true };
  const now = open.filter(t => (t.lo == null || t.lo <= day) && (t.hi == null || day <= t.hi) && (!t.door || day >= e.start_date));
  const later = open.filter(t => t.lo != null && t.lo > day).sort((a, b) => a.lo.localeCompare(b.lo));
  const tier = now.length ? cheapest(now) : later[0];
  if (!tier) return null;
  const next = ts.slice(ts.indexOf(tier) + 1).find(t => !t.sold_out && t.amount > tier.amount && (t.lo == null || t.lo > day));
  return { tier, from: now.filter(t => t.lo == null && t.hi == null).length > 1, starts: !now.length, next };
}

// The pass a card prices (a full pass that doesn't say for how many is for one): the per-person full pass (the longest
// when sold in several lengths, the Kizomba one when a festival sells one per dance), else the cheapest
// per-person package with a hotel; with its price today.
function priceNow(e) {
  const ps = passesOf(e.id).filter(p => p.group_size === 1 || (p.group_size == null && p.kind === 'full'));
  const kiz = p => /kiz|semba|tarraxo/i.test(p.label || '');     // "Kizomba Full Pass" over "Bachata Full Pass"
  const full = ps.filter(p => p.kind === 'full' && !p.includes_hotel).sort((a, b) => (b.days ?? 99) - (a.days ?? 99) || kiz(b) - kiz(a));
  const pass = full[0] || ps.filter(p => p.kind === 'package').sort((a, b) => cheapest(a.tiers).amount - cheapest(b.tiers).amount)[0];
  const now = pass && tierNow(pass, e);
  return now && { pass, ...now };
}

const passName = p => p.kind === 'package' ? 'Package with hotel' : 'Full pass';
const when = t => t.door ? 'at the door' : t.lo ? `from ${dayMonth(t.lo)}` : 'later';

// "🎟 Full pass ~1 850 kr · ~1 960 kr from 15 Aug", for a card; null when the festival gives no price
export function passLine(e) {
  if (!e.upcoming) return null;
  const p = priceNow(e);
  if (!p) return null;
  if (p.soldOut) return h('p', { class: 'pass-price muted' }, `🎟 ${passName(p.pass)}: sold out`);
  return h('p', { class: 'pass-price' }, `🎟 ${passName(p.pass)} `, p.from ? 'from ' : null, h('strong', {}, moneyEl(p.tier.amount, p.tier.currency)),
    p.starts ? ` ${when(p.tier)}` : null,
    p.next ? h('span', { class: 'next-rise' }, ' · ', moneyEl(p.next.amount, p.next.currency), ' ', when(p.next)) : null);
}

const KIND = { full: 'Full pass', party: 'Party pass', day: 'Day pass', workshop: 'Workshop pass', package: 'Package', other: 'Pass' };
const forWhom = p => p.group_size == null ? null : p.group_size === 1 ? null : p.group_size === 2 ? 'for a couple' : `for ${p.group_size}`;
function span(t) {
  if (t.door) return 'at the door';
  if (t.valid_from && t.valid_until) return `${dayMonth(t.valid_from)} – ${dayMonth(t.valid_until)}`;
  if (t.valid_until) return `until ${dayMonth(t.valid_until)}`;
  if (t.valid_from) return t.current ? `as of ${dayMonth(t.valid_from)}` : `from ${dayMonth(t.valid_from)}`;
  return null;
}

// every pass and its tiers, one per line, for an opened card: today's tier stands out, ended and sold-out ones are
// struck through; null when the festival gives no price
export function passList(e) {
  const ps = passesOf(e.id);
  if (!ps.length) return null;
  const day = today();
  const tierRow = (t, now) => {
    const gone = t.sold_out || (t.hi && t.hi < day);
    return h('li', { class: gone ? 'gone' : e.upcoming && t.tier_no === now?.tier?.tier_no ? 'now' : null },
      h('span', { class: 'amt' }, moneyEl(t.amount, t.currency)),
      h('span', { class: 'tier-dates' }, [span(t), t.quantity ? `${t.quantity} tickets` : null, t.sold_out ? 'sold out' : null].filter(Boolean).join(' · ')));
  };
  return h('section', { class: 'passes' }, h('h4', {}, 'Passes'),
    ps.map(p => [p, tierNow(p, e)]).map(([p, now]) => h('div', { class: 'pass' },
      h('p', { class: 'pass-name' }, [p.label && p.kind === 'other' ? p.label : KIND[p.kind], p.days ? `${p.days} days` : null,
        forWhom(p), p.includes_hotel && p.kind !== 'package' ? 'with hotel' : null].filter(Boolean).join(' · ')),
      h('ul', { class: 'tiers' }, windows(p, e).map(t => tierRow(t, now))))),
    notes[e.id] ? h('p', { class: 'muted' }, notes[e.id]) : null,
    h('p', { class: 'muted small' }, 'Prices as the festival lists them; check its page before buying.'));
}
