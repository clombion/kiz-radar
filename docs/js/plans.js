// Who said they're going to a festival (pipeline/people.csv and plans.csv). Cards name featured people and count
// the rest; partners who are both going are named as their couple. Someone in a festival's line-up, alone or in a
// couple, is teaching (or playing) there rather than just going.
import { q, one } from './db.js';
import { h } from './ui.js';
import { personHref, artistHref } from './routes.js';

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
  return { n: at.length, many: people.length > 1, faces: faces(people), names: h('b', {}, and(named(people).map(g => g.name))) };
}
// who's going to one festival, inline: each person or couple linked, with what they're doing there
export const goersInline = goers => and(named(goers).map(g => { const d = doing(g.people);
  return h('span', { class: 'goer' }, h('a', { href: g.href, class: 'artist' }, g.name), ' ', h('span', { class: 'plan-tag' + (d === 'going' ? '' : ' booked') }, d)); }));

// goers as the names to show: a couple when both partners go, otherwise each person
function named(goers) {
  load();
  const left = new Map(goers.map(g => [g.person_id, g])), out = [];
  for (const c of couples) if (c.people.every(p => left.has(p))) {
    out.push({ name: c.name, href: artistHref(c.artist), people: c.people.map(p => left.get(p)) });
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

// "Cédric & Christina are going · 3 more people too", or "3 people said they're going"; null when nobody has said
export function goingLine(e, onclick) {
  if (!e.goers.length) return null;
  const featured = e.goers.filter(g => g.featured), others = e.goers.length - featured.length;
  const groups = named(featured), many = featured.length > 1;
  return h('button', { type: 'button', class: 'going-line', onclick }, faces(featured),
    h('span', {}, groups.length ? [h('b', {}, and(groups.map(g => g.name))), ` ${many ? 'are' : 'is'} ${doing(featured)}`] : null,
      others ? (groups.length ? ` · ${others} more ${others === 1 ? 'person' : 'people'} too` : `${count(others)} said they’re going`) : null));
}

// the list behind it, in an opened card: featured people first, each with what they're doing there
export function whoIsGoing(e) {
  if (!e.goers.length) return null;
  const groups = [...named(e.goers.filter(g => g.featured)), ...named(e.goers.filter(g => !g.featured))];
  return h('section', { class: 'roster who', id: `who-${e.id}` }, h('h4', {}, 'Who’s going', h('span', { class: 'n' }, e.goers.length)),
    h('ul', {}, groups.map(g => { const d = doing(g.people);
      return h('li', {}, faces(g.people), h('a', { href: g.href, class: 'artist' }, g.name), ' ', h('span', { class: 'plan-tag' + (d === 'going' ? '' : ' booked') }, d)); })));
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

