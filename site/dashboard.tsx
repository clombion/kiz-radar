// The review dashboard (review.html): the pipeline's decisions that wait for the admin, one queue per tab of the
// header's sub-navigation, and what it did lately, from review.json (pipeline/review.py, built with the site's
// database). A queue shows one item at a time, with what the machine found (a pair compared side by side, the
// countries line-ups state and the festivals that state them), beside a rail listing every item, which a search
// narrows. With a token that checks (github.ts) the item carries its choices, and writing one puts the admin's claim in
// the claims repository; it reaches the site at the next run of Refresh events. Without one the page is read-only and
// shows no choice to make. The festivals and the orphaned claims are settled in a session (docs/guides/), so they are
// listed. The tab and the item are in the address; the items settled since the build are kept in the browser.
// The page's state is one record, the one last drawn (the address, the rail's search, the two artists picked to join,
// and the token's state, token.tsx), a signal the token button and the queues' tabs follow. Each change of it is drawn
// at once, the whole page anew (a focused control, a choice pressed and a note half written going with it): the view
// through mount.tsx's drawnIn, so a draw that throws says so in its place, and the token button's words and the
// queues' tabs drawn again with it. A choice, the note, a write under way, a side's matches and the rail's next page
// are changed in place, the page not drawn anew. A view is drawn by the handler
// that changed the state, never by an effect: render flushes, which Solid refuses inside an effect.
import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Accessor, createRoot, createSignal, flush, Show } from 'solid-js';
import { type Claim, homeClaim, mergeClaim } from './claims.ts';
import { choices, paged } from './controls.tsx';
import { check, write } from './github.ts';
import { Drawing } from './icons.ts';
import { markSettled, settled, token } from './kept.ts';
import { drawnIn, Redrawn } from './mount.tsx';
import {
  type Booked,
  COMPARED,
  differs,
  type Home,
  homeId,
  homeNote,
  type Merge,
  mergeId,
  mergeNote,
  nextOpen,
  type Review,
  unjoinable,
} from './pending.ts';
import { atEnd, inside, instead } from './placed.tsx';
import { done } from './report.ts';
import { artistHref } from './routes.ts';
import { KEY } from './states.ts';
import { type Access, accessWords, openToken, tokenDialog, tokenOpen } from './token.tsx';
import { flag } from './ui.ts';
import { plural } from './wording.ts';

const BEAT = 450; // ms the written state shows before the next item
const DIGIT = /^[1-9]$/u; // a choice's key
const MARKS = /\p{M}/gu; // the accents a search folds away
const RAIL = 60; // items the rail lists at a time
const SHOWN = 8; // the matches a side's search lists

// ----- queues: the items, where the page is in each, and what is settled

// the contested homes' queue is that state's, named by its key in the address
type Tab =
  | 'merges'
  | 'join'
  | typeof KEY.home_basis.CONTESTED
  | 'unknown'
  | 'festivals'
  | 'cities'
  | 'orphaned'
  | 'timeline';
const TABS: readonly (readonly [Tab, string])[] = [
  ['merges', 'Merges'],
  ['join', 'Join two artists'],
  [KEY.home_basis.CONTESTED, 'Contested homes'],
  ['unknown', 'Unknown homes'],
  ['festivals', 'Festivals'],
  ['cities', 'Cities'],
  ['orphaned', 'Orphaned claims'],
  ['timeline', 'Timeline'],
];
const isTab = (v: string): v is Tab => TABS.some(([t]) => t === v);

// the item the address names: a tab, and the place in its queue from 0
interface At {
  readonly tab: Tab;
  readonly i: number;
}
// the two artists picked to join, either side none yet
type Picked = readonly [Booked | null, Booked | null];
// the page's own state, as the address and the admin set it
interface State {
  readonly at: At;
  readonly filter: string; // the rail's search, folded
  readonly picked: Picked;
}
// what a draw is of: the page's state and the token's, a new record on each change, each of which draws the page anew
type Drawn = State & { readonly access: Access };

// a decision's form, as its write tells it how it goes: under way, written, or open again (it failed); and what it says
type Phase = 'open' | 'writing' | 'written';
interface Form {
  readonly now: (phase: Phase) => void;
  readonly say: (words: string) => void;
}
// What a draw is given: the review, what it is of, and the page's functions: the items settled since the build (read
// as each draw, and each press, is made), an item shown by its place, a change of the page's state, the rail's search
// typed and the rail's field drawn (focused again once the page is drawn anew), and a claim written.
interface Page {
  readonly r: Review;
  readonly d: Drawn;
  readonly settled: () => ReadonlySet<string>;
  readonly go: (tab: Tab, i: number) => void;
  readonly change: (to: Partial<Drawn>) => void;
  readonly searched: (words: string) => void;
  readonly railDrawn: (field: HTMLInputElement) => void;
  readonly settle: (id: string, claim: Claim, form: Form) => void;
}

