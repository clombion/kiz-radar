// The review dashboard (review.html): the pipeline's decisions that wait for the admin, one queue per tab of the
// header's sub-navigation, and what it did lately, from review.json (pipeline/review.py, built with the site's
// database). A queue shows one item at a time, with what the machine found (a pair compared side by side, the
// countries line-ups state and the festivals that state them), beside a rail listing every item, which a search
// narrows. With a token that checks (github.ts) the item carries its choices, and writing one puts the admin's claim in
// the claims repository; it reaches the site at the next run of Refresh events. Without one the page is read-only and
// shows no choice to make. The festivals and the orphaned claims are settled in a session (docs/guides/), so they are
// listed. The tab and the item are in the address; the items settled since the build are kept in the browser.
import { type Claim, homeClaim, mergeClaim } from './claims.ts';
import { button, choices, h, type Kid, nodes, paged, toggle } from './dom.ts';
import { check, write } from './github.ts';
import { expires, forgetToken, keepExpires, keepToken, markSettled, remembered, settled, token } from './kept.ts';
import { get } from './net.ts';
import {
  type Booked,
  COMPARED,
  daysLeft,
  differs,
  type Home,
  homeId,
  homeNote,
  type Merge,
  mergeId,
  mergeNote,
  nextOpen,
  type Review,
  reviewOf,
  unjoinable,
} from './pending.ts';
import { done, guarded, reportUncaught } from './report.ts';
import { artistHref } from './routes.ts';
import { KEY } from './states.ts';
import { flag } from './ui.ts';
import { plural } from './wording.ts';

const DATA = new URL('../data/', import.meta.url);
const MINT = 'https://github.com/settings/personal-access-tokens/new';
const BEAT = 450; // ms the written state shows before the next item
const DIGIT = /^[1-9]$/u; // a choice's key
const MARKS = /\p{M}/gu; // the accents a search folds away
const SOON = 14; // days before its expiry the token's state warns
const RAIL = 60; // items the rail lists at a time

// ----- the token: missing, being checked, good (whose), or refused; the page can write only with a good one

type Access =
  | { state: 'missing' }
  | { state: 'checking' }
  | { state: 'ok'; login: string }
  | { state: 'refused'; why: string };
let access: Access = { state: 'missing' };
const canWrite = (): boolean => access.state === 'ok';

function accessWords(): string {
  switch (access.state) {
    case 'missing':
      return 'Read-only · add a token';
    case 'checking':
      return 'Checking the token…';
    case 'refused':
      return 'Read-only · token refused';
    case 'ok': {
      const day = expires();
      if (day === null) return `Writing as ${access.login}`;
      const left = daysLeft(day, new Date());
      if (left < 0) return `Token expired on ${day}`;
      return `Writing as ${access.login} · ${plural(left, 'day')} left${left <= SOON ? ': make a new one soon' : ''}`;
    }
  }
}

async function checkToken(t: string): Promise<void> {
  access = { state: 'checking' };
  render();
  const c = await check(t);
  access =
    c.status === 'ok'
      ? { state: 'ok', login: c.login }
      : { state: 'refused', why: 'GitHub refused this token: it is mistyped, expired or revoked.' };
  render();
}

