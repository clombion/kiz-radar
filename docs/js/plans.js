// Who said they're going to a festival (pipeline/people.csv and plans.csv). Cards name featured people and count
// the rest; partners who are both going are named as their couple. Someone in a festival's line-up, alone or in a
// couple, is teaching (or playing) there rather than just going.
import { q, one } from './db.js';
import { h, flag, countryName, dayRange } from './ui.js';
import { personHref, artistHref, eventOnMapHref } from './routes.js';
import { modal } from './modal.js';

let byEvent, couples;
function load() {
  if (byEvent) return;
  byEvent = {};
  for (const r of q('SELECT person_id, key, name, featured, event_id, booked_as FROM plan_rows ORDER BY featured DESC, name'))
    (byEvent[r.event_id] ||= []).push(r);
  // couples whose partners are all people here
  couples = q(`SELECT a.id, a.display_name, group_concat(pa.person_id) AS people, count(*) AS n,
      (SELECT count(*) FROM couple_members WHERE couple_id = a.id) AS members
    FROM couple_members cm JOIN artists a ON a.id = cm.couple_id JOIN person_artists pa ON pa.artist_id = cm.member_id GROUP BY a.id`)
    .filter(c => c.n === c.members).map(c => ({ artist: c.id, name: c.display_name, people: c.people.split(',').map(Number) }));
}

export const goersOf = eventId => { load(); return byEvent[eventId] || []; };

// the featured people going to any of these festivals: "Cédric & Christina" and to how many; null when none is
export function friendsIn(rows) {
  const at = rows.filter(e => e.goers.some(g => g.featured));
  if (!at.length) return null;
  const people = [...new Map(at.flatMap(e => e.goers.filter(g => g.featured)).map(g => [g.person_id, g])).values()];
  return { n: at.length, many: people.length > 1, faces: faces(people), names: h('b', {}, and(named(people).map(nameButton))) };
}
// who's going to one festival, inline: each person or couple linked, with what they're doing there
export const goersInline = goers => and(named(goers).map(g => h('span', { class: 'goer' }, h('a', { href: g.href, class: 'artist' }, g.name), ' ', tagOf(doing(g.people)))));

// goers as the names to show: a couple when both partners go, otherwise each person
function named(goers) {
  load();
  const left = new Map(goers.map(g => [g.person_id, g])), out = [];
  for (const c of couples) if (c.people.every(p => left.has(p))) {
    out.push({ name: c.name, href: artistHref(c.artist), artist: c.artist, people: c.people.map(p => left.get(p)) });
    for (const p of c.people) left.delete(p);
  }
  for (const g of left.values()) out.push({ name: g.name, href: personHref(g.key), people: [g] });
  return out;
}

const AS = { teacher: 'teaching', dj: 'playing', performer: 'performing', mc: 'hosting' };
const doing = people => people.every(p => p.booked_as) ? AS[people[0].booked_as] : 'going';
const faces = people => h('span', { class: 'faces', 'aria-hidden': 'true' }, people.map(p => h('span', { class: 'face' }, p.name[0])));
const and = xs => xs.flatMap((x, i) => [i ? (i === xs.length - 1 ? ' and ' : ', ') : '', x]);
const count = n => `${n} ${n === 1 ? 'person' : 'people'}`;

// A name in a card or under the sentence opens the quick view of that person or couple; "3 more people" opens the
// list of everyone going. Neither leaves the page.
const nameButton = g => h('button', { type: 'button', class: 'goer-name', onclick: ev => { ev.stopPropagation(); peekGroup(g, ev.currentTarget); } }, g.name);
const tagOf = d => h('span', { class: 'plan-tag' + (d === 'going' ? '' : ' booked') }, d);

// "Cédric & Christina are going · 3 more people too", or "3 people said they're going"; null when nobody has said
export function goingLine(e) {
  if (!e.goers.length) return null;
  const featured = e.goers.filter(g => g.featured), others = e.goers.length - featured.length;
  const groups = named(featured), many = featured.length > 1;
  const more = text => h('button', { type: 'button', class: 'goer-name', onclick: ev => { ev.stopPropagation(); peekEvent(e, ev.currentTarget); } }, text);
  return h('p', { class: 'going-line' }, faces(featured),
    h('span', {}, groups.length ? [h('b', {}, and(groups.map(nameButton))), ` ${many ? 'are' : 'is'} ${doing(featured)}`] : null,
      others ? (groups.length ? [' · ', more(`${others} more ${others === 1 ? 'person' : 'people'}`), ' too'] : [more(count(others)), ' said they’re going']) : null));
}

// the list in an opened card: featured people first, each with what they're doing there
export function whoIsGoing(e) {
  if (!e.goers.length) return null;
  return h('section', { class: 'roster who' }, h('h4', {}, 'Who’s going', h('span', { class: 'n' }, e.goers.length)),
    h('ul', {}, everyone(e).map(g => h('li', {}, faces(g.people), nameButton(g), ' ', tagOf(doing(g.people))))));
}
const everyone = e => [...named(e.goers.filter(g => g.featured)), ...named(e.goers.filter(g => !g.featured))];