interface Queue {
  readonly ids: readonly string[];
  readonly card: (p: Page, i: number) => JSX.Element;
  readonly lead: (i: number) => string; // the rail row's flag, or ? when no line-up states a country
  readonly name: (i: number) => string;
  readonly sub: (i: number) => string;
}

const homes = (r: Review, contested: boolean): Home[] =>
  r.homes.filter((a) => (a.basis === KEY.home_basis.CONTESTED) === contested);
const countryOf = (r: Review, code: string): string => r.countries.find((c) => c.code === code)?.name ?? code;
// a country as the page shows it: its flag and name; a code the table doesn't have is shown as given
const country = (r: Review, code: string): string => `${flag(code)} ${countryOf(r, code)}`.trim();

function queue(r: Review, tab: Tab): Queue | null {
  if (tab === 'merges') {
    const items = r.merges;
    const m = (i: number) => items[i];
    return {
      ids: items.map(mergeId),
      card: (p, i) => mergeCard(p, m(i)),
      lead: (i) => flag(m(i)?.a.stated[0] ?? m(i)?.a.booked_in[0]) || '?',
      name: (i) => `${m(i)?.a.name ?? ''} · ${m(i)?.b.name ?? ''}`,
      sub: (i) => `${plural(m(i)?.shared ?? 0, 'festival')} together`,
    };
  }
  if (tab === KEY.home_basis.CONTESTED || tab === 'unknown') {
    const items = homes(r, tab === KEY.home_basis.CONTESTED);
    const a = (i: number) => items[i];
    return {
      ids: items.map(homeId),
      card: (p, i) => homeCard(p, a(i)),
      lead: (i) => flag(a(i)?.stated[0]?.code) || '?',
      name: (i) => a(i)?.name ?? '',
      sub: (i) => `${a(i)?.kind ?? ''}, ${plural(a(i)?.bookings ?? 0, 'booking')}`,
    };
  }
  return null;
}
// a tab's items waiting, none for the tool that joins any two artists
const count = (r: Review, tab: Tab): number | null =>
  ({
    merges: r.merges.length,
    join: null,
    contested: homes(r, true).length,
    unknown: homes(r, false).length,
    festivals: r.festivals.length,
    cities: r.cities.length,
    orphaned: r.orphaned.length,
    timeline: r.steps.length,
  })[tab];

// the page's state as the address has it now, from the state before (another tab's rail starts unfiltered)
function addressed(was: State | undefined): State {
  const [name = 'merges', n = '1'] = location.hash.slice(1).split('/');
  const tab = isTab(name) ? name : 'merges';
  return {
    at: { tab, i: Math.max(0, Number.parseInt(n, 10) - 1 || 0) },
    filter: was === undefined || tab !== was.at.tab ? '' : was.filter,
    picked: was?.picked ?? [null, null],
  };
}

// ----- writing: one claim at a time, confirmed on its button, then the next open item

const SAID = {
  written: (id: string) => `Written as ${id}.json: on the site after the next run.`,
  there: (id: string) => `Already written (${id}.json): nothing changed.`,
  refused: () => 'GitHub refused the token: it has expired or was revoked. Make a new one (the token button, above).',
  forbidden: () =>
    'The token may not write there: give it Contents, Read and write, on the claims repository (the token button, above).',
} as const;

