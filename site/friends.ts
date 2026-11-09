// Who's going where, the Friends tab without a person: the festivals to come that the people of a place said they're
// going to, by month, each with who teaches, goes or may go there (plans.ts whoLines). Its places are the sub-tabs:
// near the site's home city, or everywhere. A short list is all there is; a long one gets a bar to narrow it: by
// friends (the festivals all of them go to, or any of them), by time, and by a festival's name or city. The choices
// live in the address.
import { addDays, meets, today, weekendOf } from './days.ts';
import { one, q, site, sql } from './db.ts';
import { button, choices, dropdown, h, type Kid, moreButton, nodes, segments } from './dom.ts';
import { leftOut } from './festivals.ts';
import { fold } from './fold.ts';
import { type Goer, goersOf, whoLines, withPlans } from './plans.ts';
import { changed, eventOnMapHref, friendsHref, personHref, readState, showInAddressBar } from './routes.ts';
import { EVENT, num, type RowOf, str } from './rows.ts';
import { KEY } from './states.ts';
import { dayMonth, dayRange, monthYear, nowTag, place } from './ui.ts';
import { joined, joinedText, plural } from './wording.ts';

// how far from a place someone lives and is near it, in km
export const NEAR_KM = 200;
// a list longer than these gets the bar that narrows it
const FEW_FESTIVALS = 6;
const FEW_PEOPLE = 8;
// with this many people or more, the line over the list says where most of them go
const MANY_PEOPLE = 8;

export type Place = 'near' | 'everywhere';
type When = 'weekend' | 'months' | 'year';
// the choices of the list, as the address has them: its place, the friends ticked (keys, by commas), whether any of
// them going keeps a festival rather than all, the time ahead, and the words a festival's name or city has
interface Choices {
  in: Place;
  with: string;
  any: number;
  when: When;
  q: string;
}
const DEFAULTS: Readonly<Choices> = { in: 'near', with: '', any: 0, when: 'year', q: '' };
const WHEN: readonly (readonly [When, string])[] = [
  ['weekend', 'This weekend'],
  ['months', '3 months'],
  ['year', '1 year'],
];
const DAYS_AHEAD = { months: 91, year: 365 } as const;
// the place a Friends address names, near when it names none
export const placeOf = (qs: string): Place =>
  new URLSearchParams(qs).get('in') === 'everywhere' ? 'everywhere' : 'near';
// the sub-tabs, as main.ts draws them under the header: [place, words, address]
export const friendsTabs = (): readonly (readonly [Place, string, string])[] => [
  ['near', `Near ${site().home.city}`, friendsHref()],
  ['everywhere', 'Everywhere', friendsHref({ in: 'everywhere' })],
];

interface Spot {
  lat: number;
  lon: number;
}
// the kilometres between two places, on a round Earth
function kmBetween(a: Spot, b: Spot): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h2 =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h2));
}
// the site's home city, where the people near are looked for
const homeCity = () =>
  one({ lat: num, lon: num }, sql`SELECT lat, lon FROM cities WHERE key = ?`, [site().home.city_key]);
// the keys of the people sharing plans of a place: those living within NEAR_KM of the home city (those who have not
// said where they live never), or everyone
function peopleOf(at: Place): Set<string> {
  if (at === 'everywhere') return new Set(withPlans().map((p) => p.key));
  const home = homeCity();
  if (home === undefined) return new Set();
  return new Set(
    q({ key: str, lat: num, lon: num }, sql`SELECT p.key, c.lat, c.lon FROM people p JOIN cities c ON c.key = p.home`)
      .filter((p) => kmBetween(home, p) <= NEAR_KM)
      .map((p) => p.key),
  );
}

type Festival = RowOf<typeof EVENT> & { goers: Goer[] };
// someone sharing plans, and how many of their festivals are to come
type Shares = ReturnType<typeof withPlans>[number];
// the festivals to come some of these people go to, soonest first, each with those of them going
function festivalsOf(people: ReadonlySet<string>): Festival[] {
  return q(
    EVENT,
    sql`SELECT e.* FROM event_rows e WHERE e.upcoming AND e.id IN (SELECT event_id FROM plans)
      ORDER BY e.start_date, e.title`,
  ).flatMap((e) => {
    const goers = goersOf(e.id).filter((g) => people.has(g.key));
    return goers.length > 0 ? [{ ...e, goers }] : [];
  });
}

// the festivals the choices keep: within the time, matching the words, and gone to by all the friends ticked (or any)
function kept(all: readonly Festival[], s: Choices, ticked: ReadonlySet<string>, day: string): Festival[] {
  const words = fold(s.q.trim());
  return all.filter((e) => {
    const inTime = s.when === 'weekend' ? meets(e, weekendOf(day)) : e.start_date <= addDays(day, DAYS_AHEAD[s.when]);
    const said = words === '' || fold(`${e.title} ${e.city ?? ''}`).includes(words);
    const going = new Set(e.goers.map((g) => g.key));
    const friends =
      ticked.size === 0 || (s.any ? [...ticked].some((k) => going.has(k)) : [...ticked].every((k) => going.has(k)));
    return inTime && said && friends;
  });
}

