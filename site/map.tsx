// Map: one bubble per city (size = festivals, colour = flight price) and the festivals in view as cards.
// On a phone the list is a sheet over the map that peeks at the bottom and slides up.
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createEffect, createSignal, flush, For, onSettled, Show } from 'solid-js';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { asElement, debounced, styled } from './bits.ts';
import { choices, dropdown, leftOut, paged, searchField } from './controls.tsx';
import { needs, q, sql } from './db.ts';
import { eventCard } from './eventcard.tsx';
import { type Festival, withDetails } from './festivals.ts';
import { Drawing } from './icons.ts';
import { currency, money, step, within } from './money.ts';
import { disposal, redrawing, Redrawn, type ViewProps } from './mount.tsx';
import { get } from './net.ts';
import { done } from './report.ts';
import { changed, cityOf, cityOnMapHref, eventOnMapHref, mapHref, readState, showInAddressBar } from './routes.ts';
import { EVENT } from './rows.ts';
import { countryName, flag, home } from './ui.ts';
import { plural } from './wording.ts';

const WORLD = new URL(/* @vite-ignore */ '../vendor/countries-50m.json', import.meta.url); // world-atlas, copied by the build
type Land = FeatureCollection<Polygon | MultiPolygon, { name: string }>;
let worldGeo: Land | undefined; // cached across visits to the tab
// a colour of the stylesheet's (its custom property), read once: the page has one theme
const palette = new Map<string, string>();
const css = (name: string): string => {
  const known = palette.get(name);
  if (known !== undefined) return known;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  palette.set(name, value);
  return value;
};
const PAGE = 40;

// a festival with a place on the map, and a city's bubble
type Placed = Festival & {
  readonly city: string;
  readonly city_key: string;
  readonly country_code: string;
  readonly lat: number;
  readonly lon: number;
};
interface City {
  readonly key: string;
  readonly city: string;
  readonly cc: string;
  readonly lat: number;
  readonly lon: number;
  readonly events: readonly Placed[];
  readonly n: number;
  readonly popular: number;
  readonly minFare: number | null;
  readonly home: boolean; // a festival there is in the home city
}
// the festivals in view, by city, with what each city's bubble shows
function citiesOf(events: readonly Placed[]): City[] {
  // each city as its festivals are added, built in place (City is read-only)
  const groups = new Map<string, Omit<City, 'events' | 'n' | 'popular' | 'minFare' | 'home'> & { events: Placed[] }>();
  for (const e of events) {
    const k = e.city_key;
    const g = groups.get(k) ?? { key: k, city: e.city, cc: e.country_code, lat: e.lat, lon: e.lon, events: [] };
    g.events.push(e);
    groups.set(k, g);
  }
  return [...groups.values()].map((c) => {
    const fares = c.events.flatMap((e) => (e.fare && !e.fare.home ? [e.fare.price] : []));
    return {
      ...c,
      home: c.events.some((e) => e.fare?.home === true),
      n: c.events.length,
      popular: c.events.reduce((sum, e) => sum + e.popular_artists, 0),
      minFare: fares.length > 0 ? Math.min(...fares) : null,
    };
  });
}
type Band = readonly [string, (c: City) => boolean, string];
type Scheme = { readonly title: () => string; readonly bands: readonly Band[] };
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
    `${c.city} · ${plural(c.n, 'festival')}${c.home ? ' · no flight needed' : c.minFare === null ? '' : ` · flights from ${money(c.minFare)}`}`,
    { direction: 'top', offset: [0, -6] },
  );