// A decision: its choices (one is picked, by click or its number key), the note saying why, which a choice fills in
// unless its maker wrote their own, and the button that writes it; read-only, none of it shows. Each control is
// disabled while its claim is written, and again usable if the write failed.
type Choose = (value: string, noted: () => string) => void;
function decision(
  p: Page,
  id: string,
  {
    options,
    extra,
    claim,
  }: {
    readonly options: readonly (readonly [string, string, () => string])[];
    // a control that chooses as a choice does (a country picker), off while the claim is written
    readonly extra?: (choose: Choose, writing: { readonly off: Accessor<boolean> }) => JSX.Element;
    readonly claim: (pick: string, note: string) => Claim;
  },
): JSX.Element {
  if (p.settled().has(id))
    return <p class={['review-status', 'small']}>✓ Settled since this build: on the site after the next run.</p>;
  const { access } = p.d;
  if (access.state !== 'ok') {
    const why = access.state === 'refused' ? `${access.why} ` : 'Read-only: ';
    return (
      <p class={['review-readonly', 'small', 'muted']}>
        {why}
        <button type="button" class="link" onClick={openToken}>
          add a token
        </button>
        {' to decide here.'}
      </p>
    );
  }
  let pick: string | null = null;
  let filled = ''; // the note a choice put there, replaced by the next choice while unchanged
  let note: HTMLInputElement | undefined;
  const [pressed, setPressed] = createSignal<number | null>(null);
  const [ready, setReady] = createSignal(false);
  const [phase, setPhase] = createSignal<Phase>('open');
  const [said, setSaid] = createSignal('');
  const off = () => phase() !== 'open';
  const readyNow = () => {
    setReady(pick !== null && (note?.value ?? '').trim() !== '');
  };
  const choose: Choose = (value, noted) => {
    pick = value;
    if (note?.value === filled) {
      filled = noted();
      note.value = filled;
    }
    readyNow();
  };
  const writeIt = () => {
    if (pick === null) return;
    p.settle(id, claim(pick, note?.value ?? ''), {
      now: (to) => {
        flush(() => {
          setPhase(to);
        });
      },
      say: (words) => {
        flush(() => {
          setSaid(words);
        });
      },
    });
  };
  const buttons = options.map(([value, words, noted], n) => {
    const key = String(n + 1);
    return (
      <button
        type="button"
        class={['review-choice', { 'is-on': pressed() === n }]}
        aria-pressed={pressed() === n ? 'true' : 'false'}
        data-key={key}
        disabled={off()}
        onClick={() => {
          flush(() => {
            setPressed(n);
            choose(value, noted);
          });
          note?.focus();
        }}
      >
        {words}
        <kbd>{key}</kbd>
      </button>
    );
  });
  const row = buttons.length > 0 ? <div class="seg">{buttons}</div> : null;
  const picker = extra?.(
    (value, noted) => {
      flush(() => {
        setPressed(null);
        choose(value, noted);
      });
    },
    { off },
  );
  return (
    <form
      class="review-form"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!off() && ready()) writeIt();
      }}
    >
      <h4>Your decision</h4>
      <div class="review-choices">
        {row}
        {picker}
      </div>
      <div class="review-write">
        <input
          ref={(el) => {
            note = el;
            el.addEventListener('input', () => {
              flush(readyNow);
            });
          }}
          type="text"
          class="review-note"
          aria-label="Why"
          placeholder="Why: what says so"
          required
          disabled={off()}
        />
        <button
          type="button"
          class={{ 'just-picked': phase() === 'written' }}
          disabled={off() || !ready()}
          onClick={writeIt}
        >
          {phase() === 'writing' ? 'Writing…' : phase() === 'written' ? '✓ Written' : 'Write the claim'}
        </button>
      </div>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a decision's status line, its markup kept as the h() page drew it during the port (revisit after 4.10) */}
      <p class={['review-status', 'small']} role="status">
        {said()}
      </p>
    </form>
  );
}

// ----- the items

// a pair side by side: a row per thing the merge review weighed, the rows whose sides share nothing marked
function mergeCard(p: Page, m: Merge | undefined): JSX.Element {
  if (m === undefined) return null;
  const { r } = p;
  const { a, b, shared, rationale } = m;
  const places = new Set(['Line-ups state', 'Booked in']);
  const shown = (label: string, vs: readonly string[]): JSX.Element => {
    if (vs.length === 0) return <span class="muted">—</span>;
    return places.has(label) ? vs.map((v) => country(r, v)).join(', ') : vs.join(', ');
  };
  const row = (label: string, one: readonly string[], other: readonly string[], weighs = true) => {
    const left = shown(label, one),
      right = shown(label, other);
    const cells = (
      <>
        <th scope="row">{label}</th>
        <td>{left}</td>
        <td>{right}</td>
      </>
    );
    return weighs && differs(one, other) ? <tr class="differs">{cells}</tr> : <tr>{cells}</tr>;
  };
  const rows = [
    row('Festivals', [String(a.festivals)], [String(b.festivals)]),
    ...COMPARED.map(([label, of, weighs]) => row(label, of(a), of(b), weighs)),
  ];
  const together =
    shared > 0
      ? `Both named in ${plural(shared, 'line-up')}: two names at one festival are often two people.`
      : 'Never named in the same line-up.';
  const { name: oneName, key: oneKey } = a,
    { name: otherName, key: otherKey } = b;
  const decided = decision(p, mergeId(m), {
    options: [
      ['merge', 'One artist', () => mergeNote(m, true)],
      ['separate', 'Two artists', () => mergeNote(m, false)],
    ],
    claim: (pick, note) =>
      mergeClaim({
        keys: [a.key, b.key],
        decision: pick === 'merge' ? 'merge' : 'separate',
        note,
        at: new Date(),
      }),
  });
  return (
    <>
      <h2>
        {oneName}
        <span class="muted">{' or '}</span>
        {otherName}
      </h2>
      <p class={['small', 'muted']}>{together}</p>
      <table class="review-compare">
        <thead>
          <tr>
            <th />
            <th scope="col">{oneName}</th>
            <th scope="col">{otherName}</th>
          </tr>
        </thead>
        <tbody>
          {rows}
          <tr>
            <th scope="row">Key</th>
            <td>
              <code>{oneKey}</code>
            </td>
            <td>
              <code>{otherKey}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <h4>Why the merge review was unsure</h4>
      <p class="review-why">{rationale}</p>
      {decided}
    </>
  );
}

