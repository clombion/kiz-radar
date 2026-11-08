// A community's page (pipeline/communities.csv, community_members.csv, seeded.csv, travel.csv, stays.csv): who is in it, when most
// of it is away, the months it is away in, and an agenda of its trips, each opening on who travels when. It is public,
// as everything the site shows is: no tab links to it, but its data is in the site's database, which anyone can read
// (the SQL page). Its members and the people its manager added, who have not joined, are named;
// an added one's name says on hover who added them. Members say how they travel; the people added never do.
import {
  type Away,
  awayDays,
  busiest,
  type Day,
  inPeriod,
  type Moment,
  moment,
  periodSaid,
  periods,
  presence,
  relativeDay,
  spanOf,
  weekday3,
} from './calendar.ts';
import { addDays } from './days.ts';
import { one, q, sql } from './db.ts';
import { button, h, type Kid, nodes } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { type Festival, withDetails } from './festivals.ts';
import { dayTimeAt, gantt, ganttByPlace, timeAt, unsaidEnd } from './gantt.ts';
import { Drawing } from './icons.ts';
import { months, popover } from './months.ts';
import { page, personLink, shareButton } from './people.ts';
import { couplesAmong, doingTag, type Goer, goersInline, namesOf } from './plans.ts';
import { byPlace, type Flights, type Goes, type Line, type Place, roster, type Stay, type Unit } from './roster.ts';
import {
  artistHref,
  communityHref,
  communityShareHref,
  eventOnMapHref,
  readState,
  showInAddressBar,
} from './routes.ts';
import { type Booked, booked, EVENT, num, opt, str } from './rows.ts';
import { KEY } from './states.ts';
import { dayMonth, dayParts, dayRange, monthShort, monthYear, place, weekDay } from './ui.ts';
import { joined, joinedText, plural, text } from './wording.ts';

// A community as its page reads it, which is what a server will give one of its members. For now it is read from
// the site database.
interface Member {
  key: string;
  name: string;
}
// someone the manager added: their name, and what they are booked as at the festival (from the line-up, never from
// the manager) with the artist record that booking links to
interface Added {
  id: number; // its row of community_seeded: two people added may share a first name
  name: string;
  booked_as: Booked | null;
  artist: number | null;
}
// how a member travels to a festival, each end when they said it: arrive and leave as local times, YYYY-MM-DDTHH:MM
const TRAVEL = { key: str, arrive: opt(str), arrive_at: opt(str), leave: opt(str), leave_from: opt(str) } as const;
// where a member stays, from a night to a night
const STAY = { key: str, first: str, last: str, place: str } as const;
interface Going {
  members: string[]; // the keys of its members going
  added: Added[]; // the people its manager added who are going, in the order they were added
  travel: Map<string, Flights>; // how its members going travel there, by key, those who said
  stays: Map<string, Stay[]>; // where they stay, by key, night after night
}
interface Community {
  key: string;
  name: string;
  manager: Member;
  members: Member[];
  festivals: ReadonlyMap<number, Going>; // by festival, every one any of them goes to, past ones too
}

