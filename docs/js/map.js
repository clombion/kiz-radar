// Map: one bubble per city (size = festivals, colour = flight price) and the festivals in view as cards.
// On a phone the list is a sheet over the map that peeks at the bottom and slides up.
import { q } from './db.js';
import { h, flag, home } from './ui.js';
import { money, convert, step, currency } from './money.js';
import { eventCard } from './eventcard.js';
import { withDetails, readState, changed } from './festivals.js';
import { mapHref, eventOnMapHref, cityOnMapHref, showInAddressBar } from './routes.js';

const WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
let worldGeo;            // cached across visits to the tab
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const PAGE = 40;

const COLOR_BY = {
  fare: { label: 'Flight price', title: () => `Cheapest flight from ${home().city}`, bands: [
    [`under ${money(step('flight', 'cheap'), currency)}`, c => c.minFare != null && convert(c.minFare) <= step('flight', 'cheap'), '--good'],
    [`${money(step('flight', 'cheap'), currency)}–${money(step('flight', 'fair'), currency)}`, c => c.minFare != null && convert(c.minFare) <= step('flight', 'fair'), '--mid'],
    [`over ${money(step('flight', 'fair'), currency)}`, c => c.minFare != null, '--bad'],
    ['not checked', () => true, '--none']] },
  popular: { label: 'Well-known artists', title: () => 'Bookings of well-known artists', bands: [
    ['10 or more', c => c.popular >= 10, '--good'],
    ['1–9', c => c.popular > 0, '--mid'],
    ['none', () => true, '--none']] },
};
const WHEN = [['upcoming', 'Upcoming'], ['all', 'All dates'], ['past', 'Past']];

// what the URL can say about the map
const DEFAULTS = { when: 'upcoming', color: 'fare', country: '' };