const noCountry = (): never => {
  throw new Error('a home claim names a country: pick one');
};
function homeCard(p: Page, a: Home | undefined): JSX.Element {
  if (a === undefined) return null;
  const { r } = p;
  const picker = (choose: Choose, { off }: { readonly off: Accessor<boolean> }) =>
    choices(
      [
        ['', a.stated.length > 0 ? 'Another country…' : 'Choose the country…'],
        ...r.countries.map((c) => [c.code, c.name] as const),
      ],
      '',
      (code) => {
        choose(code, () => homeNote(a, code, countryOf(r, code)));
      },
      { label: 'Country', off },
    );
  const { name, kind, bookings } = a;
  const about = `${kind}, ${plural(bookings, 'booking')} · `;
  const theirs = `./${artistHref(a.artist_id)}`;
  const stated = a.stated.map((s) => {
    const where = country(r, s.code);
    const often = ` · ${plural(s.festivals, 'line-up')}: `;
    const events = s.events.join(' · ');
    return (
      <li>
        <strong>{where}</strong>
        {often}
        <span class="muted">{events}</span>
      </li>
    );
  });
  const said =
    stated.length === 0 ? (
      <p class="muted">No line-up states a country next to their name.</p>
    ) : (
      <ul class="review-stated">{stated}</ul>
    );
  const heading = a.basis === KEY.home_basis.CONTESTED ? 'What line-ups state, equally often' : 'What line-ups state';
  const booked = a.booked_in.map((c) => country(r, c)).join(', ') || '—';
  const decided = decision(p, homeId(a), {
    options: a.stated.map(
      (s) => [s.code, country(r, s.code), () => homeNote(a, s.code, countryOf(r, s.code))] as const,
    ),
    extra: picker,
    claim: (pick, note) => homeClaim(a.key, pick || noCountry(), note, new Date()),
  });
  return (
    <>
      <h2>{name}</h2>
      <p class={['small', 'muted']}>
        {about}
        {/* oxlint-disable-next-line react/jsx-no-target-blank -- the link's rel kept as the h() page drew it during the port, noopener alone (revisit after 4.10) */}
        <a href={theirs} target="_blank" rel="noopener">
          their page on Kiz Radar ↗
        </a>
      </p>
      <h4>{heading}</h4>
      {said}
      <h4>Booked most in</h4>
      <p>
        {booked}
        <span class="muted">{' (where they are booked says nothing of home)'}</span>
      </p>
      {decided}
    </>
  );
}

// ----- a queue: the item, the steps to the others, and the rail of every item

const fold = (s: string): string => s.normalize('NFD').replace(MARKS, '').toLowerCase();