// ----- the quick view: a person or couple's plans, or everyone going to a festival, over the page -----
let view;
function peekDialog() {
  if (view) return view;
  const title = h('h2', { id: 'peek-title' }), sub = h('p', { class: 'sub' }), lead = h('span', { class: 'peek-faces' });
  const body = h('div', { class: 'peek-body' }), foot = h('div', { class: 'peek-foot' });
  const close = h('button', { type: 'button', class: 'peek-close', 'aria-label': 'Close', onclick: () => view.m.shut() }, '×');
  const dlg = h('dialog', { class: 'peek', 'aria-labelledby': 'peek-title' },
    h('div', { class: 'peek-head' }, lead, h('div', {}, title, sub), close), body, foot);
  view = { m: modal(dlg), title, sub, lead, body, foot };
  return view;
}
function show(from, { faces: f, title, sub, body, foot }) {
  const v = peekDialog();
  v.lead.replaceChildren(f || ''); v.title.textContent = title; v.sub.replaceChildren(...[sub].flat(Infinity).filter(Boolean));
  v.body.replaceChildren(...body); v.foot.replaceChildren(...[foot].filter(Boolean));
  v.body.scrollTop = 0;
  if (from) v.m.open(from);
}
const link = (href, ...kids) => h('a', { href, onclick: ev => { ev.preventDefault(); view.m.go(href); } }, ...kids);

// Where a person or a couple is going: what they're doing there, and which of them when only one goes.
function peekGroup(g, from, back) {
  const ids = g.people.map(p => p.person_id);
  const rows = q(`SELECT pr.person_id, pr.name, pr.booked_as, e.id, e.title, e.city, e.country_code, e.start_date, e.end_date
    FROM plan_rows pr JOIN event_rows e ON e.id = pr.event_id WHERE pr.person_id IN (${ids.map(() => '?').join(',')}) AND e.upcoming
    ORDER BY e.start_date`, ids);
  const byEvent = new Map();
  for (const r of rows) (byEvent.get(r.id) || byEvent.set(r.id, { e: r, people: [] }).get(r.id)).people.push(r);
  // a line about them, from their artist record when they have one
  const artistId = g.artist || person(g.people[0].key)?.artists[0]?.id;
  const a = artistId && one('SELECT st.teacher, st.dj, st.home_country, a.kind FROM artist_stats st JOIN artists a ON a.id = st.artist_id WHERE a.id = ?', [artistId]);
  const role = a && (a.teacher && a.dj ? 'Teacher & DJ' : a.dj ? 'DJ' : a.teacher ? 'Teacher' : 'Performer') + (g.people.length > 1 ? 's' : '');
  const sub = a ? [role, a.home_country ? [' from ', flag(a.home_country), ' ', countryName(a.home_country)] : null] : 'Shares their festival plans';
  show(from, { faces: faces(g.people), title: g.name, sub,
    body: [back || null, h('h3', {}, `Coming up · ${byEvent.size}`),
      byEvent.size ? h('ul', { class: 'peek-plans' }, [...byEvent.values()].map(({ e, people }) => h('li', {},
        h('span', { class: 'when' }, dayRange(e.start_date, e.end_date)),
        h('span', { class: 'what' }, link(eventOnMapHref(e.id), e.title),
          h('span', { class: 'muted' }, ' · ', flag(e.country_code), ' ', e.city, people.length < g.people.length ? ` · ${people.map(p => p.name).join(', ')}` : '')),
        tagOf(doing(people)))))
        : h('p', { class: 'muted' }, 'No festival plans coming up.')].filter(Boolean),
    foot: link(g.href, 'See their page →') });
}

// Everyone going to one festival; a name opens their own quick view, with a way back to this list.
function peekEvent(e, from) {
  const groups = everyone(e);
  const backTo = () => h('button', { type: 'button', class: 'link back-link', onclick: () => peekEvent(e) }, '← Everyone going to ', e.title);
  show(from, { title: `Who’s going to ${e.title}`, sub: [dayRange(e.start_date, e.end_date), ' · ', flag(e.country_code), ' ', e.city],
    body: [h('ul', { class: 'peek-people' }, groups.map(g => h('li', {}, faces(g.people),
      h('button', { type: 'button', class: 'goer-name', onclick: () => peekGroup(g, null, backTo()) }, g.name), ' ', tagOf(doing(g.people)))))] });
}

// A person, and the artist records they are, directly or as half of a couple: those with bookings of their own,
// since a partner's record alone only repeats the couple's.
export function person(key) {
  const p = one('SELECT * FROM people WHERE key = ?', [key]);
  if (!p) return null;
  return { ...p, artists: q(`SELECT a.id, a.display_name FROM artists a JOIN artist_stats st ON st.artist_id = a.id WHERE a.id IN (
      SELECT artist_id FROM person_artists WHERE person_id = ?
      UNION SELECT cm.couple_id FROM person_artists pa JOIN couple_members cm ON cm.member_id = pa.artist_id WHERE pa.person_id = ?)
    ORDER BY st.bookings DESC`, [p.id, p.id]) };
}
// The festivals still to come that some of these people said they're going to, where they aren't in the line-up.
export const alsoGoingTo = personIds => personIds.length ? q(`SELECT DISTINCT event_id FROM plan_rows JOIN event_rows e ON e.id = event_id
  WHERE person_id IN (${personIds.map(() => '?').join(',')}) AND booked_as IS NULL AND e.upcoming`, personIds).map(r => r.event_id) : [];
// The people who are this artist, or a partner in this couple.
export const peopleOf = artistId => q(`SELECT DISTINCT pe.id, pe.key, pe.name FROM person_artists pa JOIN people pe ON pe.id = pa.person_id
  WHERE pa.artist_id = ? OR pa.artist_id IN (SELECT member_id FROM couple_members WHERE couple_id = ?) ORDER BY pe.name`, [artistId, artistId]);