export function friendsView(root: HTMLElement, qs: string, signal: AbortSignal): void {
  const { state: s, dropped } = readState(qs, DEFAULTS, {
    in: ['near', 'everywhere'],
    any: [0, 1],
    when: WHEN.map(([v]) => v),
  });
  const people = peopleOf(s.in);
  const all = festivalsOf(people);
  const sharing: Shares[] = withPlans().filter((p) => people.has(p.key));
  const ticked = new Set(s.with.split(',').filter((k) => people.has(k)));
  const long = all.length > FEW_FESTIVALS || sharing.length > FEW_PEOPLE;
  const filtering = ticked.size > 0 || s.q !== '' || s.when !== DEFAULTS.when;
  const where = s.in === 'near' ? `near ${site().home.city}` : 'anywhere';

  const count = h('span', { class: 'bar-count' });
  const list = h('div', { class: 'who-list' });
  const friendsBtn = moreButton('friends-picker');
  const picker = h('div', { class: ['more-panel', 'picker'], id: 'friends-picker', hidden: true });
  const search = h('input', {
    class: 'mini-search',
    type: 'search',
    placeholder: 'Festival or city',
    'aria-label': 'Festival or city',
    value: s.q,
    oninput: () => {
      s.q = search.value;
      render();
    },
  });
  const bar = h(
    'div',
    { class: ['sticky-bar', 'shown'], 'aria-label': 'Filters' },
    h(
      'div',
      { class: 'bar-inner' },
      friendsBtn,
      choices(
        WHEN,
        s.when,
        (v) => {
          s.when = v;
          render();
        },
        { class: 'mini', 'aria-label': 'When' },
      ),
      search,
      count,
    ),
    picker,
  );
  dropdown(friendsBtn, picker, [bar], signal);

  // the friends to tick: the ticked first, then everyone else of the place, a search narrowing them
  const find = h('input', {
    class: 'mini-search',
    type: 'search',
    placeholder: 'Find a friend',
    'aria-label': 'Find a friend',
    oninput: () => paintPicker(),
  });
  const mode = h('div', { class: 'seg', role: 'group', 'aria-label': 'Which festivals' });
  const pickList = h('div', { class: 'pick-list' });
  const pickFoot = h('p', { class: 'pick-foot' });
  picker.append(find, mode, pickList, pickFoot);
  const upcoming = (key: string) => all.filter((e) => e.goers.some((g) => g.key === key)).length;
  function tickRow(p: { key: string; name: string }): HTMLElement {
    const box = h('input', {
      type: 'checkbox',
      checked: ticked.has(p.key),
      onchange: () => {
        if (box.checked) ticked.add(p.key);
        else ticked.delete(p.key);
        render();
      },
    });
    return h(
      'label',
      { class: 'pick-row' },
      box,
      h('span', {}, p.name),
      h('span', { class: 'muted' }, plural(upcoming(p.key), 'festival')),
    );
  }
  function paintPicker(): void {
    mode.replaceChildren(
      ...segments(
        [
          ['all', 'All of them go'],
          ['any', 'Any of them goes'],
        ] as const,
        s.any ? 'any' : 'all',
        (v) => {
          s.any = v === 'any' ? 1 : 0;
          render();
        },
      ),
    );
    const words = fold(find.value.trim());
    const others = sharing.filter((p) => !ticked.has(p.key) && fold(p.name).includes(words));
    pickList.replaceChildren(
      ...(ticked.size > 0
        ? [h('p', { class: 'pick-head' }, 'Ticked'), ...sharing.filter((p) => ticked.has(p.key)).map(tickRow)]
        : []),
      h('p', { class: 'pick-head' }, `Everyone ${where} · ${others.length}`),
      h('div', { class: 'pick-scroll' }, others.map(tickRow)),
    );
    pickFoot.replaceChildren(
      ...nodes([ticked.size > 0 ? `${ticked.size} ticked` : 'Tick friends to see their festivals']),
      ...nodes([
        ticked.size > 0
          ? button(
              {
                class: 'link',
                onclick: () => {
                  ticked.clear();
                  render();
                },
              },
              'Clear',
            )
          : null,
      ]),
    );
  }

  // why the list is empty, and the way out: no one shares plans; ticked friends with nothing in common, and the
  // festivals any of them goes to; or other choices that keep nothing
  function none(): HTMLElement {
    if (all.length === 0) return h('p', { class: 'muted' }, `No one ${where} has shared plans yet.`);
    if (ticked.size > 1 && !s.any && kept(all, { ...s, any: 1 }, ticked, today()).length > 0)
      return h(
        'p',
        { class: 'muted' },
        `${joinedText(sharing.filter((p) => ticked.has(p.key)).map((p) => p.name))} have no festival in common. `,
        button(
          {
            class: 'link',
            onclick: () => {
              s.any = 1;
              render();
            },
          },
          'Show those any of them goes to',
        ),
      );
    return h('p', { class: 'muted' }, 'No festival matches these choices.');
  }

  function render(): void {
    s.with = [...ticked].join(',');
    showInAddressBar(friendsHref(changed(s, DEFAULTS)));
    friendsBtn.replaceChildren(`Friends${ticked.size > 0 ? ` (${ticked.size})` : ''} ▾`);
    paintPicker();
    const day = today();
    const shown = kept(all, s, ticked, day);
    count.textContent =
      shown.length === all.length
        ? plural(all.length, 'festival')
        : `${shown.length} of ${plural(all.length, 'festival')}${ticked.size > 1 && !s.any ? ' in common' : ''}`;
    list.replaceChildren(...(shown.length > 0 ? byMonth(shown, ticked) : [none()]));
  }

  root.replaceChildren(
    h(
      'article',
      { class: 'artist-profile' },
      h('header', { class: 'profile-head' }, h('h1', {}, 'Who’s going where'), overview(all, sharing, s.in)),
      long || filtering ? bar : null,
      list,
    ),
  );
  leftOut(root, dropped);
  render();
}