function tokenDialog(repository: string): HTMLDialogElement {
  const field = h('input', {
    type: 'password',
    autocomplete: 'off',
    'aria-label': 'Token',
    placeholder: 'github_pat_…',
  });
  const day = h('input', { type: 'date', 'aria-label': 'Expires on', value: expires() ?? '' });
  const keep = h('input', { type: 'checkbox', checked: remembered() });
  const said = h('p', { class: 'review-status', role: 'status' });
  const dlg = h(
    'dialog',
    { class: 'review-dialog', 'aria-labelledby': 'token-title' },
    h('h2', { id: 'token-title' }, 'A token to write claims'),
    h(
      'ol',
      { class: 'small' },
      h(
        'li',
        {},
        h('a', { href: MINT, target: '_blank', rel: 'noopener' }, 'Make a fine-grained token'),
        ' on GitHub.',
      ),
      h('li', {}, 'Repository access: only ', h('code', {}, repository), '.'),
      h('li', {}, 'Permissions: Contents, Read and write; nothing else.'),
      h('li', {}, 'Any expiry: enter the day GitHub shows, so this page can remind you.'),
    ),
    h('label', { class: 'review-field' }, h('span', {}, 'Token'), field),
    h('label', { class: 'review-field' }, h('span', {}, 'Expires on'), day),
    h('label', { class: 'review-check' }, keep, ' Keep it on this device (otherwise for this tab only)'),
    said,
  );
  const keepIt = () => {
    const t = field.value.trim() || token();
    if (t === null) {
      said.textContent = 'Paste the token first.';
      return;
    }
    said.textContent = 'Asking GitHub…';
    keepExpires(day.value || null);
    done(
      (async () => {
        await checkToken(t);
        if (canWrite()) {
          keepToken(t, keep.checked);
          field.value = '';
          said.textContent = `${accessWords()}: the choices are on each item.`;
        } else said.textContent = access.state === 'refused' ? access.why : '';
      })(),
      'checking the token',
    );
  };
  dlg.append(
    h(
      'div',
      { class: 'review-actions' },
      button({ onclick: keepIt }, 'Check and keep'),
      button(
        {
          class: 'quiet',
          onclick: () => {
            forgetToken();
            access = { state: 'missing' };
            said.textContent = 'Forgotten: the page is read-only.';
            render();
          },
        },
        'Forget',
      ),
      button({ class: 'quiet', onclick: () => dlg.close() }, 'Close'),
    ),
  );
  return dlg;
}

// ----- queues: the items, where the page is in each, and what is settled

// the contested homes' queue is that state's, named by its key in the address
type Tab = 'merges' | 'join' | typeof KEY.home_basis.CONTESTED | 'unknown' | 'festivals' | 'orphaned' | 'timeline';
const TABS: readonly (readonly [Tab, string])[] = [
  ['merges', 'Merges'],
  ['join', 'Join two artists'],
  [KEY.home_basis.CONTESTED, 'Contested homes'],
  ['unknown', 'Unknown homes'],
  ['festivals', 'Festivals'],
  ['orphaned', 'Orphaned claims'],
  ['timeline', 'Timeline'],
];
const isTab = (v: string): v is Tab => TABS.some(([t]) => t === v);

interface Queue {
  ids: string[];
  card: (i: number) => Kid;
  lead: (i: number) => string; // the rail row's flag, or ? when no line-up states a country
  name: (i: number) => string;
  sub: (i: number) => string;
}
let review: Review | null = null;
let settledIds: Set<string> = new Set();
let at: { tab: Tab; i: number } = { tab: 'merges', i: 0 };
let filter = ''; // the rail's search, folded
let dialog: HTMLDialogElement | null = null;
let generation = 0; // bumped on each item shown, so a write that lands later never moves on from another

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
      card: (i) => mergeCard(r, m(i)),
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
      card: (i) => homeCard(r, a(i)),
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
    orphaned: r.orphaned.length,
    timeline: r.steps.length,
  })[tab];

function go(tab: Tab, i: number): void {
  history.replaceState(null, '', `#${tab}/${i + 1}`);
  if (tab !== at.tab) filter = '';
  at = { tab, i };
  render();
}
function fromAddress(): void {
  const [tab = 'merges', n = '1'] = location.hash.slice(1).split('/');
  at = { tab: isTab(tab) ? tab : 'merges', i: Math.max(0, Number.parseInt(n, 10) - 1 || 0) };
}

// ----- writing: one claim at a time, confirmed on its button, then the next open item

let writing: Promise<void> = Promise.resolve();
const SAID = {
  written: (id: string) => `Written as ${id}.json: on the site after the next run.`,
  there: (id: string) => `Already written (${id}.json): nothing changed.`,
  refused: () => 'GitHub refused the token: it has expired or was revoked. Make a new one (the token button, above).',
  forbidden: () =>
    'The token may not write there: give it Contents, Read and write, on the claims repository (the token button, above).',
} as const;

