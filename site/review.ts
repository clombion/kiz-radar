// The review dashboard (review.html): what the pipeline did lately, and every data point waiting for an agent or the
// admin, from review.json (pipeline/review.py, built with the site's database). A home or a merge is settled here: the
// form writes the admin's claim into the claims repository (github.ts), one claim at a time, and it reaches the site at
// the next run of Refresh events, or a manual one. The festivals and the orphaned claims are settled in a session
// (docs/guides/), so they are listed only.
import { type Claim, type Decision, homeClaim, mergeClaim } from './claims.ts';
import { button, choices, h, type Kid, paged } from './dom.ts';
import { keepToken, token, write } from './github.ts';
import { get } from './net.ts';
import { type Review, reviewOf } from './pending.ts';
import { done, guarded, reportUncaught } from './report.ts';
import { KEY } from './states.ts';
import { plural } from './wording.ts';

const DATA = new URL('../data/', import.meta.url);
const PAGE = 25; // items a list shows at a time
const MINT = 'https://github.com/settings/personal-access-tokens/new';

// ----- writing: one claim at a time, each said where its form is

let writing: Promise<void> = Promise.resolve();
const SAID = {
  written: (id: string) => `Written as ${id}.json: it reaches the site at the next run.`,
  there: (id: string) => `Already written (${id}.json): nothing changed.`,
  refused: () => 'GitHub refused the token: it has expired or was revoked. Mint a new one (above).',
  forbidden: () => 'The token may not write to the claims repository: mint one with Contents read and write on it.',
} as const;

function settle(repository: string, claim: () => Claim, where: HTMLFormElement, said: HTMLElement): void {
  const auth = token();
  if (auth === null) {
    said.textContent = 'Keep a token first (at the top of the page).';
    return;
  }
  let c: Claim;
  try {
    c = claim();
  } catch (e) {
    said.textContent = e instanceof Error ? e.message : String(e);
    return;
  }
  const fields = where.querySelectorAll('button, input, select');
  for (const f of fields) f.setAttribute('disabled', '');
  said.textContent = 'Writing…';
  const next = writing.then(async () => {
    const w = await write(repository, c, auth);
    said.textContent = SAID[w.status](w.id);
    if (w.status === 'refused' || w.status === 'forbidden') for (const f of fields) f.removeAttribute('disabled');
  });
  writing = next.catch(() => undefined); // a write that failed leaves the next one to go
  done(
    next.catch((e: unknown) => {
      said.textContent = 'The claim could not be written: try again.';
      for (const f of fields) f.removeAttribute('disabled');
      throw e;
    }),
    'writing a claim',
  );
}

const formOf = (...kids: Kid[]): HTMLFormElement => {
  const f = h('form', { class: 'review-form' }, ...kids);
  f.addEventListener('submit', (ev) => ev.preventDefault());
  return f;
};
// ----- the lists

// a claim's form: its fields, a note saying why, and a button per claim it may write, each made from the note
function claimForm(
  repository: string,
  {
    fields,
    why,
    writes,
  }: { fields: Node[]; why: string; writes: readonly (readonly [string, (note: string) => Claim])[] },
): HTMLFormElement {
  const note = h('input', { type: 'text', 'aria-label': why, placeholder: 'Why: what says so', required: true });
  const said = h('span', { class: 'muted', role: 'status' });
  const f = formOf(...fields, note);
  f.append(
    ...writes.map(([words, claim]) =>
      button({ onclick: () => settle(repository, () => claim(note.value), f, said) }, words),
    ),
    said,
  );
  return f;
}

const item = (...kids: Kid[]): HTMLElement => h('li', { class: 'review-item' }, ...kids);

function homeItem(r: Review, a: Review['homes'][number]): Node {
  let country = ''; // none chosen for them: two countries tie, or no line-up says
  const pick = choices([['', 'Country…'], ...r.countries.map((c) => [c.code, c.name] as const)], country, (v) => {
    country = v;
  });
  pick.setAttribute('aria-label', `Where ${a.name} is from`);
  const stated = a.stated.map((s) => `${s.code} (${plural(s.festivals, 'festival')})`).join(', ');
  return item(
    h('p', {}, h('strong', {}, a.name), ` · ${a.kind}, ${plural(a.bookings, 'booking')} · `, h('code', {}, a.key)),
    h(
      'p',
      { class: 'muted' },
      a.basis === KEY.home_basis.CONTESTED ? `Contested: line-ups say ${stated}.` : 'No line-up says.',
    ),
    claimForm(r.repository, {
      fields: [pick],
      why: `Why ${a.name} is from there`,
      writes: [['Write the claim', (why) => homeClaim(a.key, country || noCountry(), why, new Date())]],
    }),
  );
}
const noCountry = (): never => {
  throw new Error('a home claim names a country: pick one');
};