// the community at this key, or null when there is none
function communityOf(key: string): Community | null {
  const c = one(
    { id: num, key: str, name: str, manager_key: str, manager_name: str },
    sql`SELECT c.id, c.key, c.name, p.key AS manager_key, p.name AS manager_name
    FROM communities c JOIN people p ON p.id = c.manager_id WHERE c.key = ?`,
    [key],
  );
  if (c === undefined) return null;
  const members = q(
    { key: str, name: str },
    sql`SELECT p.key, p.name FROM community_members m JOIN people p ON p.id = m.person_id
    WHERE m.community_id = ?`,
    [c.id],
  ).toSorted((a, b) => a.name.localeCompare(b.name)); // by name as it is said, Cédric before Christina
  // each plan and each added person is going: going is a plan's one state, as every page of plans reads it
  const festivals = new Map<number, Going>();
  const at = (id: number): Going => {
    const f = festivals.get(id) ?? { members: [], added: [], travel: new Map(), stays: new Map() };
    festivals.set(id, f);
    return f;
  };
  for (const r of q(
    { event_id: num, key: str },
    sql`SELECT pl.event_id, p.key FROM community_members m JOIN plans pl ON pl.person_id = m.person_id
    JOIN people p ON p.id = m.person_id WHERE m.community_id = ?`,
    [c.id],
  ))
    at(r.event_id).members.push(r.key);
  for (const r of q(
    { id: num, event_id: num, name: str, booked_as: opt(booked), artist_id: opt(num) },
    sql`SELECT id, event_id, name, booked_as, artist_id FROM seeded_rows WHERE community_id = ? ORDER BY id`,
    [c.id],
  ))
    at(r.event_id).added.push({
      id: r.id,
      name: r.name,
      booked_as: r.booked_as,
      artist: r.booked_as === null ? null : r.artist_id,
    });
  for (const { event_id, key: who, ...flights } of q(
    { event_id: num, ...TRAVEL },
    sql`SELECT t.event_id, p.key, t.arrive, t.arrive_at, t.leave, t.leave_from FROM travel t
    JOIN community_members m ON m.person_id = t.person_id JOIN people p ON p.id = t.person_id WHERE m.community_id = ?`,
    [c.id],
  ))
    at(event_id).travel.set(who, flights);
  for (const { event_id, key: who, ...stay } of q(
    { event_id: num, ...STAY },
    sql`SELECT s.event_id, p.key, s.first_night AS first, s.last_night AS last, s.place FROM stays s
    JOIN community_members m ON m.person_id = s.person_id JOIN people p ON p.id = s.person_id WHERE m.community_id = ?
    ORDER BY s.first_night`,
    [c.id],
  )) {
    const f = at(event_id);
    f.stays.set(who, [...(f.stays.get(who) ?? []), stay]);
  }
  return {
    key: c.key,
    name: c.name,
    manager: { key: c.manager_key, name: c.manager_name },
    members,
    festivals,
  };
}

// someone of the community away for a festival: a member, with how they travel and where they stay when they said,
// or someone the manager added
interface Present extends Away {
  e: Festival;
  goer: Goer | null;
  added: Added | null;
  travel: Flights | null;
  stays: Stay[];
}
// a festival the community goes to: who of it goes, who is away for it from when to when, the days of the whole trip
// (spanOf), and where it stands on the day: on, or ended, or else ahead
interface Visit {
  e: Festival;
  who: ReturnType<typeof whoGoes>;
  aways: Present[];
  span: { from: string; to: string };
  on: boolean; // from its first day to its last
  ended: boolean; // from the day after its last
  off: string | null; // what its card says when the festival is cancelled or no longer listed, members still going
}