function settle(id: string, claim: Claim, pressed: HTMLButtonElement, said: HTMLElement): void {
  const r = review;
  const t = token();
  if (r === null || t === null) return;
  const mine = generation;
  const controls = pressed.closest('form')?.querySelectorAll('button, input, select') ?? [];
  for (const c of controls) c.setAttribute('disabled', '');
  pressed.textContent = 'Writing…';
  said.textContent = '';
  const next = writing.then(async () => {
    const w = await write(r.repository, claim, t);
    said.textContent = SAID[w.status](w.id);
    if (w.status === 'refused' || w.status === 'forbidden') {
      access = { state: 'refused', why: SAID[w.status]() };
      render();
      return;
    }
    markSettled(r.built_at, id);
    settledIds = settled(r.built_at);
    pressed.textContent = '✓ Written';
    toggle(pressed, 'just-picked', true);
    await new Promise((ok) => setTimeout(ok, BEAT));
    const q = queue(r, at.tab);
    if (mine === generation && q) go(at.tab, nextOpen(q.ids, at.i, settledIds));
  });
  writing = next.catch(() => undefined); // a write that failed leaves the next one to go
  done(
    next.catch((e: unknown) => {
      said.textContent = 'The claim could not be written: try again.';
      for (const c of controls) c.removeAttribute('disabled');
      pressed.textContent = 'Write the claim';
      throw e;
    }),
    'writing a claim',
  );
}

// a decision: its choices (one is picked, by click or its number key), the note saying why, which a choice fills in
// unless its maker wrote their own, and the button that writes it; read-only, none of it shows
type Choose = (value: string, noted: () => string) => void;
function decision(
  id: string,
  {
    options,
    extra,
    claim,
  }: {
    options: readonly (readonly [string, Kid, () => string])[];
    extra?: (choose: Choose) => Kid; // a control that chooses as a choice does (a country picker)
    claim: (pick: string, note: string) => Claim;
  },
): Kid {
  if (settledIds.has(id))
    return h('p', { class: ['review-status', 'small'] }, '✓ Settled since this build: on the site after the next run.');
  if (!canWrite())
    return h(
      'p',
      { class: ['review-readonly', 'small', 'muted'] },
      access.state === 'refused' ? `${access.why} ` : 'Read-only: ',
      button({ class: 'link', onclick: () => dialog?.showModal() }, 'add a token'),
      ' to decide here.',
    );
  let pick: string | null = null;
  let filled = ''; // the note a choice put there, replaced by the next choice while unchanged
  const note = h('input', {
    type: 'text',
    class: 'review-note',
    'aria-label': 'Why',
    placeholder: 'Why: what says so',
    required: true,
  });
  const said = h('p', { class: ['review-status', 'small'], role: 'status' });
  const writeIt = button({ disabled: true }, 'Write the claim');
  const ready = () => {
    writeIt.disabled = pick === null || note.value.trim() === '';
  };
  const choose: Choose = (value, noted) => {
    pick = value;
    if (note.value === filled) {
      filled = noted();
      note.value = filled;
    }
    ready();
  };
  const press = (on: HTMLButtonElement | null) => {
    for (const b of buttons) {
      b.setAttribute('aria-pressed', String(b === on));
      toggle(b, 'is-on', b === on);
    }
  };
  const buttons: HTMLButtonElement[] = options.map(([value, words, noted], n) =>
    button(
      {
        class: 'review-choice',
        'aria-pressed': 'false',
        dataset: { key: String(n + 1) },
        onclick: () => {
          press(buttons[n] ?? null);
          choose(value, noted);
          note.focus();
        },
      },
      words,
      h('kbd', {}, String(n + 1)),
    ),
  );
  note.addEventListener('input', ready);
  writeIt.addEventListener('click', () => {
    if (pick !== null) settle(id, claim(pick, note.value), writeIt, said);
  });
  const f = h(
    'form',
    { class: 'review-form' },
    h('h4', {}, 'Your decision'),
    h(
      'div',
      { class: 'review-choices' },
      buttons.length > 0 ? h('div', { class: 'seg' }, buttons) : null,
      extra?.((value, noted) => {
        press(null);
        choose(value, noted);
      }),
    ),
    h('div', { class: 'review-write' }, note, writeIt),
    said,
  );
  f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!writeIt.disabled) writeIt.click();
  });
  return f;
}

