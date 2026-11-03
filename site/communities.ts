// A community's page (pipeline/communities.csv, community_members.csv, seeded.csv): who is in it, and the festivals
// to come that its members plan or that its manager added someone to. Only its link reaches it: nothing lists
// communities. Its members are named; the people its manager added, who have not joined, are only counted.
import { one, q, sql } from './db.ts';
import { h } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { type Festival, withDetails } from './festivals.ts';
import { comingUp, page, personLink } from './people.ts';
import { goersInline } from './plans.ts';
import { EVENT, num, opt, str } from './rows.ts';
import { joined, plural } from './wording.ts';

// A community as its page reads it, which is what a server will give one of its members: its people by name, and of
// the people its manager added only how many go to each festival. For now it is read from the site database.
interface Member {
  key: string;
  name: string;
}
interface Going {
  event_id: number;
  members: string[]; // the keys of its members going
  added: number; // how many people its manager added are going
}
interface Community {
  key: string;
  name: string;
  manager: Member;
  members: Member[];
  festivals: Going[]; // every festival any of them goes to, past ones too: the page keeps those to come
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
  const festivals = q(
    { event_id: num, members: opt(str), added: num },
    sql`SELECT event_id, group_concat(key) AS members, sum(n) AS added FROM (
      SELECT pl.event_id, p.key, 0 AS n FROM community_members m JOIN plans pl ON pl.person_id = m.person_id
        JOIN people p ON p.id = m.person_id WHERE m.community_id = ?1
      UNION ALL SELECT event_id, NULL, n FROM community_seeded WHERE community_id = ?1
    ) GROUP BY event_id`,
    [c.id],
  ).map((f) => ({ ...f, members: f.members?.split(',') ?? [] }));
  return {
    key: c.key,
    name: c.name,
    manager: { key: c.manager_key, name: c.manager_name },
    members,
    festivals,
  };
}

export function communityView(root: HTMLElement, [key]: readonly string[]): void {
  const c = key === undefined ? null : communityOf(key);
  if (c === null) {
    root.replaceChildren(h('p', {}, 'No community at this link.'));
    return;
  }
  const going = new Map(c.festivals.map((f) => [f.event_id, f]));
  const events = withDetails(
    q(
      EVENT,
      sql`SELECT * FROM event_rows WHERE upcoming AND id IN (SELECT value FROM json_each(?)) ORDER BY start_date`,
      [JSON.stringify([...going.keys()])],
    ),
  );
  const members = plural(c.members.length, 'member');
  page(
    root,
    [
      c.name,
      h('p', { class: 'lede' }, members, ' · managed by ', personLink(c.manager)),
      h('p', { class: 'muted' }, `Visible to the ${members} of ${c.name}`),
    ],
    comingUp(
      events.flatMap((e) => {
        const f = going.get(e.id);
        return f === undefined ? [] : [card(e, f)];
      }),
      'No one in this community has said they’re going anywhere yet.',
    ),
    h('section', {}, h('h2', {}, 'Members'), h('p', {}, joined(c.members.map(personLink)))),
  );
}

// a festival's card, saying who of the community is going: its members by name, as their couple when both go and
// teaching when in the line-up, then how many people its manager added go, however few
function card(e: Festival, f: Going): HTMLElement {
  const members = new Set(f.members),
    goers = e.goers.filter((g) => members.has(g.key));
  const added =
    f.added > 0
      ? `${plural(f.added, 'person', 'people')} from this community ${f.added === 1 ? 'is' : 'are'} going`
      : null;
  return eventCard(
    { ...e, goers },
    {
      going: h(
        'p',
        { class: 'going-line' },
        h('span', {}, goersInline(goers), goers.length > 0 && added !== null ? ' · ' : null, added),
      ),
    },
  );
}