export function communityView(root: HTMLElement, [key]: readonly string[], qs: string, signal: AbortSignal): void {
  const c = key === undefined ? null : communityOf(key);
  if (c === null) {
    root.replaceChildren(h('p', {}, 'No community at this link.'));
    return;
  }
  const today = one({ day: str }, sql`SELECT day FROM today`)?.day ?? '';
  // its festivals to come and those ended: a trip goes on after its festival ends while someone is still there
  const events = withDetails(
    q(EVENT, sql`SELECT * FROM event_rows WHERE id IN (SELECT value FROM json_each(?)) ORDER BY start_date`, [
      JSON.stringify([...c.festivals.keys()]),
    ]),
  ).flatMap((e) => {
    const f = c.festivals.get(e.id);
    return f === undefined ? [] : [{ e, f, who: whoGoes(e, f, c.manager) }];
  });
  // who of it is away for each festival, and on each day: one count for the sentence and the months alike
  const trips: Visit[] = events.map(({ e, f, who }) =>
    visit(today, e, who, [
      ...who.goers.map((g): Present => {
        const travel = f.travel.get(g.key) ?? null,
          stays = f.stays.get(g.key) ?? [];
        const [first, last] = [stays[0], stays.at(-1)];
        const nights = first && last ? { first: first.first, last: last.last } : null;
        const away = awayDays(e, { arrive: travel?.arrive ?? null, leave: travel?.leave ?? null, nights });
        return { who: `member ${g.key}`, ...away, e, goer: g, added: null, travel, stays };
      }),
      ...f.added.map(
        (a): Present => ({ who: `added ${a.id}`, ...awayDays(e), e, goer: null, added: a, travel: null, stays: [] }),
      ),
    ]),
  );
  // the trips not ended: the agenda's, the sentence's and the counts'; an ended one stays in the calendar, greyed
  const current = trips.filter((t) => !t.ended);
  const days = presence(trips.flatMap((t) => t.aways));
  const most = busiest(presence(current.filter((t) => t.off === null).flatMap((t) => t.aways)));
  const members = plural(c.members.length, 'member');
  // the period the calendar shows, from the address (?from=2027-02) when it is one it steps through, else today's;
  // the agenda under it its trips, those with a day in it, so that every day the calendar shows has its trips there.
  // The sentence and "Now" or "Next" are of every trip not ended.
  const steps = periods(today, [...days.keys()].toSorted((a, b) => a.localeCompare(b)).at(-1));
  const asked = readState(qs, { from: '' }).state.from;
  const from = steps.includes(asked) ? asked : (steps[0] ?? today.slice(0, 7));
  const plan = h('section', { class: 'agenda' }, agenda(current, today, c.manager, from));
  const moved = (to: string) => {
    plan.replaceChildren(...nodes(agenda(current, today, c.manager, to)));
    showInAddressBar(communityHref(c.key, { from: to === steps[0] ? null : to }));
  };
  document.title = `${c.name} · Kiz Radar`; // as its own page's title says it
  page(
    root,
    [
      c.name,
      most === undefined
        ? null
        : h(
            'p',
            { class: 'community-when' },
            'Most people are travelling ',
            h('b', {}, unbroken(dayRange(most.from, most.to))),
            `: ${unbroken(plural(most.people, 'person', 'people'))}, to ${placesOf(most.aways)}.`,
          ),
      nowAndNext(current, today),
      h(
        'div',
        { class: 'share-row' },
        shareButton('Share this page', c.name, communityShareHref(c.key)),
        h(
          'span',
          {
            class: 'privacy',
            role: 'img',
            'aria-label': `Public · anyone can see this page · ${members}`,
            title: `Public · anyone can see this page · ${members}`,
          },
          Drawing.LOCK.into(h('span', { 'aria-hidden': 'true' })),
          Drawing.PEOPLE.into(h('span', { 'aria-hidden': 'true' })),
          h('span', { 'aria-hidden': 'true' }, c.members.length),
        ),
      ),
    ],
    // the months, while a trip is to come or one ended shows in them
    current.length > 0 || trips.some((t) => t.aways.some((a) => inPeriod(from, a)))
      ? months({
          today,
          days,
          label: (d, on) =>
            `${weekDay(d)}: ${plural(on.people, 'person', 'people')} ${
              on.aways.every((a) => atFestival(a, d)) ? 'at the festival in' : 'travelling to'
            } ${placesOf(on.aways)}`,
          festivals: trips.map(({ e, who, ended, off }) => ({
            ...e,
            people: who.people,
            ended: ended || off !== null,
          })),
          // the days someone travels on outside their festival's days: the day before it they arrive, the day after
          travel: new Set([...days].flatMap(([d, on]) => (on.aways.some((a) => !atFestival(a, d)) ? [d] : []))),
          pop: popover((d) => dayDetail(d, days.get(d), c.manager), signal),
          from,
          steps,
          moved,
        })
      : null,
    current.length > 0
      ? plan
      : h(
          'p',
          { class: 'muted' },
          trips.length > 0 ? 'No trips coming up.' : 'No one in this community has said they’re going anywhere yet.',
        ),
    h(
      'section',
      {},
      h('h2', {}, 'Members'),
      h(
        'p',
        {},
        joined(
          c.members.map((m) => [
            personLink(m),
            m.key === c.manager.key ? h('span', { class: 'muted' }, ' manager') : null,
          ]),
        ),
      ),
    ),
  );
}

// a trip: its days, from the first of the community to arrive to the last to leave, or the festival's when sooner or
// later, and where it stands on the day: on from its first day to its last, ended from the day after
function visit(today: string, e: Festival, who: Visit['who'], aways: Present[]): Visit {
  const span = spanOf(e, aways);
  // a festival cancelled or no longer listed stays on the page, said so, while its members still hold their plans
  const off =
    e.phase === KEY.phase.CANCELLED
      ? text('phase', e.phase)
      : e.phase === KEY.phase.GONE
        ? text('listing', e.listing)
        : null;
  return { e, who, aways, span, on: span.from <= today && today <= span.to, ended: span.to < today, off };
}