// The panel under the title, as labelled lines like the rows': who shares plans (named, with how many festivals each,
// when they are few; else how many), who is away now (the two festivals with the most people named, the rest counted),
// who goes next, and, with many people, the festival most of them go to when no line above names it; each festival
// opening on the map
const NOW_NAMED = 2;
function overview(all: readonly Festival[], sharing: readonly Shares[], at: Place): HTMLElement | null {
  const d = today();
  const now = all.filter((e) => e.phase === KEY.phase.ON).sort((a, b) => b.goers.length - a.goers.length);
  const next = all.find((e) => e.start_date > d);
  const top = sharing.length >= MANY_PEOPLE ? [...all].sort((a, b) => b.goers.length - a.goers.length)[0] : undefined;
  // most of them go to it, unless a line above names it already
  const most = top === undefined || top === next || now.slice(0, NOW_NAMED).includes(top) ? undefined : top;
  const named = (e: Festival) => [
    h('a', { href: eventOnMapHref(e.id), class: 'who-name' }, e.title),
    h('span', { class: 'muted' }, ` (${e.goers.length})`),
  ];
  const line = (label: string, ...what: Kid[]) =>
    h('p', {}, h('span', { class: 'who-label' }, label), h('span', {}, ...nodes(what)));
  const within = at === 'near' ? ` within ${NEAR_KM} km of ${site().home.city}` : '';
  const rest = now.length - NOW_NAMED;
  const lines = [
    sharing.length === 0
      ? null
      : sharing.length > FEW_PEOPLE
        ? line('Who', `${plural(sharing.length, 'person', 'people')}${within}`)
        : line(
            'Who',
            joined(
              sharing.map((p) => [
                h('a', { href: personHref(p.key), class: 'artist' }, p.name),
                h('span', { class: 'muted' }, ` (${p.upcoming})`),
              ]),
            ),
          ),
    now.length > 0
      ? line('Now', joined([...now.slice(0, NOW_NAMED).map(named), ...(rest > 0 ? [`${rest} more`] : [])]))
      : null,
    next === undefined ? null : line('Next', named(next), `, from ${dayMonth(next.start_date)}`),
    most === undefined ? null : line('Most', named(most)),
  ].filter((x) => x !== null);
  return lines.length === 0 ? null : h('div', { class: ['who-lines', 'now-next'] }, lines);
}

// the festivals under their months: "November 2026 · 3 festivals", then each festival's row
function byMonth(shown: readonly Festival[], ticked: ReadonlySet<string>): HTMLElement[] {
  const months = new Map<string, Festival[]>();
  for (const e of shown) months.set(e.start_date.slice(0, 7), [...(months.get(e.start_date.slice(0, 7)) ?? []), e]);
  return [...months.values()].flatMap((es) => [
    h('h3', { class: 'month-head' }, `${monthYear(es[0]?.start_date ?? '')} · ${plural(es.length, 'festival')}`),
    h(
      'ul',
      { class: 'who-rows' },
      es.map((e) =>
        h(
          'li',
          {},
          h(
            'div',
            { class: 'who-top' },
            h(
              'span',
              {},
              nowTag(e),
              h('a', { href: eventOnMapHref(e.id), class: 'who-name' }, e.title),
              h('span', { class: 'muted' }, ' · ', place(e)),
            ),
            h('span', { class: 'who-when' }, dayRange(e.start_date, e.end_date)),
          ),
          whoLines(e, ticked),
        ),
      ),
    ),
  ]);
}
