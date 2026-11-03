// A community's page (pipeline/communities.csv, community_members.csv, seeded.csv): who is in it, and the festivals
// to come that its members plan or that its manager added someone to, first as a list of who goes where, then as
// cards. Only its link reaches it: nothing lists communities. Its members and the people its manager added, who have
// not joined, are named; the added ones are said to be added by the manager.
import { one, q, sql } from './db.ts';
import { button, h, type Kid } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { type Festival, withDetails } from './festivals.ts';
import { comingUp, page, personLink } from './people.ts';
import { doingTag, goersInline, goingRow } from './plans.ts';
import { artistHref } from './routes.ts';
import { type Booked, booked, EVENT, num, opt, str } from './rows.ts';
import { joined, plural } from './wording.ts';

// A community as its page reads it, which is what a server will give one of its members. For now it is read from
// the site database.
interface Member {
  key: string;
  name: string;
}
// someone the manager added: their name, and what they are booked as at the festival (from the line-up, never from
// the manager) with the artist record that booking links to
interface Added {
  name: string;
  booked_as: Booked | null;
  artist: number | null;
}
interface Going {
  members: string[]; // the keys of its members going
  added: Added[]; // the people its manager added who are going, in the order they were added
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
    const f = festivals.get(id) ?? { members: [], added: [] };
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
    { event_id: num, name: str, booked_as: opt(booked), artist_id: opt(num) },
    sql`SELECT event_id, name, booked_as, artist_id FROM seeded_rows WHERE community_id = ? ORDER BY id`,
    [c.id],
  ))
    at(r.event_id).added.push({
      name: r.name,
      booked_as: r.booked_as,
      artist: r.booked_as === null ? null : r.artist_id,
    });
  return {
    key: c.key,
    name: c.name,
    manager: { key: c.manager_key, name: c.manager_name },
    members,
    festivals,
  };
}

const SHOWN = 3; // the festivals the list shows before "See more"

export function communityView(root: HTMLElement, [key]: readonly string[]): void {
  const c = key === undefined ? null : communityOf(key);
  if (c === null) {
    root.replaceChildren(h('p', {}, 'No community at this link.'));
    return;
  }
  const events = withDetails(
    q(
      EVENT,
      sql`SELECT * FROM event_rows WHERE upcoming AND id IN (SELECT value FROM json_each(?)) ORDER BY start_date`,
      [JSON.stringify([...c.festivals.keys()])],
    ),
  ).flatMap((e) => {
    const f = c.festivals.get(e.id);
    return f === undefined ? [] : [{ e, who: whoGoes(e, f, c.manager) }];
  });
  const members = plural(c.members.length, 'member');
  page(
    root,
    [
      c.name,
      h('p', { class: 'lede' }, members, ' · managed by ', personLink(c.manager)),
      h('p', { class: 'muted' }, `Visible to the ${members} of ${c.name}`),
    ],
    events.length > 0 ? summary(events.map(({ e, who }) => goingRow(e, who.said()))) : null,
    comingUp(
      events.map(({ e, who }) => card(e, who)),
      'No one in this community has said they’re going anywhere yet.',
    ),
    h('section', {}, h('h2', {}, 'Members'), h('p', {}, joined(c.members.map(personLink)))),
  );
}

// Who of the community goes to a festival: its members, as their couple when both go and teaching when in the
// line-up, then the people its manager added, said to be added by them: each one teaching linked to their artist
// page, the others named together; said makes the words anew for each place that shows them.
function whoGoes(e: Festival, f: Going, manager: Member): { goers: Festival['goers']; said: () => Kid[] } {
  const members = new Set(f.members),
    goers = e.goers.filter((g) => members.has(g.key));
  const going = f.added.filter((a) => a.artist === null);
  const said = (): Kid[] => {
    const added = [
      ...f.added.flatMap((a) =>
        a.artist === null
          ? []
          : [
              h(
                'span',
                { class: 'goer' },
                h('a', { href: artistHref(a.artist), class: 'artist' }, a.name),
                ' ',
                doingTag([a]),
              ),
            ],
      ),
      going.length > 0 ? h('span', {}, joined(going.map((a) => a.name)), ' ', doingTag(going)) : null,
    ].filter((x) => x !== null);
    return [
      goersInline(goers),
      goers.length > 0 && added.length > 0 ? ' · ' : null,
      added.length > 0 ? [joined(added), h('span', { class: 'muted' }, ` (added by ${manager.name})`)] : null,
    ];
  };
  return { goers, said };
}

// a festival's card, its going line saying who of the community is going
const card = (e: Festival, who: ReturnType<typeof whoGoes>): HTMLElement =>
  eventCard({ ...e, goers: who.goers }, { going: h('p', { class: 'going-line' }, h('span', {}, who.said())) });

// the first festivals of the list, and a button that shows the rest in place, or hides them again
function summary(rows: readonly HTMLElement[]): HTMLElement {
  const list = h('ul', { class: 'plan-list' }, rows);
  const rest = rows.slice(SHOWN);
  if (rest.length === 0) return list;
  const show = (open: boolean) => {
    for (const r of rest) r.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'See less' : 'See more';
  };
  const more = button(
    { class: 'more-btn', onclick: () => show(more.getAttribute('aria-expanded') !== 'true') },
    'See more',
  );
  show(false);
  return h('div', {}, list, more);
}