// when the next festival is, said from today: "tomorrow", "this Friday", or "on 20 Nov"
const whenFrom = (today: string, e: Festival): string =>
  relativeDay(today, e.start_date) ?? `on ${dayMonth(e.start_date)}`;

// until when a trip on goes on: "today", its weekday within the week ("Mon"), or else its day ("1 Dec")
function until(today: string, day: string): string {
  if (day === today) return 'today';
  return day <= addDays(today, 6) ? weekday3(day) : dayMonth(day);
}

// The head's line of where the community is: "Now: Glasgow, until Mon", and the next trip after it, "· Next: Oslo, on
// 20 Nov"; with no trip on, "Next: Glasgow, this Friday"; nothing with neither.
function nowAndNext(current: readonly Visit[], today: string): HTMLElement | null {
  const on = current.find((t) => t.on),
    next = current.find((t) => !t.on);
  const where = (t: Visit) => t.e.city ?? t.e.title;
  const said = [
    on === undefined ? null : `Now: ${where(on)}, until ${until(today, on.span.to)}`,
    next === undefined ? null : `Next: ${where(next)}, ${whenFrom(today, next.e)}`,
  ].filter((x) => x !== null);
  return said.length === 0 ? null : h('p', { class: ['community-next', 'muted'] }, said.join(' · '));
}

// "Fri 20 – Sun 22 Nov", "Thu 26 Nov – Tue 1 Dec": a festival's days, each with its weekday
function daysSaid(e: Festival): string {
  const { d1, m1, d2, m2 } = dayParts(e.start_date, e.end_date);
  if (e.start_date === e.end_date) return `${weekday3(e.start_date)} ${d1} ${m1}`;
  return m1 === m2
    ? `${weekday3(e.start_date)} ${d1} – ${weekday3(e.end_date)} ${d2} ${m1}`
    : `${weekday3(e.start_date)} ${d1} ${m1} – ${weekday3(e.end_date)} ${d2} ${m2}`;
}

// The agenda of a period: its trips, those with a day in it, a heading a month ("November · 3 trips", with its year
// in January and when it is not this year's) and a row a trip, the first open (the one on, or else the next); none,
// "Nothing planned in Mar–Jun".
function agenda(trips: readonly Visit[], today: string, manager: Member, from: string): Kid[] {
  const byMonth = new Map<string, Visit[]>();
  for (const t of trips.filter((v) => v.aways.some((a) => inPeriod(from, a)))) {
    const m = t.e.start_date.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), t]);
  }
  if (byMonth.size === 0)
    return [h('p', { class: 'muted' }, `Nothing planned in ${periodSaid(from, (m) => monthShort(`${m}-01`), true)}`)];
  return [...byMonth].map(([m, here], i) => {
    const [name = '', year = ''] = monthYear(`${m}-01`).split(' ');
    const yearToo = m.endsWith('-01') || (i === 0 && year !== today.slice(0, 4));
    return [
      h(
        'h2',
        {},
        yearToo ? `${name} ${year}` : name,
        h('span', { class: 'agenda-n' }, ` · ${plural(here.length, 'trip')}`),
      ),
      h(
        'ol',
        { class: 'agenda-list' },
        here.map((t) => tripRow(t, manager, t === trips[0])),
      ),
    ];
  });
}

