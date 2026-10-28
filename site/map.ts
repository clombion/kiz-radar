// Map: one bubble per city (size = festivals, colour = flight price) and the festivals in view as cards.
// On a phone the list is a sheet over the map that peeks at the bottom and slides up.
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { q, sql } from './db.ts';
import { button, dropdown, h, moreButton } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { changed, type Festival, readState, withDetails } from './festivals.ts';
import { convert, currency, money, step } from './money.ts';
import { cityOnMapHref, eventOnMapHref, mapHref, type Show, showInAddressBar } from './routes.ts';
import { EVENT } from './rows.ts';
import { flag, home } from './ui.ts';

const WORLD = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
type Land = FeatureCollection<Polygon | MultiPolygon, { name: string }>;
let worldGeo: Land | undefined; // cached across visits to the tab
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const PAGE = 40;

// a festival with a place on the map, and a city's bubble
type Placed = Festival & { city: string; lat: number; lon: number };
interface City {
  key: string;
  city: string;
  cc: string | null;
  lat: number;
  lon: number;
  events: Placed[];
  n: number;
  popular: number;
  minFare: number | null;
}
const cityKey = (e: Placed) => `${e.city}|${e.country_code}`;
// the festivals in view, by city, with what each city's bubble shows
function citiesOf(events: readonly Placed[]): City[] {
  const groups = new Map<string, Omit<City, 'n' | 'popular' | 'minFare'>>();
  for (const e of events) {
    const k = cityKey(e);
    const g = groups.get(k) ?? { key: k, city: e.city, cc: e.country_code, lat: e.lat, lon: e.lon, events: [] };
    g.events.push(e);
    groups.set(k, g);
  }
  return [...groups.values()].map((c) => {
    const fares = c.events.flatMap((e) => (e.fare ? [e.fare.price] : []));
    return {
      ...c,
      n: c.events.length,
      popular: c.events.reduce((sum, e) => sum + (e.popular_artists ?? 0), 0),
      minFare: fares.length > 0 ? Math.min(...fares) : null,
    };
  });
}
type Band = readonly [string, (c: City) => boolean, string];
type Scheme = { label: string; title: () => string; bands: readonly Band[] };
// a city's bubble: its size the festivals there, its colour the scheme's band for it
const bubble = (c: City, scheme: Scheme) =>
  L.circleMarker([c.lat, c.lon], {
    radius: 4 + 3.2 * Math.sqrt(c.n),
    weight: 1.5,
    color: css('--bubble-stroke'),
    fillColor: css(scheme.bands.find((b) => b[1](c))?.[2] ?? '--none'),
    fillOpacity: 0.85,
    bubblingMouseEvents: false,
  }).bindTooltip(
    `${c.city} · ${c.n} festival${c.n > 1 ? 's' : ''}${c.minFare === null ? '' : ` · flights from ${money(c.minFare)}`}`,
    { direction: 'top', offset: [0, -6] },
  );
const COLOR_BY: Readonly<Record<string, Scheme>> = {
  fare: {
    label: 'Flight price',
    title: () => `Cheapest flight from ${home().city}`,
    bands: [
      [
        `under ${money(step('flight', 'cheap'), currency)}`,
        (c) => c.minFare != null && (convert(c.minFare) ?? Number.POSITIVE_INFINITY) <= step('flight', 'cheap'),
        '--good',
      ],
      [
        `${money(step('flight', 'cheap'), currency)}–${money(step('flight', 'fair'), currency)}`,
        (c) => c.minFare != null && (convert(c.minFare) ?? Number.POSITIVE_INFINITY) <= step('flight', 'fair'),
        '--mid',
      ],
      [`over ${money(step('flight', 'fair'), currency)}`, (c) => c.minFare != null, '--bad'],
      ['not checked', () => true, '--none'],
    ],
  },
  popular: {
    label: 'Well-known artists',
    title: () => 'Bookings of well-known artists',
    bands: [
      ['10 or more', (c) => c.popular >= 10, '--good'],
      ['1–9', (c) => c.popular > 0, '--mid'],
      ['none', () => true, '--none'],
    ],
  },
};
const WHEN: readonly (readonly [string, string])[] = [
  ['upcoming', 'Upcoming'],
  ['all', 'All dates'],
  ['past', 'Past'],
];