// a pair side by side: a row per thing the merge review weighed, the rows whose sides share nothing marked
function mergeCard(r: Review, m: Merge | undefined): Kid {
  if (m === undefined) return null;
  const places = new Set(['Line-ups state', 'Booked in']);
  const shown = (label: string, vs: readonly string[]): Kid => {
    if (vs.length === 0) return h('span', { class: 'muted' }, '—');
    return places.has(label) ? vs.map((v) => country(r, v)).join(', ') : vs.join(', ');
  };
  const row = (label: string, a: readonly string[], b: readonly string[], weighs = true) =>
    h(
      'tr',
      { class: weighs && differs(a, b) && 'differs' },
      h('th', { scope: 'row' }, label),
      h('td', {}, shown(label, a)),
      h('td', {}, shown(label, b)),
    );
  return [
    h('h2', {}, m.a.name, h('span', { class: 'muted' }, ' or '), m.b.name),
    h(
      'p',
      { class: ['small', 'muted'] },
      m.shared > 0
        ? `Both named in ${plural(m.shared, 'line-up')}: two names at one festival are often two people.`
        : 'Never named in the same line-up.',
    ),
    h(
      'table',
      { class: 'review-compare' },
      h(
        'thead',
        {},
        h('tr', {}, h('th', {}), h('th', { scope: 'col' }, m.a.name), h('th', { scope: 'col' }, m.b.name)),
      ),
      h(
        'tbody',
        {},
        row('Festivals', [String(m.a.festivals)], [String(m.b.festivals)]),
        COMPARED.map(([label, of, weighs]) => row(label, of(m.a), of(m.b), weighs)),
        h(
          'tr',
          {},
          h('th', { scope: 'row' }, 'Key'),
          h('td', {}, h('code', {}, m.a.key)),
          h('td', {}, h('code', {}, m.b.key)),
        ),
      ),
    ),
    h('h4', {}, 'Why the merge review was unsure'),
    h('p', { class: 'review-why' }, m.rationale),
    decision(mergeId(m), {
      options: [
        ['merge', 'One artist', () => mergeNote(m, true)],
        ['separate', 'Two artists', () => mergeNote(m, false)],
      ],
      claim: (pick, note) =>
        mergeClaim({
          keys: [m.a.key, m.b.key],
          decision: pick === 'merge' ? 'merge' : 'separate',
          note,
          at: new Date(),
        }),
    }),
  ];
}

function homeCard(r: Review, a: Home | undefined): Kid {
  if (a === undefined) return null;
  const picker = (choose: Choose) => {
    const el = choices(
      [
        ['', a.stated.length > 0 ? 'Another country…' : 'Choose the country…'],
        ...r.countries.map((c) => [c.code, c.name] as const),
      ],
      '',
      (code) => choose(code, () => homeNote(a, code, countryOf(r, code))),
    );
    el.setAttribute('aria-label', 'Country');
    return el;
  };
  return [
    h('h2', {}, a.name),
    h(
      'p',
      { class: ['small', 'muted'] },
      `${a.kind}, ${plural(a.bookings, 'booking')} · `,
      h('a', { href: `./${artistHref(a.artist_id)}`, target: '_blank', rel: 'noopener' }, 'their page on Kiz Radar ↗'),
    ),
    h('h4', {}, a.basis === KEY.home_basis.CONTESTED ? 'What line-ups state, equally often' : 'What line-ups state'),
    a.stated.length === 0
      ? h('p', { class: 'muted' }, 'No line-up states a country next to their name.')
      : h(
          'ul',
          { class: 'review-stated' },
          a.stated.map((s) =>
            h(
              'li',
              {},
              h('strong', {}, country(r, s.code)),
              ` · ${plural(s.festivals, 'line-up')}: `,
              h('span', { class: 'muted' }, s.events.join(' · ')),
            ),
          ),
        ),
    h('h4', {}, 'Booked most in'),
    h(
      'p',
      {},
      a.booked_in.map((c) => country(r, c)).join(', ') || '—',
      h('span', { class: 'muted' }, ' (where they are booked says nothing of home)'),
    ),
    decision(homeId(a), {
      options: a.stated.map(
        (s) => [s.code, country(r, s.code), () => homeNote(a, s.code, countryOf(r, s.code))] as const,
      ),
      extra: picker,
      claim: (pick, note) => homeClaim(a.key, pick || noCountry(), note, new Date()),
    }),
  ];
}
const noCountry = (): never => {
  throw new Error('a home claim names a country: pick one');
};