// A trip's chart: who travels when (a Gantt, by travel and by place when they stay apart), and the same in words.
// It is drawn the first time its row opens, not with the agenda: a long agenda's rows mostly stay closed.
function chartOf({ e, aways }: Visit, manager: Member, id: string): Kid[] {
  // its roster: who travels alike, a couple as one when both partners do, and the people the manager added, who never
  // say how they travel, each name of theirs saying on hover who added them
  const couples = couplesAmong(aways.flatMap((a) => (a.goer ? [a.goer] : [])));
  const goes = aways.map(
    (a): Goes<Present> => ({
      person: a,
      key: a.who,
      name: a.goer?.name ?? a.added?.name ?? '',
      couple: a.goer ? (couples.get(a.goer.person_id) ?? null) : null,
      travel: a.travel,
      stays: a.stays,
    }),
  );
  const lines = roster(goes);
  const title = `Added by ${manager.name}`;
  // the roster in words, for a screen reader: each line in and out and where it stays, and who has not said, a line
  // called collectively by its name and its people's
  const said = h('p', { class: ['gantt-said', 'visually-hidden'], id: `${id}-said` }, lines.map(inWords).join('; '));
  const frame = { ...spanOf(e, aways), festival: e, place: e.city ?? e.title, seed: String(e.id) };
  const named = (u: Unit<Present>) => (u.people.some((a) => a.added) ? addedBy(u.name, title) : u.name);
  const byTravel = gantt({ ...frame, lines, named, describedBy: said.id });
  // by place too, when its people stay at two places or more: the same people, a line a place, and a control between
  const places = byPlace(goes);
  const placesSaid = places.filter((p) => p.place !== null).length;
  const placeSaid = h(
    'p',
    { class: ['gantt-said', 'visually-hidden'], id: `${id}-places-said` },
    places.map(placeInWords).join('; '),
  );
  const byPlaces = placesSaid < 2 ? null : ganttByPlace({ ...frame, places, named, describedBy: placeSaid.id });
  const view = (as: 'travel' | 'place') => {
    seen.set(e.id, as);
    byTravel.hidden = as !== 'travel';
    said.hidden = as !== 'travel';
    if (byPlaces) byPlaces.hidden = as !== 'place';
    placeSaid.hidden = as !== 'place';
    for (const b of choice) b.setAttribute('aria-pressed', String(b.dataset['view'] === as));
  };
  const choice =
    byPlaces === null
      ? []
      : (['travel', 'place'] as const).map((as) => {
          const label = as === 'travel' ? 'By travel' : 'By place';
          return (as === 'travel' ? Drawing.PLANE : Drawing.BED).into(
            button({
              'aria-pressed': 'false',
              'aria-label': label,
              title: label,
              dataset: { view: as },
              onclick: () => view(as),
            }),
          );
        });
  const switches =
    choice.length === 0 ? null : h('div', { class: 'gantt-views', role: 'group', 'aria-label': 'The roster' }, choice);
  view(byPlaces === null ? 'travel' : (seen.get(e.id) ?? 'travel'));
  return [switches, byTravel, byPlaces, said, placeSaid];
}

// A trip's row: its days, the festival (to it on the map) and where, who of the community goes; opened, a small Gantt
// of who travels when, the same in words, where members stay, and the festival's line-up and prices.
function tripRow(trip: Visit, manager: Member, open: boolean): HTMLElement {
  const { e, who, on, off } = trip;
  const id = `trip-${e.id}`;
  // the festival's line-up and prices, its card opened, in the trip's: shown from the festival's name
  const lineup = h('div', { class: 'trip-lineup', id: `${id}-lineup`, hidden: true });
  const body = h('div', { class: 'trip-body', id, hidden: !open }, open ? chartOf(trip, manager, id) : null, lineup);
  let drawn = open;
  // the card open or not, and its line-up shown or not; a closed card shows no line-up
  const show = (opened: boolean, lineupShown: boolean) => {
    if (opened && !drawn) {
      body.prepend(...nodes(chartOf(trip, manager, id)));
      drawn = true;
    }
    if (lineupShown && lineup.childElementCount === 0)
      lineup.append(eventCard({ ...e, goers: who.goers }, { open: true }));
    body.hidden = !opened;
    lineup.hidden = !(opened && lineupShown);
    // the card lists everyone: the row says only how many go, and who teaches
    whoLine.replaceChildren(...nodes(opened ? who.counted() : who.said()));
    toggle.setAttribute('aria-expanded', String(opened));
    name.setAttribute('aria-expanded', String(opened && lineupShown));
  };
  const whoLine = h('p', { class: 'trip-who' }, open ? who.counted() : who.said());
  const toggle = button({
    class: 'trip-toggle',
    'aria-expanded': String(open),
    'aria-controls': id,
    'aria-label': `Who travels when, to ${e.title}`,
    onclick: () => show(body.hidden === true, false),
  });
  // the festival's name opens the card on its line-up and prices, and closes them again
  const name = button(
    {
      class: ['link', 'trip-fest'],
      'aria-expanded': 'false',
      'aria-controls': lineup.id,
      onclick: () => show(true, lineup.hidden === true),
    },
    e.title,
  );
  return h(
    'li',
    { class: 'trip' },
    h(
      'div',
      { class: 'trip-head' },
      h(
        'p',
        {},
        on && off === null ? [h('span', { class: 'now-tag' }, 'Now'), ' '] : null,
        h('span', { class: 'trip-when' }, daysSaid(e)),
        ' ',
        name,
        h('span', { class: 'muted' }, ' · '),
        // where it is, which leads to it on the map
        h('a', { href: eventOnMapHref(e.id) }, place(e)),
        off === null ? null : [' ', h('span', { class: 'trip-off' }, off)],
      ),
      whoLine,
      toggle,
    ),
    body,
  );
}