// the rail's rows, those the search keeps, a page at a time, the more button after them
function railRows(p: Page, q: Queue, i: number): JSX.Element {
  const { filter, at } = p.d;
  const settledNow = p.settled();
  const kept = q.ids.map((_, n) => n).filter((n) => filter === '' || fold(q.name(n)).includes(filter));
  const row = (n: number) => {
    const isSettled = settledNow.has(q.ids[n] ?? '');
    const lead = isSettled ? '✓' : q.lead(n);
    const name = q.name(n),
      sub = q.sub(n);
    const selected = n === i ? 'true' : 'false';
    return (
      <li>
        <button
          type="button"
          class={['search-row', 'review-row', { past: isSettled }]}
          // oxlint-disable-next-line jsx-a11y/role-supports-aria-props -- the rail's row says it is the item shown, its markup kept as the h() page drew it during the port (revisit after 4.10)
          aria-selected={selected}
          onClick={() => {
            p.go(at.tab, n);
          }}
        >
          <span class={['lead', 'flag']} aria-hidden="true">
            {lead}
          </span>
          <span class="what">
            <span class="name">{name}</span>
            <span class="sub">{sub}</span>
          </span>
        </button>
      </li>
    );
  };
  const list = paged(kept, RAIL, row, { class: 'link' });
  return (
    <>
      <ol class="review-rows">{list.rows}</ol>
      {list.more}
    </>
  );
}

function queueView(p: Page, q: Queue): JSX.Element {
  const { at, filter } = p.d;
  const n = q.ids.length;
  const i = Math.min(at.i, Math.max(0, n - 1));
  const move = (to: number) => () => {
    p.go(at.tab, (to + n) % n);
  };
  const card = q.card(p, i);
  const place = `${i + 1} of ${n}`;
  const hint = `Find among ${n}…`;
  return (
    <div class="review-queue">
      <article class={['country-row', 'review-card']} aria-label="The item">
        {card}
        <div class="review-foot">
          <button
            ref={(el) => {
              Drawing.PREVIOUS_ITEM.into(el);
            }}
            type="button"
            class="quiet"
            aria-label="Previous item"
            onClick={move(i - 1)}
          />
          <span class={['review-place', 'small', 'muted']}>{place}</span>
          <button
            ref={(el) => {
              Drawing.NEXT_ITEM.into(el);
            }}
            type="button"
            class="quiet"
            aria-label="Next item"
            onClick={move(i + 1)}
          />
          <button
            type="button"
            class="quiet"
            onClick={() => {
              p.go(at.tab, nextOpen(q.ids, i, p.settled()));
            }}
          >
            Next open
          </button>
          <span class={['small', 'muted', 'review-keys']}>← → move · 1, 2 choose · Enter writes · n next open</span>
        </div>
      </article>
      <aside class="review-rail" aria-label="Every item">
        <div class="toolbar">
          <input
            ref={(el) => {
              p.railDrawn(el);
              el.addEventListener('input', () => {
                p.searched(el.value);
              });
            }}
            type="search"
            placeholder={hint}
            aria-label="Find"
            defaultValue={filter}
          />
        </div>
        <Redrawn>{railRows(p, q, i)}</Redrawn>
      </aside>
    </div>
  );
}

const when = (s: string) => s.slice(0, 16).replace('T', ' ');

// ----- joining any two artists: a search for each side, then the merge claim that makes them one

// a side's choice, both sides as they stand but the one given
const pickedAs = (p: Page, n: 0 | 1, a: Booked | null): Picked => (n === 0 ? [a, p.d.picked[1]] : [p.d.picked[0], a]);

function bookedCard(a: Booked, change: () => void): JSX.Element {
  const { name, key } = a;
  const about = `${a.kind}, ${plural(a.bookings, 'booking')} · `;
  const latest = a.latest.join(' · ') || '—';
  return (
    <div>
      <h3>{name}</h3>
      <p class={['small', 'muted']}>
        {about}
        <code>{key}</code>
      </p>
      <p class="small">{latest}</p>
      <button type="button" class="link" onClick={change}>
        Choose another
      </button>
    </div>
  );
}

// a side's matches as its search lists them, each picked by a press
function matches(p: Page, n: 0 | 1, found: readonly Booked[]): JSX.Element {
  return found.map((a) => {
    const { name } = a;
    const sub = `${a.kind}, ${plural(a.bookings, 'booking')} · ${a.latest[0] ?? ''}`;
    return (
      <li>
        <button
          type="button"
          class={['search-row', 'review-row']}
          onClick={() => {
            p.change({ picked: pickedAs(p, n, a) });
          }}
        >
          <span class="what">
            <span class="name">{name}</span>
            <span class="sub">{sub}</span>
          </span>
        </button>
      </li>
    );
  });
}