export function mapView(root, sub, qs, { signal }) {
  const events = withDetails(q('SELECT * FROM event_rows WHERE lat IS NOT NULL ORDER BY start_date'));
  const byId = new Map(events.map(e => [e.id, e]));
  const url = readState(qs, DEFAULTS, { when: WHEN.map(([v]) => v), color: Object.keys(COLOR_BY),
    country: ['', ...new Set(events.map(e => e.country_code))] });
  const state = { ...url, text: '', city: null, event: sub[0] === 'event' && byId.has(Number(sub[1])) ? Number(sub[1]) : null };
  const cityKey = e => `${e.city}|${e.country_code}`;
  if (state.event) {
    const e = byId.get(state.event);
    state.city = cityKey(e);
    if (state.when === 'upcoming' && !e.upcoming) state.when = 'all';
  }
  // map/city/<country>/<city>: that city picked, with its past festivals too when none is coming up
  const inCity = sub[0] === 'city' ? events.filter(e => e.country_code === sub[1] && e.city === decodeURIComponent(sub[2] || '')) : [];
  if (inCity.length) {
    state.city = cityKey(inCity[0]);
    if (state.when === 'upcoming' && !inCity.some(e => e.upcoming)) state.when = 'all';
  }

  // ----- layout -----
  const search = h('input', { type: 'search', class: 'mini-search', placeholder: 'Search a festival or city', 'aria-label': 'Search festivals' });
  const whenSel = h('select', { class: 'mini', 'aria-label': 'When' }, WHEN.map(([v, t]) => h('option', { value: v, selected: state.when === v }, t)));
  const colorSel = h('select', { class: 'plain', 'aria-label': 'Colour the bubbles by' }, Object.entries(COLOR_BY)
    .map(([v, c]) => h('option', { value: v, selected: state.color === v }, c.label)));
  const filtersBtn = h('button', { type: 'button', class: 'more-btn', 'aria-expanded': 'false', 'aria-controls': 'map-filters' });
  const filters = h('div', { class: 'more-panel', id: 'map-filters', hidden: true },
    h('label', { class: 'field' }, h('span', {}, 'Colour the bubbles by'), colorSel));
  filtersBtn.addEventListener('click', ev => { ev.stopPropagation(); filters.hidden = !filters.hidden; filtersBtn.setAttribute('aria-expanded', String(!filters.hidden)); });
  const closeFilters = ev => { if (!filters.hidden && !filters.contains(ev.target)) { filters.hidden = true; filtersBtn.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', closeFilters, { signal });
  const paintFiltersBtn = () => { const n = +(state.color !== DEFAULTS.color);
    filtersBtn.textContent = `Filters${n ? ` (${n})` : ''} ▾`; };

  const mapEl = h('div', { class: 'map', role: 'application', 'aria-label': 'Map of festivals by city' });
  // a wide chevron that points the way the sheet will move, and a word saying what a tap does
  const chevron = h('span', { class: 'chevron', 'aria-hidden': 'true' });
  chevron.innerHTML = '<svg viewBox="0 0 48 12" width="48" height="12"><path d="M3 10 L24 3 L45 10"/></svg>';
  const action = h('span', { class: 'sheet-action' }, 'Open');
  const handle = h('button', { type: 'button', class: 'sheet-handle', 'aria-expanded': 'false' }, chevron,
    h('span', { class: 'sheet-row' }, h('span', { class: 'sheet-title' }), action));
  const body = h('div', { class: 'sheet-body', 'aria-live': 'polite' });
  const panel = h('aside', { class: 'map-panel' }, handle, body);
  root.replaceChildren(h('section', { class: 'pmap' },
    h('div', { class: 'map-bar' }, search, whenSel, h('div', { class: 'filters-wrap' }, filtersBtn, filters)),
    h('div', { class: 'map-split' }, mapEl, panel)));

  // the sheet on phones: peeks with its title, slides up for the list
  const setSheet = up => { panel.classList.toggle('up', up); handle.setAttribute('aria-expanded', String(up)); action.textContent = up ? 'Close' : 'Open'; };
  handle.addEventListener('click', () => setSheet(!panel.classList.contains('up')));
  let y0 = null;
  handle.addEventListener('touchstart', ev => { y0 = ev.touches[0].clientY; }, { passive: true });
  handle.addEventListener('touchend', ev => { if (y0 == null) return; const dy = ev.changedTouches[0].clientY - y0; y0 = null;
    if (Math.abs(dy) > 30) { ev.preventDefault(); setSheet(dy < 0); } });

  // ----- map -----
  // Panning and zooming out stop at the box around every event (all dates), plus a small margin.
  const padded = L.latLngBounds(events.map(e => [e.lat, e.lon])).pad(0.05);
  const dataBounds = L.latLngBounds(
    [Math.max(padded.getSouth(), -85), Math.max(padded.getWest(), -180)],
    [Math.min(padded.getNorth(), 85), Math.min(padded.getEast(), 180)]);
  const map = L.map(mapEl, { zoomControl: false, attributionControl: true, worldCopyJump: false,
    maxBounds: dataBounds, maxBoundsViscosity: 1, inertia: false, zoomSnap: 0.25 });     // quarter steps fit the festivals tightly
  L.control.zoom({ position: 'topright' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Borders: Natural Earth · Places: © OpenStreetMap');
  // Zooming out stops once every festival fits on screen; panning stays within the box around them.
  const lockZoom = () => {
    map.setMinZoom(map.getBoundsZoom(dataBounds, false));
    if (map.getZoom() < map.getMinZoom()) map.setZoom(map.getMinZoom());
    map.panInsideBounds(dataBounds, { animate: false });
  };
  map.setView([50, 10], 4);
  lockZoom();
  map.on('resize', lockZoom);
  map.createPane('land').style.zIndex = 350;
  const land = L.layerGroup().addTo(map);
  const bubbles = L.layerGroup().addTo(map);
  drawWorld(land);
  // the legend sits on the map, where the colours are
  const legendEl = h('div', { class: 'map-legend' });
  const Legend = L.Control.extend({ onAdd: () => legendEl });
  new Legend({ position: 'bottomleft' }).addTo(map);
  L.DomEvent.disableClickPropagation(legendEl);

  let cities = [], markers = new Map(), shown = PAGE;
  function visible() {
    const t = state.text.toLowerCase();
    return events.filter(e =>
      (state.when === 'all' || (state.when === 'upcoming') === !!e.upcoming) &&
      (!state.country || e.country_code === state.country) &&
      (!t || e.title.toLowerCase().includes(t) || e.city.toLowerCase().includes(t)));
  }

  function redraw({ fit } = {}) {
    const groups = new Map();
    for (const e of visible()) {
      const k = cityKey(e);
      if (!groups.has(k)) groups.set(k, { key: k, city: e.city, cc: e.country_code, lat: e.lat, lon: e.lon, events: [] });
      groups.get(k).events.push(e);
    }
    cities = [...groups.values()].map(c => ({ ...c, n: c.events.length,
      popular: c.events.reduce((s, e) => s + e.popular_artists, 0),
      minFare: c.events.some(e => e.fare) ? Math.min(...c.events.filter(e => e.fare).map(e => e.fare.price)) : null }));
    bubbles.clearLayers(); markers = new Map();
    const scheme = COLOR_BY[state.color];
    for (const c of cities.sort((a, b) => b.n - a.n)) {       // big cities first so small bubbles stay clickable
      const band = scheme.bands.find(b => b[1](c));
      const m = L.circleMarker([c.lat, c.lon], { radius: 4 + 3.2 * Math.sqrt(c.n), weight: 1.5,
        color: css('--bubble-stroke'), fillColor: css(band[2]), fillOpacity: 0.85, bubblingMouseEvents: false })
        .bindTooltip(`${c.city} · ${c.n} festival${c.n > 1 ? 's' : ''}` +
          (c.minFare ? ` · flights from ${money(c.minFare)}` : ''), { direction: 'top', offset: [0, -6] })
        .on('click', () => selectCity(c.key));
      m.addTo(bubbles); markers.set(c.key, m);
    }
    legendEl.replaceChildren(h('strong', {}, scheme.title()),
      ...scheme.bands.map(b => h('span', {}, h('i', { style: `background:${css(b[2])}` }), b[0])),
      h('span', { class: 'size' }, h('i', { class: 'ring' }), 'bigger = more festivals'));
    paintFiltersBtn();
    highlight();
    if (fit && cities.length) map.fitBounds(L.latLngBounds(cities.map(c => [c.lat, c.lon])), { padding: [24, 24], maxZoom: 7 });
    shown = PAGE; renderPanel();
  }

  function highlight(hoverKey) {
    for (const [k, m] of markers) {
      const on = k === state.city || k === hoverKey;
      m.setStyle({ weight: on ? 4 : 1.5, color: on ? css('--accent') : css('--bubble-stroke') });
      if (on) m.bringToFront();
    }
  }
  const save = () => {
    const params = changed(pick(state), DEFAULTS), c = !state.event && state.city && cities.find(c => c.key === state.city);
    showInAddressBar(state.event ? eventOnMapHref(state.event, params) : c ? cityOnMapHref(c.city, c.cc, params) : mapHref(params));
  };
  const pick = st => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, st[k]]));
  function selectCity(key) {
    state.city = key; state.event = null; save(); highlight(); renderPanel(); setSheet(true);
  }
  const back = (text, fn) => h('button', { type: 'button', class: 'back-link', onclick: fn }, '← ', text);
  const count = n => `${n} festival${n === 1 ? '' : 's'}`;

  function cards(list) {
    const wrap = h('div', { class: 'panel-cards' }, list.slice(0, shown).map(e => {
      const c = eventCard(e, { onMap: true });
      c.addEventListener('mouseenter', () => highlight(cityKey(e)));
      c.addEventListener('mouseleave', () => highlight());
      return c;
    }));
    if (list.length > shown) wrap.append(h('button', { type: 'button', class: 'more-btn show-more', onclick: () => { shown += PAGE; renderPanel(); } },
      `Show ${Math.min(PAGE, list.length - shown)} more`));
    return wrap;
  }

  function renderPanel() {
    const title = handle.querySelector('.sheet-title');
    if (state.event) {
      const e = byId.get(state.event);
      title.textContent = e.city;
      body.replaceChildren(
        (cities.find(c => c.key === state.city)?.n || 1) > 1
          ? back(`${count(cities.find(c => c.key === state.city).n)} in ${e.city}`, () => { state.event = null; save(); renderPanel(); })
          : back('All festivals in view', () => { state.event = state.city = null; save(); highlight(); renderPanel(); }),
        eventCard(e, { open: true, onMap: true }));
      return;
    }
    if (state.city) {
      const c = cities.find(c => c.key === state.city);
      if (c) {
        title.textContent = `${flag(c.cc)} ${c.city} · ${count(c.n)}`;
        body.replaceChildren(
          back('All festivals in view', () => { state.city = null; save(); highlight(); renderPanel(); }),
          h('header', { class: 'panel-head' }, h('h2', {}, flag(c.cc), ' ', c.city),
            h('p', {}, count(c.n), c.minFare ? ` · flights from ${money(c.minFare)}` : '')),
          cards(c.events));
        return;
      }
      state.city = null;
    }
    const b = map.getBounds();
    const inView = cities.filter(c => b.contains([c.lat, c.lon])).flatMap(c => c.events)
      .sort((a, z) => a.start_date.localeCompare(z.start_date));
    const total = cities.reduce((s, c) => s + c.n, 0);
    title.textContent = `${count(inView.length)} on the map`;
    body.replaceChildren(
      h('header', { class: 'panel-head' }, h('h2', {}, `${count(inView.length)} on the map`),
        h('p', {}, inView.length < total ? 'Move the map to change the list, or pick a city.' : 'Pick a city to see only its festivals.')),
      inView.length ? cards(inView) : h('p', { class: 'muted' }, 'No festivals here with these filters.'));
  }

  let t;
  map.on('moveend', () => { clearTimeout(t); t = setTimeout(() => { if (!state.city && !state.event) { shown = PAGE; renderPanel(); } }, 120); });
  map.on('click', () => { if (state.city || state.event) { state.city = state.event = null; save(); highlight(); renderPanel(); } setSheet(false); });
  let ts; search.addEventListener('input', () => { clearTimeout(ts); ts = setTimeout(() => { state.text = search.value; redraw(); }, 150); });
  whenSel.addEventListener('change', () => { state.when = whenSel.value; save(); redraw(); });
  colorSel.addEventListener('change', () => { state.color = colorSel.value; save(); redraw(); });
  const esc = ev => {
    if (ev.key !== 'Escape' || !(state.event || state.city)) return;
    if (state.event) state.event = null; else state.city = null;
    save(); highlight(); renderPanel();
  };
  document.addEventListener('keydown', esc, { signal });

  whenSel.value = state.when;
  redraw({ fit: !state.event && !inCity.length });            // open on every festival shown, wherever it is
  if (state.event) {
    const e = byId.get(state.event);
    map.setView([e.lat, e.lon], Math.max(map.getZoom(), 5));
    setSheet(true);
  } else if (inCity.length) {
    map.setView([inCity[0].lat, inCity[0].lon], Math.max(map.getZoom(), 6));
    setSheet(true);
  }
  const settle = setTimeout(() => { map.invalidateSize(); lockZoom(); }, 0);
  // On leaving, the map stops listening at once and is removed once a zoom animation, which Leaflet can't cancel
  // (it ends 250 ms after it starts), has finished with it.
  signal.addEventListener('abort', () => { clearTimeout(settle); clearTimeout(t); clearTimeout(ts); map.off(); setTimeout(() => map.remove(), 300); });
}

async function drawWorld(layer) {
  if (!worldGeo) {
    const topo = await fetch(WORLD).then(r => r.json());
    const world = topojson.feature(topo, topo.objects.countries);
    world.features = world.features.filter(f => f.properties.name !== 'Antarctica').map(unwrap);
    worldGeo = world;
  }
  layer.clearLayers();
  L.geoJSON(worldGeo, { pane: 'land', interactive: false, style: { color: css('--map-border'), weight: 0.7, fillColor: css('--land'), fillOpacity: 1 } })
    .addTo(layer);
}

// The outline data jumps a ring from +180° to -180° where a country crosses the antimeridian (Russia, Fiji), which
// a flat map draws as a stripe across the world. Keeping each ring's longitudes continuous draws it in one piece.
function unwrap(feature) {
  const ring = r => { let shift = 0; return r.map(([lon, lat], i) => {
    if (i) { const prev = r[i - 1][0]; if (lon - prev > 180) shift -= 360; else if (prev - lon > 180) shift += 360; }
    return [lon + shift, lat]; }); };
  const g = feature.geometry;
  const coordinates = g.type === 'Polygon' ? g.coordinates.map(ring) : g.coordinates.map(p => p.map(ring));
  return { ...feature, geometry: { ...g, coordinates } };
}

