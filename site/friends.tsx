// Who's going where, the Friends tab without a person: the festivals to come that the people of a place said they're
// going to, by month, each with who teaches, goes or may go there (plans.tsx whoLines). Its places are the sub-tabs:
// near the site's home city, or everywhere. A short list is all there is; a long one gets a bar to narrow it: by
// friends (the festivals all of them go to, or any of them), by time, and by a festival's name or city. The choices
// live in the address.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { createSignal, flush, For, Show } from 'solid-js';
import { choices, chosen, dropdown, leftOut, searchField, segments } from './controls.tsx';
import { addDays, meets, weekendOf } from './days.ts';
import { dbDay, q, site, sql } from './db.ts';
import { fold } from './fold.ts';
import { nowTag } from './marks.tsx';
import { createDerived, Redrawn, type ViewProps } from './mount.tsx';
import { type Goer, goersOf, livingNear, NEAR_KM, whoLines, withPlans } from './plans.tsx';
import { changed, eventOnMapHref, friendsHref, personHref, readState } from './routes.ts';
import { EVENT, type RowOf } from './rows.ts';
import { KEY } from './states.ts';
import { dayMonth, dayRange, monthYear, place } from './ui.ts';
import { joined, joinedText, plural } from './wording.ts';

// a list longer than these gets the bar that narrows it
const FEW_FESTIVALS = 6;
const FEW_PEOPLE = 8;

