// Explore → Map: one bubble per city (size = events, colour = chosen metric) beside a list of what is in view.
import { q } from './db.js';
import { h, range, where, eventFacts, euro, today, countryName, flag, EVENT_COLS } from './ui.js';
import { eventDetail } from './event.js';

const WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
let worldGeo;            // cached across visits to the tab
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const COLOR_BY = {
  fare: { label: 'Cheapest fare', bands: [
    ['≤ €150', c => c.minFare != null && c.minFare <= 150, '--good'],
    ['€150–250', c => c.minFare != null && c.minFare <= 250, '--mid'],
    ['> €250', c => c.minFare != null, '--bad'],
    ['No fare', () => true, '--none']] },
  kiz: { label: 'Kiz-only share', bands: [
    ['All kiz-only', c => c.kizOnly === c.n, '--good'],
    ['Some', c => c.kizOnly > 0, '--mid'],
    ['None', () => true, '--none']] },
  popular: { label: 'Popular artists booked', bands: [
    ['10+', c => c.popular >= 10, '--good'],
    ['1–9', c => c.popular > 0, '--mid'],
    ['None', () => true, '--none']] },
};

export function mapView(root, sub, qs, { home }) {
  const params = new URLSearchParams(qs);
  const state = { when: params.get('when') || 'upcoming', kizOnly: params.get('kiz') === '1', text: '',
    colorBy: params.get('color') || 'fare', country: params.get('country') || '', city: null, event: null };
  if (sub && sub[0] === 'event') state.event = Number(sub[1]);

  const events = q(`SELECT ${EVENT_COLS}, CASE WHEN e.airport = ? THEN 0 ELSE f.price END AS fare FROM events e JOIN event_stats s ON s.event_id = e.id
    LEFT JOIN fares f ON f.airport = e.airport AND f.depart = e.weekend_friday WHERE e.lat IS NOT NULL
    ORDER BY e.start_date`, [home]);
  const byId = new Map(events.map(e => [e.id, e]));
  if (state.event && byId.has(state.event)) {
    const e = byId.get(state.event);
    state.city = cityKey(e);
    if (state.when === 'upcoming' && e.weekend_friday < today()) state.when = 'all';
  }

  // ----- layout -----
  const search = h('input', { type: 'search', placeholder: 'Search title or city', 'aria-label': 'Search events' });
  const whenSel = h('select', { 'aria-label': 'Time' }, [['upcoming', 'Upcoming'], ['all', 'All dates'], ['past', 'Past']]
    .map(([v, t]) => h('option', { value: v, selected: state.when === v }, t)));
  const kizBox = h('input', { type: 'checkbox', checked: state.kizOnly });
  const colorSel = h('select', { 'aria-label': 'Colour bubbles by' }, Object.entries(COLOR_BY)
    .map(([v, c]) => h('option', { value: v, selected: state.colorBy === v }, c.label)));
  const legend = h('div', { class: 'legend' });
  const mapEl = h('div', { class: 'map', role: 'application', 'aria-label': 'Map of events by city' });
  const panel = h('aside', { class: 'panel', 'aria-live': 'polite' });
  const fill = (...kids) => panel.replaceChildren(...kids.filter(k => k != null && k !== false));
  root.replaceChildren(h('section', { class: 'mapview' },
    h('div', { class: 'toolbar' }, search, whenSel, h('label', {}, kizBox, ' Kiz only'),
      h('label', {}, 'Colour: ', colorSel), legend),
    h('div', { class: 'split' }, mapEl, panel)));

  // ----- map -----
  // Panning and zooming out stop at the box around every event (all dates), plus a small margin.
  const padded = L.latLngBounds(events.map(e => [e.lat, e.lon])).pad(0.05);
  const dataBounds = L.latLngBounds(       // no further than the edges of the outline map
    [Math.max(padded.getSouth(), -85), Math.max(padded.getWest(), -180)],
    [Math.min(padded.getNorth(), 85), Math.min(padded.getEast(), 180)]);
  const map = L.map(mapEl, { zoomControl: true, attributionControl: true, worldCopyJump: false,
    maxBounds: dataBounds, maxBoundsViscosity: 1, inertia: false });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Borders: Natural Earth · Places: © OpenStreetMap');
  const lockZoom = () => {
    map.setMinZoom(map.getBoundsZoom(dataBounds, true));     // the view always stays inside the box
    if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom());
    map.panInsideBounds(dataBounds, { animate: false });
  };
  map.setView([50, 10], 4);
  lockZoom();
  map.on('resize', lockZoom);
  map.createPane('land').style.zIndex = 350;      // under the bubbles in the overlay pane (400)
  const land = L.layerGroup().addTo(map);
  const bubbles = L.layerGroup().addTo(map);
  drawWorld(land);

  let cities = [], markers = new Map();
  function visible() {
    const t = state.text.toLowerCase(), now = today();
    return events.filter(e =>
      (state.when === 'all' || (state.when === 'upcoming' ? e.weekend_friday >= now : e.weekend_friday < now)) &&
      (!state.kizOnly || e.kiz_only) && (!state.country || e.country_code === state.country) &&
      (!t || e.title.toLowerCase().includes(t) || (e.city || '').toLowerCase().includes(t)));
  }
  function cityKey(e) { return `${e.city}|${e.country_code}`; }

  function redraw({ fit } = {}) {
    const groups = new Map();
    for (const e of visible()) {
      const k = cityKey(e);
      if (!groups.has(k)) groups.set(k, { key: k, city: e.city, cc: e.country_code, lat: e.lat, lon: e.lon, events: [] });
      groups.get(k).events.push(e);
    }
    cities = [...groups.values()].map(c => ({ ...c, n: c.events.length,
      kizOnly: c.events.filter(e => e.kiz_only).length,
      popular: c.events.reduce((s, e) => s + (e.popular_artists || 0), 0),
      minFare: c.events.some(e => e.fare != null) ? Math.min(...c.events.filter(e => e.fare != null).map(e => e.fare)) : null }));
    bubbles.clearLayers(); markers = new Map();
    const scheme = COLOR_BY[state.colorBy];
    // big cities first so small bubbles stay clickable on top
    for (const c of cities.sort((a, b) => b.n - a.n)) {
      const band = scheme.bands.find(b => b[1](c));
      const m = L.circleMarker([c.lat, c.lon], { radius: 4 + 3.2 * Math.sqrt(c.n), weight: 1.5,
        color: css('--bubble-stroke'), fillColor: css(band[2]), fillOpacity: 0.85, bubblingMouseEvents: false })
        .bindTooltip(`${c.city || countryName(c.cc)} · ${c.n} event${c.n > 1 ? 's' : ''}` +
          (c.minFare != null ? ` · from ${euro(c.minFare)}` : ''), { direction: 'top', offset: [0, -6] })
        .on('click', () => selectCity(c.key));
      m.addTo(bubbles); markers.set(c.key, m);
    }
    legend.replaceChildren(...scheme.bands.map(b => h('span', {}, h('i', { style: `background:${css(b[2])}` }), b[0])));
    highlight();
    if (fit && cities.length) map.fitBounds(L.latLngBounds(cities.map(c => [c.lat, c.lon])).pad(0.2), { maxZoom: 7 });
    renderPanel();
  }

  function highlight(hoverKey) {
    for (const [k, m] of markers) {
      const on = k === state.city || k === hoverKey;
      m.setStyle({ weight: on ? 4 : 1.5, color: on ? css('--accent') : css('--bubble-stroke') });
      if (on) m.bringToFront();
    }
  }

  function selectCity(key) {
    state.city = key; state.event = null;
    history.replaceState(null, '', '#map' + query());
    highlight(); renderPanel();
  }
  function openEvent(id) {
    const e = byId.get(id); if (!e) return;
    state.event = id; state.city = cityKey(e);
    history.replaceState(null, '', `#map/event/${id}` + query());
    const m = markers.get(state.city);
    if (m && !map.getBounds().contains(m.getLatLng())) map.panTo(m.getLatLng());
    highlight(); renderPanel();
    panel.scrollTop = 0;
  }
  function query() {
    const p = new URLSearchParams();
    if (state.when !== 'upcoming') p.set('when', state.when);
    if (state.kizOnly) p.set('kiz', '1');
    if (state.colorBy !== 'fare') p.set('color', state.colorBy);
    if (state.country) p.set('country', state.country);
    const s = p.toString(); return s ? '?' + s : '';
  }

  function row(e) {
    const b = h('button', { class: 'row', onclick: () => openEvent(e.id),
      onmouseenter: () => highlight(cityKey(e)), onmouseleave: () => highlight(),
      onfocus: () => highlight(cityKey(e)), onblur: () => highlight() },
      h('span', { class: 'when' }, range(e.start_date, e.end_date)),
      h('strong', {}, e.title),
      h('span', { class: 'muted' }, where(e), e.fare != null ? ` · ${euro(e.fare)}` : ''),
      eventFacts(e));
    return h('li', {}, b);
  }

  function renderPanel() {
    if (state.event) {
      const back = h('button', { class: 'link', onclick: () => { state.event = null; history.replaceState(null, '', '#map' + query()); renderPanel(); } },
        '← ' + (state.city ? 'Back to ' + (byId.get(state.event)?.city || 'list') : 'Back'));
      fill(back, eventDetail(state.event, home));
      back.focus({ preventScroll: true });
      return;
    }
    if (state.city) {
      const c = cities.find(c => c.key === state.city);
      if (c) {
        fill(
          h('button', { class: 'link', onclick: () => { state.city = null; highlight(); renderPanel(); } }, '← All events in view'),
          h('h3', {}, flag(c.cc), ' ', c.city || countryName(c.cc)),
          h('p', { class: 'muted' }, `${c.n} event${c.n > 1 ? 's' : ''}`,
            c.minFare != null ? ` · fares from ${euro(c.minFare)}` : '', c.popular ? ` · ${c.popular} popular-artist bookings` : ''),
          h('ul', { class: 'rows' }, c.events.map(row)));
        return;
      }
      state.city = null;
    }
    const b = map.getBounds();
    const inView = cities.filter(c => b.contains([c.lat, c.lon])).flatMap(c => c.events)
      .sort((a, z) => a.start_date.localeCompare(z.start_date));
    const total = cities.reduce((s, c) => s + c.n, 0);
    fill(
      h('h3', {}, `${inView.length} event${inView.length === 1 ? '' : 's'} in view`),
      h('p', { class: 'muted small' }, inView.length < total ? `${total} match the filters · pan or zoom to change the list · click a city to narrow it` : 'Click a city to narrow the list'),
      inView.length ? h('ul', { class: 'rows' }, inView.slice(0, 200).map(row)) : h('p', {}, 'No events here with these filters.'),
      inView.length > 200 ? h('p', { class: 'muted small' }, 'Showing the first 200 — zoom in to see the rest.') : null);
  }

  let t;
  map.on('moveend', () => { clearTimeout(t); t = setTimeout(() => { if (!state.city && !state.event) renderPanel(); }, 120); });
  map.on('click', () => { if (state.city || state.event) { state.city = state.event = null; history.replaceState(null, '', '#map' + query()); highlight(); renderPanel(); } });
  search.addEventListener('input', () => { state.text = search.value; redraw(); });
  whenSel.addEventListener('change', () => { state.when = whenSel.value; history.replaceState(null, '', '#map' + query()); redraw(); });
  kizBox.addEventListener('change', () => { state.kizOnly = kizBox.checked; history.replaceState(null, '', '#map' + query()); redraw(); });
  colorSel.addEventListener('change', () => { state.colorBy = colorSel.value; history.replaceState(null, '', '#map' + query()); redraw(); });
  document.addEventListener('keydown', function esc(ev) {
    if (!root.isConnected || !mapEl.isConnected) return document.removeEventListener('keydown', esc);
    if (ev.key === 'Escape' && (state.event || state.city)) {
      if (state.event) state.event = null; else state.city = null;
      history.replaceState(null, '', '#map' + query()); highlight(); renderPanel();
    }
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (mapEl.isConnected) { drawWorld(land); redraw(); } });

  redraw({ fit: !!state.country });
  if (state.event) {
    const e = byId.get(state.event);
    if (e) map.setView([e.lat, e.lon], Math.max(map.getZoom(), 5));
  }
  setTimeout(() => { map.invalidateSize(); lockZoom(); }, 0);
  return () => map.remove();
}

async function drawWorld(layer) {
  if (!worldGeo) {
    const topo = await fetch(WORLD).then(r => r.json());
    worldGeo = topojson.feature(topo, topo.objects.countries);
  }
  layer.clearLayers();
  L.geoJSON(worldGeo, { pane: 'land', interactive: false, style: { color: css('--map-border'), weight: 0.7, fillColor: css('--land'), fillOpacity: 1 } })
    .addTo(layer);
}