// an end of a travel in words: "in Thu 17:05 OSL", or when not said "arrives Fri 6 Nov, time not said"
const ends = (at: Moment | null, airport: string | null, which: 'arrive' | 'leave', word: string): string =>
  unsaidEnd(at, which) ?? (at === null ? '' : `${word} ${dayTimeAt(at, airport)}`);

// A line of a roster in words: who (by its name, and its units when it is called otherwise), in and out (each "not
// said" when not, a day without its time "arrives Fri 6 Nov, time not said"), and where they stay, each place with
// who stays there when there are several; or "not said".
function inWords(l: Line<Present>): string {
  const names = joinedText(l.units.map((u) => u.name));
  const who = l.called === null ? names : `${l.called} (${names})`;
  const f = l.travel;
  if (f === null && l.nights === null) return `not said: ${who}`;
  const flights =
    f === null
      ? ''
      : ` ${ends(moment(f.arrive), f.arrive_at, 'arrive', 'in')}, ${ends(moment(f.leave), f.leave_from, 'leave', 'out')}`;
  const [only] = l.buckets;
  const stays =
    l.buckets.length === 1 && only
      ? only.place === null
        ? ''
        : `, staying at ${only.place}`
      : `, staying: ${l.buckets.map((b) => `${b.place ?? 'not said'}: ${joinedText(b.units.map((u) => u.name))}`).join(', ')}`;
  return `${who}${flights}${stays}`;
}

// A place of a roster by where they stay in words: the place, its nights, and who stays there; or who said none.
function placeInWords(p: Place<Present>): string {
  const names = joinedText(p.units.map((u) => u.name));
  if (p.place === null || p.nights === null) return `place not said: ${names}`;
  const night = (d: string) => `${weekday3(d)} ${Number(d.slice(8))}`;
  return `${p.place}, the nights of ${night(p.nights.first)} to ${night(p.nights.last)}: ${names}`;
}

// how each card's roster is seen, by travel or by place, for the visit: by festival
const seen = new Map<number, 'travel' | 'place'>();

// Who of the community goes to a festival: its members, as their couple when both go and teaching when in the
// line-up, then the people its manager added, each name saying on hover who added them: each one teaching linked to
// their artist page, the others named together; said makes the words anew for each place that shows them. people
// counts them all, a couple as its two.
function whoGoes(
  e: Festival,
  f: Going,
  manager: Member,
): { goers: Festival['goers']; people: number; said: () => Kid[]; counted: () => Kid[] } {
  const members = new Set(f.members),
    goers = e.goers.filter((g) => members.has(g.key));
  const going = f.added.filter((a) => a.artist === null);
  const title = `Added by ${manager.name}`;
  const said = (): Kid[] => {
    const added = [
      ...f.added.flatMap((a) =>
        a.artist === null
          ? []
          : [
              h(
                'span',
                { class: 'goer' },
                h('a', { href: artistHref(a.artist), class: 'artist', title }, a.name),
                ' ',
                doingTag([a]),
              ),
            ],
      ),
      going.length > 0 ? h('span', {}, joined(going.map((a) => addedBy(a.name, title))), ' ', doingTag(going)) : null,
    ].filter((x) => x !== null);
    return [goersInline(goers), goers.length > 0 && added.length > 0 ? ' · ' : null, joined(added)];
  };
  const people = goers.length + f.added.length;
  // "5 going · Cédric & Christina teaching": how many go, and who of them teaches, by name
  const teaching = [...goers.filter((g) => g.booked_as !== null), ...f.added.filter((a) => a.artist !== null)];
  const counted = (): Kid[] => [
    `${people} going`,
    teaching.length > 0
      ? [
          ' · ',
          joinedText([
            ...namesOf(goers.filter((g) => g.booked_as !== null)),
            ...f.added.flatMap((a) => (a.artist === null ? [] : [a.name])),
          ]),
          ' ',
          doingTag(teaching),
        ]
      : null,
  ];
  return { goers, people, said, counted };
}