const COLORS = [
  ['fare', 'Flight price'],
  ['popular', 'Well-known artists'],
] as const;
type Color = (typeof COLORS)[number][0];
const COLOR_BY: Readonly<Record<Color, Scheme>> = {
  fare: {
    title: () => `Cheapest flight from ${home().city}`,
    bands: [
      [
        `under ${money(step('flight', 'cheap'), currency)}`,
        (c) => c.home || (c.minFare != null && within(c.minFare, 'flight', 'cheap')), // home: no flight needed
        '--good',
      ],
      [
        `${money(step('flight', 'cheap'), currency)}–${money(step('flight', 'fair'), currency)}`,
        (c) => c.minFare != null && within(c.minFare, 'flight', 'fair'),
        '--mid',
      ],
      [`over ${money(step('flight', 'fair'), currency)}`, (c) => c.minFare != null, '--bad'],
      ['not checked', () => true, '--none'],
    ],
  },
  popular: {
    title: () => 'Bookings of well-known artists',
    bands: [
      ['10 or more', (c) => c.popular >= 10, '--good'],
      ['1–9', (c) => c.popular > 0, '--mid'],
      ['none', () => true, '--none'],
    ],
  },
};
const WHEN = [
  ['upcoming', 'Upcoming'],
  ['all', 'All dates'],
  ['past', 'Past'],
] as const;
type When = (typeof WHEN)[number][0];

// what the URL can say about the map
const DEFAULTS: { when: When; color: Color; country: string } = { when: 'upcoming', color: 'fare', country: '' };
const placed = (e: Festival): e is Placed =>
  e.city !== null && e.city_key !== null && e.country_code !== null && e.lat !== null && e.lon !== null;

// the festivals of the city the address picks: the opened festival's (map/event/<id>), or the one map/city/<key>
// names (routes.cityOf)
function pickedIn(sub: readonly string[], events: readonly Placed[], opened: Placed | undefined): Placed[] {
  if (opened !== undefined) return [opened];
  const key = sub[0] === 'city' ? cityOf(sub.slice(1)) : null;
  return key === null ? [] : events.filter((e) => e.city_key === key);
}

// what the panel beside the map shows: the festival picked (with how many its city has), the city picked, or the
// festivals in view (of how many on the map); a new one each time it is drawn
type Panel =
  | { readonly kind: 'event'; readonly e: Placed; readonly here: number }
  | { readonly kind: 'city'; readonly c: City }
  | { readonly kind: 'view'; readonly inView: readonly Placed[]; readonly total: number };