function mergeItem(r: Review, m: Review['merges'][number]): Node {
  const decide = (decision: Decision) => (why: string) =>
    mergeClaim({ keys: [m.key_a, m.key_b], decision, note: why, at: new Date() });
  return item(
    h(
      'p',
      {},
      h('strong', {}, m.name_a),
      ' and ',
      h('strong', {}, m.name_b),
      ' · ',
      h('code', {}, `${m.key_a} ${m.key_b}`),
    ),
    h('p', { class: 'muted' }, m.evidence),
    h('p', {}, 'The review was unsure: ', m.rationale),
    claimForm(r.repository, {
      fields: [],
      why: `Why ${m.name_a} and ${m.name_b} are one artist or two`,
      writes: [
        ['One artist', decide('merge')],
        ['Two artists', decide('separate')],
      ],
    }),
  );
}

function section(title: string, count: number, about: string, ...kids: Kid[]): HTMLElement {
  return h(
    'section',
    { class: 'review-section' },
    h('h2', {}, `${title} (${count})`),
    h('p', { class: 'muted' }, about),
    ...kids,
  );
}

function pagedList<T>(items: readonly T[], row: (item: T) => Node): HTMLElement[] {
  const rows = h('ul', { class: 'review-list' });
  const more = button({ class: 'link' });
  paged({ list: rows, more }, items, PAGE, row);
  return [rows, more];
}

function tokenPanel(): HTMLElement {
  const input = h('input', { type: 'password', 'aria-label': 'Token', autocomplete: 'off' });
  const said = h('span', { class: 'muted', role: 'status' });
  const show = () => {
    said.textContent = token() === null ? 'No token: the lists are read-only.' : 'A token is kept for this tab.';
  };
  show();
  return h(
    'section',
    { class: 'review-section' },
    h('h2', {}, 'Token'),
    h(
      'p',
      { class: 'muted' },
      'The forms write the admin’s claims with a fine-grained token: the claims repository only, Contents read and ',
      'write, 366 days. It is kept for this tab only. GitHub does not tell a page when a token expires: a refused ',
      'write says it has. ',
      h('a', { href: MINT }, 'Mint a token'),
      '.',
    ),
    formOf(
      input,
      button(
        {
          onclick: () => {
            keepToken(input.value.trim() || null);
            input.value = '';
            show();
          },
        },
        'Keep',
      ),
      button(
        {
          onclick: () => {
            keepToken(null);
            show();
          },
        },
        'Forget',
      ),
      said,
    ),
  );
}

export function reviewView(into: HTMLElement, r: Review): void {
  into.replaceChildren(
    h('p', { class: 'muted' }, `Built ${r.built_at.slice(0, 16).replace('T', ' ')} UTC from the pipeline’s data.`),
    tokenPanel(),
    section(
      'Homes',
      r.homes.length,
      'Artists booked whose home country no line-up states, or two state equally often. A claim gives it.',
      ...pagedList(r.homes, (a) => homeItem(r, a)),
    ),
    section(
      'Merges',
      r.merges.length,
      'Pairs the merge review could not settle, which no claim of yours decides.',
      ...pagedList(r.merges, (m) => mergeItem(r, m)),
    ),
    section(
      'Festivals',
      r.festivals.length,
      'Festivals whose prices wait for an agent: settled in a session (docs/guides/ticket-pages.md).',
      h(
        'ul',
        { class: 'review-list' },
        r.festivals.map((f) =>
          h(
            'li',
            {},
            f.page === null ? f.event : h('a', { href: f.page }, f.event),
            ` (${f.event_id}, ${f.start}): waits for ${f.waits_for}, first read ${f.first_read}; ${f.to_do}.`,
          ),
        ),
      ),
    ),
    section(
      'Orphaned claims',
      r.orphaned.length,
      'Claims naming a key no mention produces any more: a new claim names the key the artist has now.',
      r.orphaned.map((o) => h('pre', { class: 'review-claim' }, `${o.id}.json\n${o.claim}`)),
    ),
    section(
      'Timeline',
      r.steps.length,
      'The pipeline’s steps, latest first, then the latest ticket-page reads.',
      h(
        'ul',
        { class: 'review-list' },
        r.steps.map((s) =>
          h(
            'li',
            {},
            h('strong', {}, `${s.performed_at.slice(0, 16)} ${s.step}`),
            ` (${s.performed_by}): ${s.description}`,
          ),
        ),
      ),
      h(
        'ul',
        { class: 'review-list' },
        r.reads.map((x) => h('li', {}, `${x.at.slice(0, 16)} ${x.event} (${x.event_id}): ${x.status}`)),
      ),
    ),
  );
}

async function start(into: HTMLElement): Promise<void> {
  const r = reviewOf(await (await get(new URL('review.json', DATA), { revalidate: true })).json());
  guarded(into, 'the review', () => reviewView(into, r));
}

reportUncaught();
const page = document.querySelector<HTMLElement>('#review');
if (page) done(start(page), 'loading the review');