// the name of someone the manager added, which says who added them on hover and to a screen reader alike
const addedBy = (name: string, title: string): HTMLElement =>
  h(
    'span',
    { title },
    name,
    h('span', { class: 'visually-hidden' }, ` (${title.charAt(0).toLowerCase()}${title.slice(1)})`),
  );

// words kept on one line: "5 people", "20–22 Nov", each space a no-break one
const unbroken = (words: string): string => words.replaceAll(' ', '\u00a0');
// whether a day is one of the festival someone travels to
const atFestival = (a: Present, day: string): boolean => day >= a.e.start_date && day <= a.e.end_date;
// where the festivals of these people are: "Oslo", "Oslo and Riga"; a festival with no city by its name
const placesOf = (aways: readonly Present[]): string =>
  joinedText([...new Set(aways.map((a) => a.e.city ?? a.e.title))]);

// What a day's popover says: the day, its festivals, who flies in and out that day (by time and airport, a couple as
// one when both share the flight), who else is there, and where members stay that night. The people added are named,
// each saying on hover who added them, and never travel.
function dayDetail(day: string, on: Day<Present> | undefined, manager: Member): Kid[] {
  if (on === undefined) return [h('p', { class: 'day-when' }, weekDay(day))]; // a day no one travels on opens nothing
  // each person once a festival: someone leaving one festival and arriving at another that day is at both
  const once = [...new Map(on.aways.map((a) => [`${a.who} ${a.e.id}`, a])).values()];
  const flying = (when: 'arrive' | 'leave', where: 'arrive_at' | 'leave_from'): Kid[] => {
    const by = new Map<string, Goer[]>();
    for (const a of once)
      if (a.travel?.[when]?.startsWith(day) && a.goer) {
        const time = moment(a.travel[when])?.time ?? null;
        const at = time === null ? '(time not said)' : timeAt(time, a.travel[where]);
        by.set(at, [...(by.get(at) ?? []), a.goer]);
      }
    return [...by].map(([at, goers]) => `${namesOf(goers).join(' & ')} ${at}`);
  };
  const flyingIn = flying('arrive', 'arrive_at'),
    flyingOut = flying('leave', 'leave_from');
  const moving = (a: Present) => Boolean(a.travel?.arrive?.startsWith(day) || a.travel?.leave?.startsWith(day));
  const there = once.filter((a) => !moving(a));
  const title = `Added by ${manager.name}`;
  const stays = new Map<string, Goer[]>();
  for (const a of once)
    for (const s of a.stays)
      if (a.goer && s.first <= day && day <= s.last) stays.set(s.place, [...(stays.get(s.place) ?? []), a.goer]);
  const line = (what: string, kids: readonly Kid[]) => (kids.length > 0 ? h('p', {}, `${what}: `, joined(kids)) : null);
  return [
    h('p', { class: 'day-when' }, weekDay(day)),
    [...new Set(on.aways.map((a) => a.e))].map((e) =>
      h('p', {}, h('b', {}, e.title), e.city === null ? null : ` · ${e.city}`),
    ),
    line('Flying in', flyingIn),
    line('Flying out', flyingOut),
    line('There', [
      ...namesOf(there.flatMap((a) => (a.goer ? [a.goer] : []))),
      ...there.flatMap((a) => (a.added ? [addedBy(a.added.name, title)] : [])),
    ]),
    [...stays].map(([stay, goers]) => h('p', {}, `Staying: ${stay}: `, joined(namesOf(goers)))),
  ];
}