// what the URL can say about the map
const DEFAULTS: { when: string; color: string; country: string } = { when: 'upcoming', color: 'fare', country: '' };
const placed = (e: Festival): e is Placed => e.city !== null && e.lat !== null && e.lon !== null;

export const mapView: Show = (root, sub, qs, { signal }) => {
  const events = withDetails(q(EVENT, sql`SELECT * FROM event_rows WHERE lat IS NOT NULL ORDER BY start_date`)).filter(
    placed,
  );
  const byId = new Map(events.map((e) => [e.id, e]));
  const url = readState(qs, DEFAULTS, {
    when: WHEN.map(([v]) => v),
    color: Object.keys(COLOR_BY),
    country: ['', ...new Set(events.flatMap((e) => e.country_code ?? []))],
  });
  const state: typeof url & { text: string; city: string | null; event: number | null } = {
    ...url,
    text: '',
    city: null,
    event: sub[0] === 'event' && byId.has(Number(sub[1])) ? Number(sub[1]) : null,
  };
  const opened = state.event === null ? undefined : byId.get(state.event);
  // a festival or a city picked, rather than every festival in view
  const picked = () => state.event !== null || state.city !== null;
  if (opened !== undefined) {
    state.city = cityKey(opened);
    if (state.when === 'upcoming' && !opened.upcoming) state.when = 'all';
  }
  // map/city/<country>/<city>: that city picked, with its past festivals too when none is coming up
  const inCity =
    sub[0] === 'city'
      ? events.filter((e) => e.country_code === sub[1] && e.city === decodeURIComponent(sub[2] || ''))
      : [];
  if (inCity[0]) {
    state.city = cityKey(inCity[0]);
    if (state.when === 'upcoming' && !inCity.some((e) => e.upcoming)) state.when = 'all';
  }

  // ----- layout -----
  const search = h('input', {
    type: 'search',
    class: 'mini-search',
    placeholder: 'Search a festival or city',
    'aria-label': 'Search festivals',
  });
  const whenSel = h(
    'select',
    { class: 'mini', 'aria-label': 'When' },
    WHEN.map(([value, label]) => h('option', { value, selected: state.when === value }, label)),
  );
  const colorSel = h(
    'select',
    { class: 'plain', 'aria-label': 'Colour the bubbles by' },
    Object.entries(COLOR_BY).map(([v, c]) => h('option', { value: v, selected: state.color === v }, c.label)),
  );
  const filtersBtn = moreButton('map-filters');
  const filters = h(
    'div',
    { class: 'more-panel', id: 'map-filters', hidden: true },
    h('label', { class: 'field' }, h('span', {}, 'Colour the bubbles by'), colorSel),
  );
  dropdown(filtersBtn, filters, [filtersBtn, filters], signal);
  const paintFiltersBtn = () => {
    const n = Number(state.color !== DEFAULTS.color);
    filtersBtn.textContent = `Filters${n ? ` (${n})` : ''} ▾`;
  };

  const mapEl = h('div', { class: 'map', role: 'application', 'aria-label': 'Map of festivals by city' });
  // a wide chevron that points the way the sheet will move, and a word saying what a tap does
  const chevron = h('span', { class: 'chevron', 'aria-hidden': 'true' });
  chevron.innerHTML = '<svg viewBox="0 0 48 12" width="48" height="12"><path d="M3 10 L24 3 L45 10"/></svg>';
  const action = h('span', { class: 'sheet-action' }, 'Open');
  const handle = button(
    { class: 'sheet-handle', 'aria-expanded': 'false' },
    chevron,
    h('span', { class: 'sheet-row' }, h('span', { class: 'sheet-title' }), action),
  );
  const body = h('div', { class: 'sheet-body', 'aria-live': 'polite' });
  const panel = h('aside', { class: 'map-panel' }, handle, body);
  root.replaceChildren(
    h(
      'section',
      { class: 'pmap' },
      h('div', { class: 'map-bar' }, search, whenSel, h('div', { class: 'filters-wrap' }, filtersBtn, filters)),
      h('div', { class: 'map-split' }, mapEl, panel),
    ),
  );

  // the sheet on phones: peeks with its title, slides up for the list
  const setSheet = (up: boolean) => {
    panel.classList.toggle('up', up);
    handle.setAttribute('aria-expanded', String(up));
    action.textContent = up ? 'Close' : 'Open';
  };
  handle.addEventListener('click', () => setSheet(!panel.classList.contains('up')));
  let y0: number | null = null;
  handle.addEventListener(
    'touchstart',
    (ev) => {
      y0 = ev.touches[0]?.clientY ?? null;
    },
    { passive: true },
  );
  handle.addEventListener('touchend', (ev) => {
    const y = ev.changedTouches[0]?.clientY;
    if (y0 == null || y === undefined) return;
    const dy = y - y0;
    y0 = null;
    if (Math.abs(dy) > 30) {
      ev.preventDefault();
      setSheet(dy < 0);
    }
  });

  // ----- map -----
  // Panning and zooming out stop at the box around every event (all dates), plus a small margin.
  const padded = L.latLngBounds(events.map((e): [number, number] => [e.lat, e.lon])).pad(0.05);
  const dataBounds = L.latLngBounds(
    [Math.max(padded.getSouth(), -85), Math.max(padded.getWest(), -180)],
    [Math.min(padded.getNorth(), 85), Math.min(padded.getEast(), 180)],
  );
  const map = L.map(mapEl, {
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: false,
    maxBounds: dataBounds,
    maxBoundsViscosity: 1,
    inertia: false,
    zoomSnap: 0.25,
  }); // quarter steps fit the festivals tightly
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
  map.createPane('land').style.zIndex = '350';
  const land = L.layerGroup().addTo(map);
  const bubbles = L.layerGroup().addTo(map);
  void drawWorld(land);
  // the legend sits on the map, where the colours are
  const legendEl = h('div', { class: 'map-legend' });
  const Legend = L.Control.extend({ onAdd: () => legendEl });
  new Legend({ position: 'bottomleft' }).addTo(map);
  L.DomEvent.disableClickPropagation(legendEl);

  let cities: City[] = [],
    markers = new Map<string, L.CircleMarker>(),
    shown = PAGE;
  function visible() {
    const t = state.text.toLowerCase();
    return events.filter(
      (e) =>
        (state.when === 'all' || (state.when === 'upcoming') === Boolean(e.upcoming)) &&
        (!state.country || e.country_code === state.country) &&
        (!t || e.title.toLowerCase().includes(t) || e.city.toLowerCase().includes(t)),
    );
  }

  function redraw({ fit = false } = {}) {
    cities = citiesOf(visible());
    bubbles.clearLayers();
    markers = new Map();
    const scheme = COLOR_BY[state.color] ?? COLOR_BY['fare'];
    if (!scheme) throw new Error('no colour scheme');
    for (const c of cities.sort((a, b) => b.n - a.n)) {
      // big cities first so small bubbles stay clickable
      const m = bubble(c, scheme).on('click', () => selectCity(c.key));
      m.addTo(bubbles);
      markers.set(c.key, m);
    }
    legendEl.replaceChildren(
      h('strong', {}, scheme.title()),
      ...scheme.bands.map((b) => h('span', {}, h('i', { style: `background:${css(b[2])}` }), b[0])),
      h('span', { class: 'size' }, h('i', { class: 'ring' }), 'bigger = more festivals'),
    );
    paintFiltersBtn();
    highlight();
    if (fit && cities.length > 0)
      map.fitBounds(L.latLngBounds(cities.map((c): [number, number] => [c.lat, c.lon])), {
        padding: [24, 24],
        maxZoom: 7,
      });
    shown = PAGE;
    renderPanel();
  }

  function highlight(hoverKey?: string) {
    for (const [k, m] of markers) {
      const on = k === state.city || k === hoverKey;
      m.setStyle({ weight: on ? 4 : 1.5, color: on ? css('--accent') : css('--bubble-stroke') });
      if (on) m.bringToFront();
    }
  }
  const save = () => {
    const params = changed({ when: state.when, color: state.color, country: state.country }, DEFAULTS);
    const city = state.event === null ? cities.find((c) => c.key === state.city) : undefined;
    showInAddressBar(
      state.event === null
        ? city
          ? cityOnMapHref(city.city, city.cc ?? '', params)
          : mapHref(params)
        : eventOnMapHref(state.event, params),
    );
  };
  function selectCity(key: string) {
    state.city = key;
    state.event = null;
    save();
    highlight();
    renderPanel();
    setSheet(true);
  }
  const back = (words: string, fn: () => void) => button({ class: 'back-link', onclick: fn }, '← ', words);
  const count = (n: number) => `${n} festival${n === 1 ? '' : 's'}`;

  function cards(list: readonly Placed[]): HTMLElement {
    const wrap = h(
      'div',
      { class: 'panel-cards' },
      list.slice(0, shown).map((e) => {
        const c = eventCard(e, { onMap: true });
        c.addEventListener('mouseenter', () => highlight(cityKey(e)));
        c.addEventListener('mouseleave', () => highlight());
        return c;
      }),
    );
    if (list.length > shown)
      wrap.append(
        button(
          {
            class: 'more-btn show-more',
            onclick: () => {
              shown += PAGE;
              renderPanel();
            },
          },
          `Show ${Math.min(PAGE, list.length - shown)} more`,
        ),
      );
    return wrap;
  }

  const title = h('span', { class: 'sheet-title' });
  handle.querySelector('.sheet-title')?.replaceWith(title);
  // the panel beside the map: the festival picked, the city picked, or every festival in view
  function eventPanel(e: Placed): void {
    title.textContent = e.city;
    const here = cities.find((c) => c.key === state.city)?.n ?? 1;
    body.replaceChildren(
      here > 1
        ? back(`${count(here)} in ${e.city}`, () => {
            state.event = null;
            save();
            renderPanel();
          })
        : toAll(),
      eventCard(e, { open: true, onMap: true }),
    );
  }
  // back to every festival in view, from a city or a festival
  function toAll(): HTMLElement {
    return back('All festivals in view', () => {
      state.event = null;
      state.city = null;
      save();
      highlight();
      renderPanel();
    });
  }
  function cityPanel(c: City): void {
    title.textContent = `${flag(c.cc)} ${c.city} · ${count(c.n)}`;
    body.replaceChildren(
      toAll(),
      h(
        'header',
        { class: 'panel-head' },
        h('h2', {}, flag(c.cc), ' ', c.city),
        h('p', {}, count(c.n), c.minFare === null ? '' : ` · flights from ${money(c.minFare)}`),
      ),
      cards(c.events),
    );
  }
  function inViewPanel(): void {
    const b = map.getBounds();
    const inView = cities
      .filter((c) => b.contains([c.lat, c.lon]))
      .flatMap((c) => c.events)
      .sort((a, z) => a.start_date.localeCompare(z.start_date));
    const total = cities.reduce((sum, c) => sum + c.n, 0);
    title.textContent = `${count(inView.length)} on the map`;
    body.replaceChildren(
      h(
        'header',
        { class: 'panel-head' },
        h('h2', {}, `${count(inView.length)} on the map`),
        h(
          'p',
          {},
          inView.length < total
            ? 'Move the map to change the list, or pick a city.'
            : 'Pick a city to see only its festivals.',
        ),
      ),
      inView.length > 0 ? cards(inView) : h('p', { class: 'muted' }, 'No festivals here with these filters.'),
    );
  }
  function renderPanel(): void {
    const e = state.event === null ? undefined : byId.get(state.event);
    if (e !== undefined) {
      eventPanel(e);
      return;
    }
    // a city no longer on the map is no longer picked
    const c = state.city === null ? undefined : cities.find((x) => x.key === state.city);
    if (c) cityPanel(c);
    else {
      state.city = null;
      inViewPanel();
    }
  }

  let settling: ReturnType<typeof setTimeout> | undefined;
  map.on('moveend', () => {
    clearTimeout(settling);
    settling = setTimeout(() => {
      if (!picked()) {
        shown = PAGE;
        renderPanel();
      }
    }, 120);
  });
  map.on('click', () => {
    if (picked()) {
      state.city = null;
      state.event = null;
      save();
      highlight();
      renderPanel();
    }
    setSheet(false);
  });
  let typing: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      state.text = search.value;
      redraw();
    }, 150);
  });
  whenSel.addEventListener('change', () => {
    state.when = whenSel.value;
    save();
    redraw();
  });
  colorSel.addEventListener('change', () => {
    state.color = colorSel.value;
    save();
    redraw();
  });
  const esc = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !picked()) return;
    if (state.event === null) state.city = null;
    else state.event = null;
    save();
    highlight();
    renderPanel();
  };
  document.addEventListener('keydown', esc, { signal });

  whenSel.value = state.when;
  redraw({ fit: state.event === null && inCity.length === 0 }); // open on every festival shown, wherever it is
  if (opened !== undefined) {
    map.setView([opened.lat, opened.lon], Math.max(map.getZoom(), 5));
    setSheet(true);
  } else if (inCity[0]) {
    map.setView([inCity[0].lat, inCity[0].lon], Math.max(map.getZoom(), 6));
    setSheet(true);
  }
  const settle = setTimeout(() => {
    map.invalidateSize();
    lockZoom();
  }, 0);
  // On leaving, the map stops listening at once and is removed once a zoom animation, which Leaflet can't cancel
  // (it ends 250 ms after it starts), has finished with it.
  signal.addEventListener('abort', () => {
    clearTimeout(settle);
    clearTimeout(settling);
    clearTimeout(typing);
    map.off();
    setTimeout(() => map.remove(), 300);
  });
};