function sidePicker(p: Page, n: 0 | 1): JSX.Element {
  const chosen = p.d.picked[n];
  const title = n === 0 ? 'One name' : 'The other name';
  if (chosen) {
    const card = bookedCard(chosen, () => {
      p.change({ picked: pickedAs(p, n, null) });
    });
    return (
      <article class="country-row">
        <h4>{title}</h4>
        {card}
      </article>
    );
  }
  const { artists } = p.r;
  const [found, setFound] = createSignal<readonly Booked[]>([]);
  const hint = `Find among ${artists.length}…`;
  return (
    <article class="country-row">
      <h4>{title}</h4>
      <div class="toolbar">
        <input
          ref={(el) => {
            el.addEventListener('input', () => {
              const f = fold(el.value.trim());
              flush(() => {
                setFound(f === '' ? [] : artists.filter((a) => fold(a.name).includes(f)).slice(0, SHOWN));
              });
            });
          }}
          type="search"
          placeholder={hint}
          aria-label={title}
        />
      </div>
      <ol class="review-rows">
        <Redrawn>{matches(p, n, found())}</Redrawn>
      </ol>
    </article>
  );
}

function joinView(p: Page): JSX.Element {
  const [a, b] = p.d.picked;
  const sides = [sidePicker(p, 0), sidePicker(p, 1)];
  if (a === null || b === null) return <div class="review-grid">{sides}</div>;
  const why = unjoinable(a, b);
  const group = a.kind === KEY.artist_kind.GROUP || b.kind === KEY.artist_kind.GROUP;
  const { name: oneName } = a,
    { name: otherName } = b;
  const decided =
    why === null ? (
      [
        group ? (
          <p class={['small', 'muted']}>
            A name several people share is a group: list it in pipeline/extract/groups.csv rather than merge one member
            into it.
          </p>
        ) : null,
        decision(p, `merge ${a.key <= b.key ? `${a.key} ${b.key}` : `${b.key} ${a.key}`}`, {
          options: [['merge', 'One artist', () => `${oneName} / ${otherName}: one artist, under two names`]],
          claim: (_, note) => mergeClaim({ keys: [a.key, b.key], decision: 'merge', note, at: new Date() }),
        }),
      ]
    ) : (
      <p>{why}</p>
    );
  return (
    <>
      <div class="review-grid">{sides}</div>
      <article class={['country-row', 'review-card']}>
        <h2>
          {oneName}
          <span class="muted">{' and '}</span>
          {otherName}
        </h2>
        {decided}
      </article>
    </>
  );
}

// ----- the lists: what is settled in a session, and what the pipeline did

function festivals(r: Review): JSX.Element {
  const cards = r.festivals.map((f) => {
    const { event, page: at } = f;
    const title =
      at === null ? (
        event
      ) : (
        // oxlint-disable-next-line react/jsx-no-target-blank -- the link's rel kept as the h() page drew it during the port, noopener alone (revisit after 4.10)
        <a href={at} target="_blank" rel="noopener">
          {event}
        </a>
      );
    const about = `${f.start} · festival ${f.event_id} · waits for ${f.waits_for}, first read ${f.first_read}`;
    const toDo = `To do: ${f.to_do}.`;
    return (
      <article class="country-row">
        <h3>{title}</h3>
        <p class={['small', 'muted']}>{about}</p>
        <p>{toDo}</p>
      </article>
    );
  });
  return <div class="review-grid">{cards}</div>;
}

function cities(r: Review): JSX.Element {
  const cards = r.cities.map((c) => {
    const name = `${flag(c.country_code)} ${c.name}`;
    const about = `${c.key} · ${countryOf(r, c.country_code)} · ${plural(c.festivals, 'festival')} to come`;
    const events = c.events.map((e) => <li>{e}</li>);
    const { proposal } = c;
    const proposed =
      proposal === null
        ? 'No proposal yet.'
        : `Proposed: ${proposal.tier}${proposal.gateways.length > 0 ? ` (${proposal.gateways.join(', ')})` : ''}. ${proposal.note}`;
    return (
      <article class="country-row">
        <h3>{name}</h3>
        <p class={['small', 'muted']}>{about}</p>
        <ul>{events}</ul>
        <p>{proposed}</p>
      </article>
    );
  });
  return <div class="review-grid">{cards}</div>;
}

function orphaned(r: Review): JSX.Element {
  return r.orphaned.map((o) => {
    const file = `${o.id}.json`;
    const { claim } = o;
    return (
      <article class="country-row">
        <h3>{file}</h3>
        <pre class="review-claim">{claim}</pre>
      </article>
    );
  });
}