// ----- the page

const SVG = 'http://www.w3.org/2000/svg';
function svgOf(tag: string, attrs: Readonly<Record<string, string>>): Element {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}
// an arrow drawn, not a glyph, so it centres in its button
function chevron(d: string): Element {
  const svg = svgOf('svg', { viewBox: '0 0 24 24', width: '18', height: '18', 'aria-hidden': 'true' });
  svg.append(
    svgOf('path', {
      d,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  return svg;
}

const fold = (s: string): string => s.normalize('NFD').replace(MARKS, '').toLowerCase();

function rail(q: Queue, i: number): HTMLElement {
  const list = h('ol', { class: 'review-rows' });
  const more = button({ class: 'link' });
  const shownIds = q.ids.map((_, n) => n).filter((n) => filter === '' || fold(q.name(n)).includes(filter));
  const row = (n: number) => {
    const isSettled = settledIds.has(q.ids[n] ?? '');
    return h(
      'li',
      {},
      button(
        {
          class: ['search-row', 'review-row', isSettled && 'past'],
          'aria-selected': String(n === i),
          onclick: () => go(at.tab, n),
        },
        h('span', { class: ['lead', 'flag'], 'aria-hidden': 'true' }, isSettled ? '✓' : q.lead(n)),
        h('span', { class: 'what' }, h('span', { class: 'name' }, q.name(n)), h('span', { class: 'sub' }, q.sub(n))),
      ),
    );
  };
  paged({ list, more }, shownIds, RAIL, row);
  const search = h('input', {
    type: 'search',
    placeholder: `Find among ${q.ids.length}…`,
    'aria-label': 'Find',
    value: filter,
  });
  search.addEventListener('input', () => {
    filter = fold(search.value.trim());
    render();
    const again = document.querySelector<HTMLInputElement>('.review-rail input[type="search"]');
    again?.focus();
    again?.setSelectionRange(again.value.length, again.value.length);
  });
  return h(
    'aside',
    { class: 'review-rail', 'aria-label': 'Every item' },
    h('div', { class: 'toolbar' }, search),
    list,
    more,
  );
}

function queueView(q: Queue): Kid {
  const i = Math.min(at.i, Math.max(0, q.ids.length - 1));
  generation++;
  const move = (to: number) => () => go(at.tab, (to + q.ids.length) % q.ids.length);
  return h(
    'div',
    { class: 'review-queue' },
    h(
      'article',
      { class: ['country-row', 'review-card'], 'aria-label': 'The item' },
      q.card(i),
      h(
        'div',
        { class: 'review-foot' },
        button({ class: 'quiet', onclick: move(i - 1), 'aria-label': 'Previous item' }, chevron('m15 18-6-6 6-6')),
        h('span', { class: ['review-place', 'small', 'muted'] }, `${i + 1} of ${q.ids.length}`),
        button({ class: 'quiet', onclick: move(i + 1), 'aria-label': 'Next item' }, chevron('m9 18 6-6-6-6')),
        button({ class: 'quiet', onclick: () => go(at.tab, nextOpen(q.ids, i, settledIds)) }, 'Next open'),
        h('span', { class: ['small', 'muted', 'review-keys'] }, '← → move · 1, 2 choose · Enter writes · n next open'),
      ),
    ),
    rail(q, i),
  );
}

const when = (s: string) => s.slice(0, 16).replace('T', ' ');
// ----- joining any two artists: a search for each side, then the merge claim that makes them one

const SHOWN = 8; // the matches a side's search lists
const picked: [Booked | null, Booked | null] = [null, null];

function bookedCard(a: Booked, change: () => void): Kid {
  return h(
    'div',
    {},
    h('h3', {}, a.name),
    h('p', { class: ['small', 'muted'] }, `${a.kind}, ${plural(a.bookings, 'booking')} · `, h('code', {}, a.key)),
    h('p', { class: 'small' }, a.latest.join(' · ') || '—'),
    button({ class: 'link', onclick: change }, 'Choose another'),
  );
}

function sidePicker(r: Review, n: 0 | 1): HTMLElement {
  const chosen = picked[n];
  const title = n === 0 ? 'One name' : 'The other name';
  if (chosen)
    return h(
      'article',
      { class: 'country-row' },
      h('h4', {}, title),
      bookedCard(chosen, () => {
        picked[n] = null;
        render();
      }),
    );
  const list = h('ol', { class: 'review-rows' });
  const search = h('input', { type: 'search', placeholder: `Find among ${r.artists.length}…`, 'aria-label': title });
  const show = () => {
    const f = fold(search.value.trim());
    const found = f === '' ? [] : r.artists.filter((a) => fold(a.name).includes(f)).slice(0, SHOWN);
    list.replaceChildren(
      ...found.map((a) =>
        h(
          'li',
          {},
          button(
            {
              class: ['search-row', 'review-row'],
              onclick: () => {
                picked[n] = a;
                render();
              },
            },
            h(
              'span',
              { class: 'what' },
              h('span', { class: 'name' }, a.name),
              h('span', { class: 'sub' }, `${a.kind}, ${plural(a.bookings, 'booking')} · ${a.latest[0] ?? ''}`),
            ),
          ),
        ),
      ),
    );
  };
  search.addEventListener('input', show);
  return h('article', { class: 'country-row' }, h('h4', {}, title), h('div', { class: 'toolbar' }, search), list);
}

function joinView(r: Review): Kid {
  const [a, b] = picked;
  const why = a && b ? unjoinable(a, b) : null;
  const group = a?.kind === KEY.artist_kind.GROUP || b?.kind === KEY.artist_kind.GROUP;
  return [
    h('div', { class: 'review-grid' }, sidePicker(r, 0), sidePicker(r, 1)),
    a && b
      ? h(
          'article',
          { class: ['country-row', 'review-card'] },
          h('h2', {}, a.name, h('span', { class: 'muted' }, ' and '), b.name),
          why === null
            ? [
                group
                  ? h(
                      'p',
                      { class: ['small', 'muted'] },
                      'A name several people share is a group: list it in pipeline/extract/groups.csv rather than merge one member into it.',
                    )
                  : null,
                decision(`merge ${a.key <= b.key ? `${a.key} ${b.key}` : `${b.key} ${a.key}`}`, {
                  options: [['merge', 'One artist', () => `${a.name} / ${b.name}: one artist, under two names`]],
                  claim: (_, note) => mergeClaim({ keys: [a.key, b.key], decision: 'merge', note, at: new Date() }),
                }),
              ]
            : h('p', {}, why),
        )
      : null,
  ];
}

function listView(r: Review, tab: Tab): Kid {
  if (tab === 'join') return joinView(r);
  if (tab === 'festivals')
    return h(
      'div',
      { class: 'review-grid' },
      r.festivals.map((f) =>
        h(
          'article',
          { class: 'country-row' },
          h('h3', {}, f.page === null ? f.event : h('a', { href: f.page, target: '_blank', rel: 'noopener' }, f.event)),
          h(
            'p',
            { class: ['small', 'muted'] },
            `${f.start} · festival ${f.event_id} · waits for ${f.waits_for}, first read ${f.first_read}`,
          ),
          h('p', {}, `To do: ${f.to_do}.`),
        ),
      ),
    );
  if (tab === 'orphaned')
    return r.orphaned.map((o) =>
      h('article', { class: 'country-row' }, h('h3', {}, `${o.id}.json`), h('pre', { class: 'review-claim' }, o.claim)),
    );
  const entry = (time: string, what: string, more: string) =>
    h(
      'li',
      {},
      h('span', { class: ['small', 'muted'] }, when(time)),
      h('strong', {}, what),
      h('span', { class: 'small' }, more),
    );
  return h(
    'div',
    { class: 'review-grid' },
    h(
      'article',
      { class: 'country-row' },
      h('h3', {}, 'Steps, latest first'),
      h(
        'ol',
        { class: 'review-timeline' },
        r.steps.map((s) => entry(s.performed_at, s.step, s.description)),
      ),
    ),
    h(
      'article',
      { class: 'country-row' },
      h('h3', {}, 'Latest ticket-page reads'),
      h(
        'ol',
        { class: 'review-timeline' },
        r.reads.map((x) => entry(x.at, x.event, `${x.status} · festival ${x.event_id}`)),
      ),
    ),
  );
}

const ABOUT: Readonly<Record<Tab, string>> = {
  join: 'Two artists the matching never paired: one who changed their name, or goes by another as a DJ. Find each, then say they are one.',
  merges: 'Pairs the merge review could not settle, which no claim of yours decides: one artist, or two.',
  contested: 'Artists whose line-ups state two or more countries equally often: which one is home.',
  unknown: 'Artists booked whose home no line-up states, most booked first.',
  festivals: 'Festivals whose prices wait for an agent: settled in a session (docs/guides/ticket-pages.md).',
  orphaned: 'Claims naming a key no mention produces any more: a new claim names the key the artist has now.',
  timeline: 'What the pipeline did lately.',
};

let root: HTMLElement | null = null;
function render(): void {
  const r = review;
  const into = root;
  if (r === null || into === null) return;
  const accessButton = document.querySelector<HTMLButtonElement>('#access');
  if (accessButton) {
    accessButton.replaceChildren(
      h('span', { class: ['review-dot', canWrite() && 'is-on'], 'aria-hidden': 'true' }),
      accessWords(),
    );
    accessButton.onclick = () => dialog?.showModal();
  }
  document
    .querySelector('#queues')
    ?.replaceChildren(
      ...TABS.map(([tab, words]) =>
        h(
          'a',
          { href: `#${tab}/1`, class: tab === at.tab && 'active', 'aria-current': tab === at.tab ? 'page' : null },
          words,
          ' ',
          count(r, tab) === null ? null : h('small', { class: 'num' }, String(count(r, tab))),
        ),
      ),
    );
  guarded(into, 'the review', () => {
    const q = queue(r, at.tab);
    const settledHere = q === null ? 0 : q.ids.filter((id) => settledIds.has(id)).length;
    into.replaceChildren(
      ...nodes([
        h(
          'p',
          { class: 'list-summary' },
          ABOUT[at.tab],
          q === null
            ? null
            : ` ${q.ids.length - settledHere} open${settledHere > 0 ? `, ${settledHere} settled since the build` : ''}.`,
          ` Built ${when(r.built_at)} UTC.`,
        ),
        q === null ? listView(r, at.tab) : q.ids.length === 0 ? h('p', {}, 'Nothing waits here.') : queueView(q),
      ]),
    );
  });
}

// the keys: on a queue, ← → move, a number picks a choice, n goes to the next open item (Enter writes, in the form)
function onKey(ev: KeyboardEvent): void {
  const r = review;
  if (r === null || dialog?.open === true || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const q = queue(r, at.tab);
  const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement;
  if (q === null || q.ids.length === 0 || typing) return;
  if (ev.key === 'ArrowRight') go(at.tab, (at.i + 1) % q.ids.length);
  else if (ev.key === 'ArrowLeft') go(at.tab, (at.i - 1 + q.ids.length) % q.ids.length);
  else if (ev.key === 'n') go(at.tab, nextOpen(q.ids, at.i, settledIds));
  else if (DIGIT.test(ev.key)) root?.querySelector<HTMLButtonElement>(`.review-choice[data-key="${ev.key}"]`)?.click();
  else return;
  ev.preventDefault();
}

export function reviewView(into: HTMLElement, r: Review): void {
  root = into;
  review = r;
  settledIds = settled(r.built_at);
  dialog?.remove();
  dialog = tokenDialog(r.repository);
  document.body.append(dialog);
  fromAddress();
  render();
  const t = token();
  if (t !== null) done(checkToken(t), 'checking the token');
}

async function start(into: HTMLElement): Promise<void> {
  const r = reviewOf(await (await get(new URL('review.json', DATA), { revalidate: true })).json());
  reviewView(into, r);
}

reportUncaught();
addEventListener('keydown', onKey);
addEventListener('hashchange', () => {
  fromAddress();
  render();
});
const page = document.querySelector<HTMLElement>('#review');
if (page) done(start(page), 'loading the review');