// The map's view. The map itself is Leaflet's, an island: made once its element is in the page and taken away with the
// view, its bubbles drawn in an effect on the choices and the words searched, and what is picked (a city, a festival)
// its own state, read by its handlers as Leaflet's is. What the page shows of it is JSX: the bar, the legend Leaflet
// places on the map, and the panel beside it, a signal set each time the map draws it.
export function map({ sub, qs }: ViewProps): JSX.Element {
  const events = withDetails(q(EVENT, sql`SELECT * FROM event_rows WHERE lat IS NOT NULL ORDER BY start_date`)).filter(
    placed,
  );
  const byId = new Map(events.map((e) => [e.id, e]));
  const countriesOf = [...new Set(events.map((e) => e.country_code))].sort((a, b) =>
    countryName(a).localeCompare(countryName(b)),
  );
  const { state: url, dropped } = readState(qs, DEFAULTS, {
    when: WHEN.map(([v]) => v),
    color: COLORS.map(([v]) => v),
    country: ['', ...countriesOf],
  });
  const state: typeof url & { text: string; city: string | null; event: number | null } = {
    ...url,
    text: '',
    city: null,
    event: sub[0] === 'event' && byId.has(Number(sub[1])) ? Number(sub[1]) : null,
  };
  // a festival or a city picked, rather than every festival in view
  const picked = () => state.event !== null || state.city !== null;
  const there = pickedIn(sub, events, state.event === null ? undefined : byId.get(state.event));
  if (there[0]) {
    state.city = there[0].city_key;
    if (state.when === 'upcoming' && !there.some((e) => e.upcoming)) state.when = 'all'; // its past ones too
  }
  // the choices the bubbles are drawn for, a new record on each (the words searched among them), as each drew the map
  // again; the filters' button and the legend follow them
  const [drawnFor, setDrawnFor] = createSignal({
    when: state.when,
    color: state.color,
    country: state.country,
    text: '',
  });
  const redrawn = () => {
    flush(() => {
      setDrawnFor({ when: state.when, color: state.color, country: state.country, text: state.text });
    });
  };
  const left = disposal();

  // ----- layout -----
  // a choice changed: the address says it and the map shows it
  const chose = () => {
    save();
    redrawn();
  };
  const filters = dropdown();
  let mapEl: HTMLDivElement | undefined;
  const filtersOn = () => {
    const { color, country } = drawnFor();
    return Number(color !== DEFAULTS.color) + Number(country !== DEFAULTS.country);
  };

  // the sheet on phones: peeks with its title, slides up for the list
  const [sheetUp, setSheetUp] = createSignal(false);
  const setSheet = (up: boolean) => {
    flush(() => {
      setSheetUp(up);
    });
  };
  let y0: number | null = null;
  // a touch heard as it starts, passive (a JSX handler is delegated to the view's root, where it would not be passive,
  // and would hold every scroll of the page while it runs)
  const touched = (el: HTMLButtonElement) => {
    el.addEventListener(
      'touchstart',
      (ev) => {
        y0 = ev.touches[0]?.clientY ?? null;
      },
      { passive: true },
    );
  };
  // a swipe up or down the handle slides the sheet that way
  const swiped = (y: number | undefined): boolean => {
    if (y0 == null || y === undefined) return false;
    const dy = y - y0;
    y0 = null;
    if (Math.abs(dy) <= 30) return false;
    setSheet(dy < 0);
    return true;
  };

  // the legend sits on the map, where the colours are
  const scheme = () => COLOR_BY[drawnFor().color];
  const legendEl = asElement(
    <div class="map-legend">
      <strong>{scheme().title()}</strong>
      <For each={scheme().bands}>
        {(b) => (
          <span>
            <i ref={styled({ background: css(b[2]) })} />
            {b[0]}
          </span>
        )}
      </For>
      <span class="size">
        <i class="ring" />
        bigger = more festivals
      </span>
    </div>,
    HTMLDivElement,
    "the map's legend",
  );

  // ----- map -----
  // Panning and zooming out stop at the box around every event (all dates), plus a small margin.
  const padded = L.latLngBounds(events.map((e): [number, number] => [e.lat, e.lon])).pad(0.05);
  const dataBounds = L.latLngBounds(
    [Math.max(padded.getSouth(), -85), Math.max(padded.getWest(), -180)],
    [Math.min(padded.getNorth(), 85), Math.min(padded.getEast(), 180)],
  );
  needs('L', 'vendor/leaflet/leaflet.js');
  needs('topojson', 'vendor/topojson-client.min.js');
  let lmap: L.Map | undefined, bubbles: L.LayerGroup | undefined;
  // Zooming out stops once every festival fits on screen; panning stays within the box around them.
  const lockZoom = () => {
    if (lmap === undefined) return;
    lmap.setMinZoom(lmap.getBoundsZoom(dataBounds, false));
    if (lmap.getZoom() < lmap.getMinZoom()) lmap.setZoom(lmap.getMinZoom());
    lmap.panInsideBounds(dataBounds, { animate: false });
  };

  let cities: City[] = [],
    markers = new Map<string, L.CircleMarker>(),
    listed = ''; // the festivals the panel lists, by id, so a move that keeps them keeps the panel
  function visible() {
    const t = state.text.toLowerCase();
    return events.filter(
      (e) =>
        (state.when === 'all' || (state.when === 'upcoming') === e.upcoming) &&
        (!state.country || e.country_code === state.country) &&
        (!t || e.title.toLowerCase().includes(t) || e.city.toLowerCase().includes(t)),
    );
  }

  function redraw({ fit = false } = {}) {
    cities = citiesOf(visible());
    bubbles?.clearLayers();
    markers = new Map();
    lit = new Set(); // the new bubbles are drawn plain
    const shown = COLOR_BY[state.color];
    for (const c of cities.sort((a, b) => b.n - a.n)) {
      // big cities first so small bubbles stay clickable
      const m = bubble(c, shown).on('click', () => selectCity(c.key));
      if (bubbles !== undefined) m.addTo(bubbles);
      markers.set(c.key, m);
    }
    highlight();
    if (fit && cities.length > 0)
      lmap?.fitBounds(L.latLngBounds(cities.map((c): [number, number] => [c.lat, c.lon])), {
        padding: [24, 24],
        maxZoom: 7,
      });
    renderPanel();
  }

  // the picked city's bubble and the hovered one's stand out; only bubbles that change are restyled
  let lit = new Set<string>();
  function highlight(hoverKey?: string) {
    const on = new Set([state.city, hoverKey].filter((k) => k != null));
    for (const k of new Set([...lit, ...on])) {
      const m = markers.get(k);
      if (m === undefined) continue;
      m.setStyle({ weight: on.has(k) ? 4 : 1.5, color: on.has(k) ? css('--accent') : css('--bubble-stroke') });
      if (on.has(k)) m.bringToFront();
    }
    lit = on;
  }
  // what is picked, as it changes: in the address, its bubble lit, the panel drawn at once
  const picking = () => {
    save();
    highlight();
    renderPanel();
    flush();
  };
  const save = () => {
    const params = changed({ when: state.when, color: state.color, country: state.country }, DEFAULTS);
    const city = state.event === null ? cities.find((c) => c.key === state.city) : undefined;
    showInAddressBar(
      state.event === null
        ? city
          ? cityOnMapHref(city.key, params)
          : mapHref(params)
        : eventOnMapHref(state.event, params),
    );
  };
  function selectCity(key: string) {
    state.city = key;
    state.event = null;
    picking();
    setSheet(true);
  }
  const back = (words: string, fn: () => void): JSX.Element => (
    <button type="button" class="back-link" onClick={fn}>
      {'← '}
      {words}
    </button>
  );
  const count = (n: number) => plural(n, 'festival');

  // the cards of a list, a page at a time, each lighting its city's bubble while the pointer is on it
  function cards(list: readonly Placed[]): JSX.Element {
    const shown = paged(list, PAGE, (e) =>
      eventCard(e, { onMap: true, onHover: (on) => highlight(on ? e.city_key : undefined) }),
    );
    return (
      <div class="panel-cards">
        {shown.rows}
        {shown.more}
      </div>
    );
  }
  // back to every festival in view, from a city or a festival
  const toAll = (): JSX.Element =>
    back('All festivals in view', () => {
      state.event = null;
      state.city = null;
      picking();
    });
  // the festivals of the cities in view, soonest first
  const festivalsInView = (): Placed[] => {
    const b = lmap?.getBounds();
    return cities
      .filter((c) => b?.contains([c.lat, c.lon]) === true)
      .flatMap((c) => c.events)
      .sort((a, z) => a.start_date.localeCompare(z.start_date));
  };
  // The panel beside the map, drawn anew each time the map draws it: the festival picked, the city picked, or every
  // festival in view. A handler that draws it draws it at once (flush), before it returns; the bubbles' effect, within
  // Solid's flush, with them, a write Solid refuses in an effect's apply unless it is said to be meant (ownedWrite).
  const [panel, setPanel] = createSignal<Panel>({ kind: 'view', inView: [], total: 0 }, { ownedWrite: true });
  function renderPanel(): void {
    const e = state.event === null ? undefined : byId.get(state.event);
    if (e !== undefined) {
      setPanel({ kind: 'event', e, here: cities.find((c) => c.key === state.city)?.n ?? 1 });
      return;
    }
    // a city no longer on the map is no longer picked
    const c = state.city === null ? undefined : cities.find((x) => x.key === state.city);
    if (c) setPanel({ kind: 'city', c });
    else {
      state.city = null;
      const inView = festivalsInView();
      listed = inView.map((x) => x.id).join();
      setPanel({ kind: 'view', inView, total: cities.reduce((sum, x) => sum + x.n, 0) });
    }
  }
  const titleOf = (p: Panel): string =>
    p.kind === 'event'
      ? p.e.city
      : p.kind === 'city'
        ? `${flag(p.c.cc)} ${p.c.city} · ${count(p.c.n)}`
        : `${count(p.inView.length)} on the map`;
  const panelOf = (p: Panel): JSX.Element => {
    if (p.kind === 'event')
      return (
        <>
          {p.here > 1
            ? back(`${count(p.here)} in ${p.e.city}`, () => {
                state.event = null;
                save();
                renderPanel();
                flush();
              })
            : toAll()}
          {eventCard(p.e, { open: true, onMap: true })}
        </>
      );
    if (p.kind === 'city')
      return (
        <>
          {toAll()}
          <header class="panel-head">
            <h2>
              {flag(p.c.cc)} {p.c.city}
            </h2>
            <p>
              {count(p.c.n)}
              {p.c.minFare === null ? '' : ` · flights from ${money(p.c.minFare)}`}
            </p>
          </header>
          {cards(p.c.events)}
        </>
      );
    return (
      <>
        <header class="panel-head">
          <h2>{`${count(p.inView.length)} on the map`}</h2>
          <p>
            {p.inView.length < p.total
              ? 'Move the map to change the list, or pick a city.'
              : 'Pick a city to see only its festivals.'}
          </p>
        </header>
        {p.inView.length > 0 ? cards(p.inView) : <p class="muted">No festivals here with these filters.</p>}
      </>
    );
  };

  // The map, made once the view is first drawn, its element in the page (onSettled, measured), with its bubbles over
  // every festival shown, wherever it is, or, when the address picks one, a city closer, or the festival's; and taken
  // away with the view. On leaving, the map stops listening at once and is removed once Leaflet is done with it. A
  // zoom, which Leaflet can't cancel, starts on the frame after it is asked and ends 250 ms after it starts, reading the
  // map's panes, which remove() takes away; the frame can come late, after a slow page drawn in the map's place. So
  // the map waits for that frame (a zoom asked before it starts in it, ahead of this), then for the end of a zoom under
  // way, which Leaflet marks on the map's pane as its own dragging reads it.
  onSettled(() => {
    if (mapEl === undefined) throw new Error('the map was drawn with no element of its own');
    const made = L.map(mapEl, {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: false,
      maxBounds: dataBounds,
      maxBoundsViscosity: 1,
      inertia: false,
      zoomSnap: 0.25,
    }); // quarter steps fit the festivals tightly
    lmap = made;
    L.control.zoom({ position: 'topright' }).addTo(made);
    made.attributionControl.setPrefix(false);
    made.attributionControl.addAttribution('Borders: Natural Earth · Places: © OpenStreetMap');
    made.setView([50, 10], 4);
    lockZoom();
    made.on('resize', lockZoom);
    made.createPane('land').style.zIndex = '350';
    const land = L.layerGroup().addTo(made);
    bubbles = L.layerGroup().addTo(made);
    // the outline given up because the view was left is no failure: there is no map left to draw it on
    done(
      drawWorld(land, left).catch((e: unknown) => {
        if (!left.aborted) throw e;
      }),
      'drawing the map',
    );
    const Legend = L.Control.extend({ onAdd: () => legendEl });
    new Legend({ position: 'bottomleft' }).addTo(made);
    L.DomEvent.disableClickPropagation(legendEl);
    // once the map rests, the panel lists what is in view, unless that is what it lists already
    const settled = debounced(() => {
      if (
        !(picked() || left.aborted) &&
        festivalsInView()
          .map((e) => e.id)
          .join() !== listed
      ) {
        renderPanel();
        flush();
      }
    }, 120);
    made.on('moveend', settled);
    made.on('click', () => {
      if (picked()) {
        state.city = null;
        state.event = null;
        picking();
      }
      setSheet(false);
    });
    redraw({ fit: there.length === 0 });
    if (there[0]) {
      made.setView([there[0].lat, there[0].lon], Math.max(made.getZoom(), state.event === null ? 6 : 5));
      setSheetUp(true);
    }
    const settle = setTimeout(() => {
      made.invalidateSize();
      lockZoom();
    }, 0);
    return () => {
      clearTimeout(settle);
      made.off();
      requestAnimationFrame(() => {
        const pane = made.getPane('mapPane');
        if (pane !== undefined && L.DomUtil.hasClass(pane, 'leaflet-zoom-anim')) {
          made.once('zoomend', () => {
            made.remove();
          });
        } else made.remove();
      });
    };
  });
  // the bubbles drawn again for each change of the choices or of the words searched
  createEffect(
    drawnFor,
    redrawing(() => {
      redraw();
    }),
    { defer: true },
  );
  // Escape steps back from the festival or the city picked; an Escape that closes a dialog over the map (Flights) is the
  // dialog's alone: the key goes down while it is open
  onSettled(() => {
    const listening = new AbortController();
    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key !== 'Escape' || !picked() || document.querySelector('dialog[open]') !== null) return;
        if (state.event === null) state.city = null;
        else state.event = null;
        picking();
      },
      { signal: listening.signal },
    );
    return () => {
      listening.abort();
    };
  });
  return (
    <>
      {leftOut(dropped)}
      <section class="pmap">
        <div class="map-bar">
          {searchField({
            label: 'Search festivals',
            hint: 'Search a festival or city',
            heard: debounced((words: string) => {
              if (left.aborted) return;
              state.text = words;
              redrawn();
            }),
          })}
          {choices(
            WHEN,
            state.when,
            (v) => {
              state.when = v;
              chose();
            },
            { class: 'mini', label: 'When' },
          )}
          {filters.wrapped(
            'map-filters',
            <>{`Filters${filtersOn() ? ` (${filtersOn()})` : ''} ▾`}</>,
            <>
              <label class="field">
                <span>Colour the bubbles by</span>
                {choices(
                  COLORS,
                  state.color,
                  (v) => {
                    state.color = v;
                    chose();
                  },
                  { class: 'plain', label: 'Colour the bubbles by' },
                )}
              </label>
              {/* the country a link from Countries narrows the map to, shown here so it can be seen and changed */}
              <label class="field">
                <span>Country</span>
                {choices(
                  [['', 'Anywhere'], ...countriesOf.map((c): [string, string] => [c, `${flag(c)} ${countryName(c)}`])],
                  state.country,
                  (v) => {
                    state.country = v;
                    chose();
                  },
                  { class: 'plain', label: 'Country' },
                )}
              </label>
            </>,
          )}
        </div>
        <div class="map-split">
          <div
            ref={(el) => {
              mapEl = el;
            }}
            class="map"
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Leaflet's map, a region named for a screen reader, its markup kept as the h() map drew it during the port (revisit after 4.10)
            role="region"
            aria-label="Map of festivals by city"
          />
          <aside class={['map-panel', sheetUp() && 'up']}>
            <button
              ref={touched}
              type="button"
              class="sheet-handle"
              aria-expanded={sheetUp() ? 'true' : 'false'}
              onClick={() => setSheet(!sheetUp())}
              onTouchEnd={(ev) => {
                if (swiped(ev.changedTouches[0]?.clientY)) ev.preventDefault();
              }}
            >
              {/* a wide chevron that points the way the sheet will move, and a word saying what a tap does */}
              <span
                ref={(el) => {
                  Drawing.CHEVRON.into(el);
                }}
                class="chevron"
                aria-hidden="true"
              />
              <span class="sheet-row">
                <span class="sheet-title">{titleOf(panel())}</span>
                <span class="sheet-action">{sheetUp() ? 'Close' : 'Open'}</span>
              </span>
            </button>
            <div class="sheet-body" aria-live="polite">
              <Redrawn>
                <Show when={panel()} keyed>
                  {panelOf}
                </Show>
              </Redrawn>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

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
async function drawWorld(layer: L.LayerGroup, signal: AbortSignal): Promise<void> {
  if (!worldGeo) {
    const topo: unknown = await (await get(WORLD, { signal })).json();
    if (!isWorld(topo)) throw new Error(`${WORLD.pathname}: not the world topology`);
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
type Country = Feature<Polygon | MultiPolygon, { readonly name: string }>;
const isLand = (f: Feature<GeoJSON.Geometry | null, { readonly name: string }>): f is Country =>
  f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon';
function unwrap(feature: Feature<Polygon | MultiPolygon, { readonly name: string }>): Country {
  const ring = (r: readonly (readonly number[])[]): Position[] => {
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