function timeline(r: Review): JSX.Element {
  const entry = (time: string, what: string, more: string) => {
    const at = when(time);
    return (
      <li>
        <span class={['small', 'muted']}>{at}</span>
        <strong>{what}</strong>
        <span class="small">{more}</span>
      </li>
    );
  };
  const steps = r.steps.map((s) => entry(s.performed_at, s.step, s.description));
  const reads = r.reads.map((x) => entry(x.at, x.event, `${x.status} · festival ${x.event_id}`));
  return (
    <div class="review-grid">
      <article class="country-row">
        <h3>Steps, latest first</h3>
        <ol class="review-timeline">{steps}</ol>
      </article>
      <article class="country-row">
        <h3>Latest ticket-page reads</h3>
        <ol class="review-timeline">{reads}</ol>
      </article>
    </div>
  );
}

// a tab that is no queue: the join, or a list
function listView(p: Page, tab: Tab): JSX.Element {
  if (tab === 'join') return joinView(p);
  if (tab === 'festivals') return festivals(p.r);
  if (tab === 'cities') return cities(p.r);
  if (tab === 'orphaned') return orphaned(p.r);
  return timeline(p.r);
}

const ABOUT: Readonly<Record<Tab, string>> = {
  join: 'Two artists the matching never paired: one who changed their name, or goes by another as a DJ. Find each, then say they are one.',
  merges: 'Pairs the merge review could not settle, which no claim of yours decides: one artist, or two.',
  contested: 'Artists whose line-ups state two or more countries equally often: which one is home.',
  unknown: 'Artists booked whose home no line-up states, most booked first.',
  festivals: 'Festivals whose prices wait for an agent: settled in a session (docs/guides/ticket-pages.md).',
  cities:
    'Cities of festivals to come with no decision of yours on the airports dancers fly to, each with the research session’s proposal: a claim of yours confirms or overrides it (docs/guides/city-airports.md).',
  orphaned: 'Claims naming a key no mention produces any more: a new claim names the key the artist has now.',
  timeline: 'What the pipeline did lately.',
};

// ----- the page

// what #review shows of a draw: what the tab holds, how many of its items are open, when the review was built, then
// the item and its rail, or the list
function view(p: Page): JSX.Element {
  const { r } = p;
  const { tab } = p.d.at;
  const q = queue(r, tab);
  const settledNow = p.settled();
  const settledHere = q === null ? 0 : q.ids.filter((id) => settledNow.has(id)).length;
  const about = ABOUT[tab];
  const open =
    q === null
      ? null
      : ` ${q.ids.length - settledHere} open${settledHere > 0 ? `, ${settledHere} settled since the build` : ''}.`;
  const built = ` Built ${when(r.built_at)} UTC.`;
  const empty = q === null ? count(r, tab) === 0 : q.ids.length === 0;
  const body = empty ? <p>Nothing waits here.</p> : q === null ? listView(p, tab) : queueView(p, q);
  return (
    <>
      <p class="list-summary">
        {about}
        {open}
        {built}
      </p>
      {body}
    </>
  );
}

// a queue's tab of the sub-navigation: the tab's own, the one shown, and its count of items waiting
function tabLink(r: Review, [tab, words]: readonly [Tab, string], shown: Tab): JSX.Element {
  const href = `#${tab}/1`;
  const on = tab === shown;
  const current = on ? 'page' : undefined;
  const waiting = count(r, tab);
  const counted = waiting === null ? null : <small class="num">{waiting}</small>;
  return (
    <a href={href} class={{ active: on }} aria-current={current}>
      {words} {counted}
    </a>
  );
}

