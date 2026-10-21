// The full event card: facts, fare for its weekend, genres, features and line-up.
import { q, one } from './db.js';
import { h, flag, range, where, airportNote, eventFacts, euro, ago, day, addDays, flightsUrl, chip,
         featureLabel, genreLabel, KIZ, EVENT_COLS, countryName } from './ui.js';

const ROLE_ORDER = ['teacher', 'dj', 'performer', 'mc', 'crew', 'media', 'organiser'];
const ROLE_LABEL = { teacher: 'Teachers', dj: 'DJs', performer: 'Performers', mc: 'MCs', crew: 'Crew',
  media: 'Media', organiser: 'Organisers' };

export function getEvent(id) {
  return one(`SELECT ${EVENT_COLS} FROM events e JOIN event_stats s ON s.event_id = e.id WHERE e.id = ?`, [id]);
}

export function fareBlock(e, home, depart = e.weekend_friday) {
  if (!e.airport) return h('div', { class: 'fare none' }, h('span', { class: 'muted' }, 'No covered airport within reach'));
  if (e.airport === home) return h('div', { class: 'fare' }, h('div', {}, h('span', { class: 'price' }, 'Home')), h('div', { class: 'muted small' }, 'No flight needed'));
  const f = one('SELECT price, return, fetched_at FROM fares WHERE airport = ? AND depart = ?', [e.airport, depart]);
  const ret = f ? f.return : addDays(depart, 3);
  const link = h('a', { href: flightsUrl(home, e.airport, depart, ret), target: '_blank', rel: 'noopener' }, 'Google Flights ↗');
  if (!f) {
    const m = one('SELECT min(price) AS p FROM fares WHERE airport = ? AND substr(depart,1,7) = substr(?,1,7)', [e.airport, depart]);
    return h('div', { class: 'fare none' },
      h('div', {}, h('span', { class: 'price muted' }, 'No fare'), ' for that weekend yet'),
      h('div', { class: 'muted small' }, m && m.p ? `Cheapest ${home}–${e.airport} that month: ${euro(m.p)}` : 'Google had no price for that month', ' · ', link));
  }
  const stale = (Date.now() - new Date(f.fetched_at)) / 864e5 > 10;
  return h('div', { class: 'fare' },
    h('div', {}, h('span', { class: 'price' }, euro(f.price)), ' return'),
    h('div', { class: 'muted small' }, `${home}→${e.airport} ${day(depart)} – ${day(ret)} · `,
      h('span', { class: stale ? 'stale' : '' }, `checked ${ago(f.fetched_at)}`), ' · ', link));
}

export function eventDetail(id, home, { onArtist, compact } = {}) {
  const e = getEvent(id);
  if (!e) return h('p', {}, 'Event not found.');
  const genres = (e.genres || '').split(',').filter(Boolean);
  const feats = (e.features || '').split(',').filter(Boolean);
  const rooms = one('SELECT party_rooms, class_rooms FROM event_rooms WHERE event_id = ?', [id]);
  const people = q(`SELECT a.id, a.display_name, a.kind, ea.role, st.bookings, st.popular, st.home_country
    FROM event_artists ea JOIN artists a ON a.id = ea.artist_id LEFT JOIN artist_stats st ON st.artist_id = a.id
    WHERE ea.event_id = ? ORDER BY st.bookings DESC, a.display_name`, [id]);
  const byRole = {};
  for (const p of people) (byRole[p.role] ||= []).push(p);

  return h('article', { class: 'event-detail' },
    compact ? null : [
      h('h3', {}, e.title),
      h('p', { class: 'when' }, range(e.start_date, e.end_date)),
      h('p', { class: 'muted' }, where(e), e.venue ? ` · ${e.venue}` : ''),
      eventFacts(e),
      h('div', { class: 'travel' }, h('div', { class: 'muted small' }, airportNote(e, home)), fareBlock(e, home))],
    compact && e.venue ? h('p', { class: 'muted small' }, 'Venue: ', e.venue) : null,
    genres.length ? h('div', { class: 'chips' }, genres.map(g => chip(genreLabel(g), KIZ.has(g) ? 'kiz' : ''))) : null,
    feats.length ? h('div', { class: 'chips' }, feats.map(f => chip(featureLabel(f), 'feature'))) : null,
    rooms && (rooms.party_rooms || rooms.class_rooms)
      ? h('p', { class: 'muted small' }, [rooms.party_rooms && `${rooms.party_rooms} party rooms`, rooms.class_rooms && `${rooms.class_rooms} class rooms`].filter(Boolean).join(' · '))
      : null,
    ROLE_ORDER.filter(r => byRole[r]).map(r => h('section', { class: 'lineup' },
      h('h4', {}, `${ROLE_LABEL[r]} (${byRole[r].length})`),
      h('ul', {}, byRole[r].map(p => h('li', {},
        h('a', { href: `#artist/${p.id}`, onclick: onArtist && (ev => { ev.preventDefault(); onArtist(p.id); }) },
          p.popular ? '★ ' : '', p.display_name),
        p.home_country ? h('span', { class: 'muted', title: countryName(p.home_country) }, ' ', flag(p.home_country)) : null,
        r !== 'organiser' && p.bookings > 1 ? h('span', { class: 'muted small' }, ` · ${p.bookings} bookings`) : null))))),
    people.length === 0 ? h('p', { class: 'muted small' }, 'No line-up announced in the listing.') : null,
    h('p', { class: 'links' },
      h('a', { href: e.url, target: '_blank', rel: 'noopener' }, 'Event page on kizomba-world ↗'),
      ' · ', h('a', { href: `#map/event/${e.id}` }, 'Show on map')));
}