// world-atlas, at the version WORLD names, is a topology whose countries are a collection of named shapes
type World = Topology<{ countries: GeometryCollection<{ name: string }> }>;
const isWorld = (v: unknown): v is World =>
  typeof v === 'object' &&
  v !== null &&
  'type' in v &&
  v.type === 'Topology' &&
  'objects' in v &&
  typeof v.objects === 'object' &&
  v.objects !== null &&
  'countries' in v.objects;
async function drawWorld(layer: L.LayerGroup): Promise<void> {
  if (!worldGeo) {
    const topo: unknown = await fetch(WORLD).then((r) => r.json());
    if (!isWorld(topo)) throw new Error(`${WORLD}: not the world topology`);
    const world = topojson.feature(topo, topo.objects.countries);
    worldGeo = {
      ...world,
      features: world.features
        .filter(isLand)
        .filter((f) => f.properties.name !== 'Antarctica')
        .map(unwrap),
    };
  }
  layer.clearLayers();
  L.geoJSON(worldGeo, {
    pane: 'land',
    interactive: false,
    style: { color: css('--map-border'), weight: 0.7, fillColor: css('--land'), fillOpacity: 1 },
  }).addTo(layer);
}

// The outline data jumps a ring from +180° to -180° where a country crosses the antimeridian (Russia, Fiji), which
// a flat map draws as a stripe across the world. Keeping each ring's longitudes continuous draws it in one piece.
type Country = Feature<Polygon | MultiPolygon, { name: string }>;
const isLand = (f: Feature<GeoJSON.Geometry | null, { name: string }>): f is Country =>
  f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
function unwrap(feature: Country): Country {
  const ring = (r: Position[]): Position[] => {
    let shift = 0;
    return r.map(([lon = 0, lat = 0], i) => {
      const prev = r[i - 1]?.[0];
      if (prev !== undefined) {
        if (lon - prev > 180) shift -= 360;
        else if (prev - lon > 180) shift += 360;
      }
      return [lon + shift, lat];
    });
  };
  const g = feature.geometry;
  return g.type === 'Polygon'
    ? { ...feature, geometry: { ...g, coordinates: g.coordinates.map(ring) } }
    : { ...feature, geometry: { ...g, coordinates: g.coordinates.map((p) => p.map(ring)) } };
}