export type Place = 'near' | 'everywhere';
type When = 'weekend' | 'months' | 'year';
// the choices of the list, as the address has them: its place, the friends ticked (keys, by commas), whether any of
// them going keeps a festival rather than all, the time ahead, and the words a festival's name or city has
interface Choices {
  readonly in: Place;
  readonly with: string;
  readonly any: number;
  readonly when: When;
  readonly q: string;
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

// the keys of the people sharing plans of a place: those living near the home city (plans.livingNear), or everyone
const peopleOf = (at: Place): Set<string> =>
  at === 'everywhere' ? new Set(withPlans().map((p) => p.key)) : livingNear();

type Festival = RowOf<typeof EVENT> & { readonly goers: readonly Goer[] };
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
function kept(all: readonly Festival[], s: Shown, day: string): Festival[] {
  const words = fold(s.q.trim());
  return all.filter((e) => {
    const inTime = s.when === 'weekend' ? meets(e, weekendOf(day)) : e.start_date <= addDays(day, DAYS_AHEAD[s.when]);
    const said = words === '' || fold(`${e.title} ${e.city ?? ''}`).includes(words);
    const going = new Set(e.goers.map((g) => g.key));
    const ticked = [...s.ticked];
    const together =
      ticked.length === 0 || (s.any ? ticked.some((k) => going.has(k)) : ticked.every((k) => going.has(k)));
    return inTime && said && together;
  });
}

// what the list shows: the choices, but for the friends ticked, a set of their keys in the order they were ticked
type Shown = Omit<Choices, 'with'> & { readonly ticked: ReadonlySet<string> };

export function friends({ qs }: ViewProps): JSX.Element {
  const { state: asked, dropped } = readState(qs, DEFAULTS, {
    in: ['near', 'everywhere'],
    any: [0, 1],
    when: WHEN.map(([v]) => v),
  });
  const people = peopleOf(asked.in);
  const all = festivalsOf(people);
  const sharing: Shares[] = withPlans().filter((p) => people.has(p.key));
  const { with: withKeys, ...rest } = asked;
  const first: Shown = { ...rest, ticked: new Set(withKeys.split(',').filter((k) => people.has(k))) };
  // in the defaults' order, as the address had them
  const [s, set] = chosen(first, ({ ticked, ...now }) =>
    friendsHref(changed({ ...DEFAULTS, ...now, with: [...ticked].join(',') }, DEFAULTS)),
  );
  const tick = (key: string, on: boolean) => {
    const ticked = new Set(s().ticked);
    if (on) ticked.add(key);
    else ticked.delete(key);
    set({ ticked });
  };
  // the words that narrow the friends to tick, which the address does not keep
  const [find, setFind] = createSignal('');
  const long = all.length > FEW_FESTIVALS || sharing.length > FEW_PEOPLE;
  const filtering = first.ticked.size > 0 || asked.q !== '' || asked.when !== DEFAULTS.when;
  const where = asked.in === 'near' ? `near ${site().home.city}` : 'anywhere';
  // the list as the choices keep it, drawn anew with them; the bar's count what it last was, should it throw
  const { drawn, last } = createDerived(() => ({ now: s(), rows: kept(all, s(), dbDay()) }));
  // how many of the festivals the list keeps, out of all
  const counted = ({ now, rows }: { readonly now: Shown; readonly rows: readonly Festival[] }) =>
    rows.length === all.length
      ? plural(all.length, 'festival')
      : `${rows.length} of ${plural(all.length, 'festival')}${now.ticked.size > 1 && !now.any ? ' in common' : ''}`;
  let bar: HTMLDivElement | undefined;
  const friendsPicker = dropdown(() => [bar]);

  // the friends to tick: the ticked first, then everyone else of the place, a search narrowing them; drawn anew as the
  // choices or the search change, as the h() picker was
  const upcoming = (key: string) => all.filter((e) => e.goers.some((g) => g.key === key)).length;
  const tickRow = (p: { readonly key: string; readonly name: string }, on: boolean): JSX.Element => (
    <label class="pick-row">
      <input type="checkbox" defaultChecked={on} onChange={(ev) => tick(p.key, ev.currentTarget.checked)} />
      <span>{p.name}</span>
      <span class="muted">{plural(upcoming(p.key), 'festival')}</span>
    </label>
  );
  const pickList = ({ now, words }: { readonly now: Shown; readonly words: string }): JSX.Element => {
    const others = sharing.filter((p) => !now.ticked.has(p.key) && fold(p.name).includes(words));
    return (
      <>
        {now.ticked.size > 0 ? (
          <>
            <p class="pick-head">Ticked</p>
            <For each={sharing.filter((p) => now.ticked.has(p.key))}>{(p) => tickRow(p, true)}</For>
          </>
        ) : null}
        <p class="pick-head">{`Everyone ${where} · ${others.length}`}</p>
        <div class="pick-scroll">
          <For each={others}>{(p) => tickRow(p, false)}</For>
        </div>
      </>
    );
  };
  const pickFoot = (now: Shown): JSX.Element => (
    <>
      {now.ticked.size > 0 ? `${now.ticked.size} ticked` : 'Tick friends to see their festivals'}
      {now.ticked.size > 0 ? (
        <button type="button" class="link" onClick={() => set({ ticked: new Set() })}>
          Clear
        </button>
      ) : null}
    </>
  );

  // why the list is empty, and the way out: no one shares plans; ticked friends with nothing in common, and the
  // festivals any of them goes to; or other choices that keep nothing
  const none = (now: Shown): JSX.Element => {
    if (all.length === 0) return <p class="muted">{`No one ${where} has shared plans yet.`}</p>;
    if (now.ticked.size > 1 && !now.any && kept(all, { ...now, any: 1 }, dbDay()).length > 0)
      return (
        <p class="muted">
          {`${joinedText(sharing.filter((p) => now.ticked.has(p.key)).map((p) => p.name))} have no festival in common. `}
          <button type="button" class="link" onClick={() => set({ any: 1 })}>
            Show those any of them goes to
          </button>
        </p>
      );
    return <p class="muted">No festival matches these choices.</p>;
  };

  return (
    <>
      {leftOut(dropped)}
      <article class="artist-profile">
        <header class="profile-head">
          <h1>Who’s going where</h1>
          {head(all, sharing, asked.in)}
        </header>
        {long || filtering ? (
          <div
            ref={(el) => {
              bar = el;
            }}
            class={['sticky-bar', 'shown']}
            aria-label="Filters"
          >
            <div class="bar-inner">
              {friendsPicker.button(
                'friends-picker',
                <>{`Friends${s().ticked.size > 0 ? ` (${s().ticked.size})` : ''} ▾`}</>,
              )}
              {choices(WHEN, asked.when, (when) => set({ when }), { class: 'mini', label: 'When' })}
              {searchField({
                label: 'Festival or city',
                hint: 'Festival or city',
                first: asked.q,
                heard: (q_) => set({ q: q_ }),
              })}
              <span class="bar-count">{counted(last())}</span>
            </div>
            <div class={['more-panel', 'picker']} id="friends-picker" hidden={!friendsPicker.open()}>
              {searchField({
                label: 'Find a friend',
                hint: 'Find a friend',
                heard: (words) => {
                  flush(() => {
                    setFind(words);
                  });
                },
              })}
              {segments(
                'Which festivals',
                [
                  ['all', 'All of them go'],
                  ['any', 'Any of them goes'],
                ] as const,
                () => (s().any ? 'any' : 'all'),
                (v) => set({ any: v === 'any' ? 1 : 0 }),
              )}
              <div class="pick-list">
                <Show when={{ now: s(), words: fold(find().trim()) }} keyed>
                  {pickList}
                </Show>
              </div>
              <p class="pick-foot">
                <Show when={s()} keyed>
                  {pickFoot}
                </Show>
              </p>
            </div>
          </div>
        ) : null}
        <div class="who-list">
          <Redrawn>
            <Show when={drawn()} keyed>
              {({ now, rows }) => (rows.length > 0 ? byMonth(rows, now.ticked) : none(now))}
            </Show>
          </Redrawn>
        </div>
      </article>
    </>
  );
}

// Under the title, as a page's head says it: who shares plans, named while they are few, else how many and where
// ("29 people within 200 km of Bergen share their plans."); then, muted, who is away now and who goes next, by the
// festivals' cities, each opening the festival on the map ("Now: Glasgow (2) · Next: Oslo, 20 Nov"); with more than
// NOW_NAMED festivals on, how many, and where most are
const NOW_NAMED = 2;
function head(all: readonly Festival[], sharing: readonly Shares[], at: Place): JSX.Element {
  const now = all.filter((e) => e.phase === KEY.phase.ON).sort((a, b) => b.goers.length - a.goers.length);
  const next = all.find((e) => e.phase === KEY.phase.AHEAD); // the list comes soonest first
  const city = (e: Festival) => (
    <a href={eventOnMapHref(e.id)} class="artist" title={e.title}>
      {e.city ?? e.title}
    </a>
  );
  const counted = (e: Festival) => [city(e), ` (${e.goers.length})`];
  const within = at === 'near' ? ` within ${NEAR_KM} km of ${site().home.city}` : '';
  const who =
    sharing.length > FEW_PEOPLE ? (
      <>
        <b>{plural(sharing.length, 'person', 'people')}</b>
        {`${within} share their plans.`}
      </>
    ) : (
      <>
        {joined(
          sharing.map((p) => (
            <a href={personHref(p.key)} class="artist">
              {p.name}
            </a>
          )),
        )}
        {sharing.length === 1 ? ' shares their plans.' : ' share their plans.'}
      </>
    );
  const [top] = now;
  const away =
    top === undefined ? null : now.length <= NOW_NAMED ? (
      <>
        {'Now: '}
        {joined(now.map(counted))}
      </>
    ) : (
      <>
        {'Now: '}
        <b>{plural(now.length, 'festival')}</b>
        {', most in '}
        {counted(top)}
      </>
    );
  const coming =
    next === undefined ? null : (
      <>
        {'Next: '}
        {city(next)}
        {`, ${dayMonth(next.start_date)}`}
      </>
    );
  const when = [away, coming].filter((x) => x !== null);
  return (
    <>
      {sharing.length > 0 ? <p class="lede">{who}</p> : null}
      {when.length > 0 ? (
        <p class={['community-next', 'muted']}>{when.flatMap((x, i) => (i === 0 ? [x] : [' · ', x]))}</p>
      ) : null}
    </>
  );
}

// the festivals under their months: "November 2026 · 3 festivals", then each festival's row
function byMonth(shown: readonly Festival[], ticked: ReadonlySet<string>): JSX.Element {
  const months = new Map<string, Festival[]>();
  for (const e of shown) months.set(e.start_date.slice(0, 7), [...(months.get(e.start_date.slice(0, 7)) ?? []), e]);
  return [...months.values()].map((es) => [
    <h3 class="month-head">{`${monthYear(es[0]?.start_date ?? '')} · ${plural(es.length, 'festival')}`}</h3>,
    <ul class="who-rows">
      <For each={es}>
        {(e) => (
          <li>
            <div class="who-top">
              <span>
                {nowTag(e)}
                <a href={eventOnMapHref(e.id)} class="who-name">
                  {e.title}
                </a>
                <span class="muted">
                  {' · '}
                  {place(e)}
                </span>
              </span>
              <span class="who-when">{dayRange(e.start_date, e.end_date)}</span>
            </div>
            {whoLines(e, ticked)}
          </li>
        )}
      </For>
    </ul>,
  ]);
}