// The page in into (#review), from r, for its life: the token button's words, the queues' tabs, the view, and the
// token dialog; the keys and the address heard on the window; the token the browser keeps checked with GitHub.
export function reviewPage(into: HTMLElement, r: Review): void {
  // What the page shows, the record last drawn: the state its handlers read and change, and a signal of it, which the
  // token button and the queues' tabs follow.
  let now: Drawn = { ...addressed(undefined), access: { state: 'missing' } };
  const [shown, setShown] = createRoot(() => createSignal<Drawn>(now));
  // read as each draw is made: what is settled since the build (a write's settling is drawn with the next draw), and
  // the rail's field drawn last
  let settledIds = settled(r.built_at);
  let railField: HTMLInputElement | undefined;
  let leave: AbortController | undefined;
  // the page's state changed: drawn at once, the view anew, the one before disposed (its root emptied, as
  // replaceChildren emptied it)
  function change(to: Partial<Drawn>): void {
    now = { ...now, ...to };
    const d = now;
    flush(() => {
      setShown(d);
    });
    draw(d);
  }
  function draw(d: Drawn): void {
    leave?.abort();
    leave = new AbortController();
    const p: Page = {
      r,
      d,
      settled: () => settledIds,
      go,
      change,
      searched,
      railDrawn: (field) => {
        railField = field;
      },
      settle,
    };
    drawnIn(into, 'the review', leave.signal, () => view(p));
  }
  function go(tab: Tab, i: number): void {
    history.replaceState(null, '', `#${tab}/${i + 1}`);
    change({ at: { tab, i }, ...(tab === now.at.tab ? {} : { filter: '' }) });
  }
  // the rail's search, folded, drawn anew, its field focused again with the caret at its end
  function searched(words: string): void {
    change({ filter: fold(words.trim()) });
    const again = railField;
    again?.focus();
    again?.setSelectionRange(again.value.length, again.value.length);
  }
  async function checkToken(t: string): Promise<Access> {
    change({ access: { state: 'checking' } });
    const c = await check(t);
    const access: Access =
      c.status === 'ok'
        ? { state: 'ok', login: c.login }
        : { state: 'refused', why: 'GitHub refused this token: it is mistyped, expired or revoked.' };
    change({ access });
    return access;
  }
  // one write at a time, each after the one before, a write that failed leaving the next one to go
  let writing: Promise<unknown> = Promise.resolve();
  function settle(id: string, claim: Claim, form: Form): void {
    const t = token();
    if (t === null) return;
    const mine = now; // the draw it is written from: the page moves on only while it is still the one shown
    form.now('writing');
    form.say('');
    const before = writing;
    const next = (async () => {
      await before;
      const w = await write(r.repository, claim, t);
      form.say(SAID[w.status](w.id));
      if (w.status === 'refused' || w.status === 'forbidden') {
        change({ access: { state: 'refused', why: SAID[w.status]() } });
        return;
      }
      markSettled(r.built_at, id);
      settledIds = settled(r.built_at);
      form.now('written');
      await new Promise((ok) => {
        setTimeout(ok, BEAT);
      });
      const q = queue(r, mine.at.tab);
      if (now === mine && q) go(mine.at.tab, nextOpen(q.ids, mine.at.i, settledIds));
    })();
    writing = next.catch(() => undefined);
    done(
      next.catch((e: unknown) => {
        form.say('The claim could not be written: try again.');
        form.now('open');
        throw e;
      }),
      'writing a claim',
    );
  }

  // the token button's dot and words, and the queues' tabs, drawn anew with each draw
  const accessButton = document.querySelector<HTMLButtonElement>('#access');
  if (accessButton) {
    instead(accessButton, 'the token button', () => (
      <Show when={shown()} keyed>
        {({ access }) => {
          const words = accessWords(access);
          const writes = access.state === 'ok';
          return (
            <>
              <span class={['review-dot', { 'is-on': writes }]} aria-hidden="true" />
              {words}
            </>
          );
        }}
      </Show>
    ));
    accessButton.addEventListener('click', openToken);
  }
  const tabs = document.querySelector('#queues');
  if (tabs)
    inside(tabs, 'the queues', () => (
      <Show when={shown()} keyed>
        {({ at }) => TABS.map((t) => tabLink(r, t, at.tab))}
      </Show>
    ));
  atEnd('the token dialog', () =>
    tokenDialog({
      repository: r.repository,
      check: checkToken,
      forget: () => {
        change({ access: { state: 'missing' } });
      },
    }),
  );
  into.textContent = ''; // the loading line
  draw(now);

  // the keys: on a queue, ← → move, a number picks a choice, n goes to the next open item (Enter writes, in the form)
  addEventListener('keydown', (ev) => {
    if (tokenOpen() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const { at } = now;
    const q = queue(r, at.tab);
    const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement;
    if (q === null || q.ids.length === 0 || typing) return;
    if (ev.key === 'ArrowRight') go(at.tab, (at.i + 1) % q.ids.length);
    else if (ev.key === 'ArrowLeft') go(at.tab, (at.i - 1 + q.ids.length) % q.ids.length);
    else if (ev.key === 'n') go(at.tab, nextOpen(q.ids, at.i, settledIds));
    else if (DIGIT.test(ev.key)) into.querySelector<HTMLButtonElement>(`.review-choice[data-key="${ev.key}"]`)?.click();
    else return;
    ev.preventDefault();
  });
  addEventListener('hashchange', () => {
    change(addressed(now));
  });

  const t = token();
  if (t !== null) done(checkToken(t), 'checking the token');
}
