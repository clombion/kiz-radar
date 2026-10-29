// The Festivals page: a sentence with blanks, festival cards below, and a sticky bar with the same choices
// (plus "More filters") once the sentence has scrolled away.

import type { ClassName } from './classes.ts';
import { addDays, today } from './days.ts';
import { site } from './db.ts';
import { button, choices, dropdown, h, type Kid, moreButton, nodes, onResize, own, paged, toggle } from './dom.ts';
import { eventCard } from './eventcard.ts';
import {
  CHECKED,
  type Checked,
  changed,
  type Festival,
  festivals,
  flightEur,
  hasWith,
  isWith,
  leftOut,
  readState,
  WITH,
  withPhrase,
} from './festivals.ts';
import { artistHint, blanksHint, exploreHint } from './hints.ts';
import { currency, money, type Step, step } from './money.ts';
import { friendsIn } from './plans.ts';
import { done } from './report.ts';
import { festivalsHref, showInAddressBar } from './routes.ts';
import { KEY } from './states.ts';
import { calm, flag, home, loading, scrolling } from './ui.ts';
import { plural, text } from './wording.ts';

// reach is the step the trip (the full pass and a Fri→Mon return flight) is within, cheap or fair, or '' for any
// price; unchecked keeps the festivals whose trip is not known within it. with is a dance or highlight picked in the
// search; friends keeps the festivals that featured people said they're going to.
type Sort = 'date' | 'fare';
type Choices = {
  months: number;
  reach: '' | Step;
  country: string;
  with: string;
  friends: number;
  lineup: number;
  unchecked: number;
  sort: Sort;
} & Record<Checked, number>;
const DEFAULTS: Readonly<Choices> = {
  months: 6,
  reach: 'cheap',
  country: '',
  with: '',
  friends: 0,
  taxi: 0,
  allin: 0,
  lineup: 0,
  unchecked: 0,
  sort: 'date',
};
// every choice at its widest: the defaults with no limit of time or price (the order stays as chosen)
const { sort: _order, ...UNSORTED } = DEFAULTS;
const WIDEST = { months: 12, reach: '' } as const;
const LOOSEST: Readonly<Omit<Choices, 'sort'>> = { ...UNSORTED, ...WIDEST };
type NumberChoice = { [K in keyof Choices]: Choices[K] extends number ? K : never }[keyof Choices];

// Hand-drawn hints next to the blanks. Static SVG, so building it from a string is safe.
const ARROWS: Readonly<Record<string, string>> = {
  up: '<svg viewBox="0 0 64 52" width="54" height="44"><path d="M56 44 C36 45 18 34 13 9"/><path d="M13 9 L6 19 M13 9 L21 16"/></svg>',
};
function note(cls: ClassName, arrow: string, ...words_: string[]): HTMLElement {
  const art = h('span', { class: 'arrow' });
  art.innerHTML = ARROWS[arrow] ?? '';
  const words = h(
    'span',
    { class: 'hand' },
    ...words_.map((t) =>
      t === 'click' ? [h('span', { class: 'click' }, 'click'), h('span', { class: 'tap' }, 'tap')] : t,
    ),
  );
  return h('span', { class: ['note', cls], 'aria-hidden': 'true' }, art, words);
}

// the dance in the sentence changes every few seconds; "a" gains its n before a vowel ("an Urban Kiz festival")
const DANCES = [KEY.genre.KIZOMBA, KEY.genre.URBANKIZ, KEY.genre.TARRAXO].map((g) => text('genre', g));
const VOWEL_FIRST = /^[aeiou]/iu;
const takesAn = (word: string | null) => VOWEL_FIRST.test(word ?? '');
// in words, and in digits for screens where only the shorter form keeps the blank on the "festival in" line
const WHEN: readonly (readonly [number, string])[] = [
  [1, 'the next month'],
  [2, 'the next two months'],
  [3, 'the next three months'],
  [6, 'the next six months'],
  [12, 'the coming year'],
];
const WHEN_DIGITS: Readonly<Record<string, string>> = {
  2: 'the next 2 months',
  3: 'the next 3 months',
  6: 'the next 6 months',
};
// the sentence says it in words, the bar in short; the steps are round amounts in the visitor's currency (money.ts)
const PRICE: readonly (readonly [Choices['reach'], string])[] = [
  ['', 'any price'],
  ['fair', 'a reasonable price'],
  ['cheap', 'a cheap price'],
];
const limit = (reach: Choices['reach']): number | null => (reach ? step('trip', reach) : null);
const under = (reach: Step) => money(step('trip', reach), currency);
const SHORT = {
  months: WHEN.map(([v]) => [v, plural(v, 'month')] as const),
  reach: PRICE.map(([v]) => [v, v ? `Under ${under(v)}` : 'Any price'] as const),
};
const FLAGS = [0, 1];
const LINEUP: readonly (readonly [number, string])[] = [
  [0, 'Any size'],
  [10, '10+ artists'],
  [20, '20+ artists'],
];
const ORDER: readonly (readonly [Sort, string])[] = [
  ['date', 'Soonest first'],
  ['fare', 'Cheapest first'],
];

function matches(all: readonly Festival[], s: Readonly<Choices>): Festival[] {
  const end = addDays(today(), Math.round(s.months * 30.4));
  const max = limit(s.reach);
  return all
    .filter(
      (e): e is Festival & { depart: string } =>
        e.depart !== null &&
        e.depart <= end &&
        // with a price limit: the trip within it; sold out never; an unknown trip only when asked for
        (max === null ||
          (e.price.point === 'card_price' && e.price.key === KEY.card_price.SOLD_OUT
            ? false
            : e.trip == null
              ? Boolean(s.unchecked)
              : e.trip <= max)) &&
        (!s.country || e.country_code === s.country) &&
        (!s.with || (isWith(s.with) && hasWith(e, s.with))) &&
        (!s.friends || e.goers.some((g) => g.featured)) &&
        CHECKED.every(([k, , has]) => !s[k] || has(e)) &&
        (e.lineup ?? 0) >= s.lineup,
    )
    .sort(
      s.sort === 'fare'
        ? (a, b) =>
            (a.trip ?? 1e9) - (b.trip ?? 1e9) ||
            (flightEur(a.fare) ?? 1e9) - (flightEur(b.fare) ?? 1e9) ||
            a.depart.localeCompare(b.depart)
        : (a, b) => a.depart.localeCompare(b.depart),
    );
}

export function sentenceView(
  root: HTMLElement,
  qs: string,
  { signal, data }: { signal: AbortSignal; data: Promise<unknown> },
): void {
  let all: readonly Festival[] | null = null; // the festivals, once the database is in
  const countries = site().destinations;
  const allowed: { [K in keyof Choices]?: readonly Choices[K][] } = {
    months: WHEN.map(([v]) => v),
    reach: PRICE.map(([v]) => v),
    country: ['', ...countries.map((c) => c.code)],
    with: ['', ...WITH.keys()],
    friends: FLAGS,
    lineup: LINEUP.map(([v]) => v),
    sort: ORDER.map(([v]) => v),
    unchecked: FLAGS,
  };
  for (const [k] of CHECKED) allowed[k] = FLAGS;
  const { state: s, dropped }: { state: Choices; dropped: string[] } = readState(qs, DEFAULTS, allowed);
  // a link that sets these choices and shows what they give; then
  const choose = (to: Partial<Choices>, words: string, then?: () => void) =>
    button(
      {
        class: 'link',
        onclick: () => {
          Object.assign(s, to);
          render();
          then?.();
        },
      },
      words,
    );

  // a choice's select; named, where no visible label names it, by what it chooses
  const blank = <K extends keyof Choices>(
    key: K,
    opts: readonly (readonly [Choices[K], string])[],
    { cls = 'blank', named }: { cls?: ClassName; named?: string } = {},
  ) =>
    choices(
      opts,
      s[key],
      (v) => {
        s[key] = v;
        hideHints();
        render();
      },
      { class: cls, 'aria-label': named },
    );
  // a native select is as wide as its longest option; size the sentence blanks to the chosen one instead
  const ruler = h('span', { class: 'ruler', 'aria-hidden': 'true' });
  const sizeToFit = (el: HTMLSelectElement) => {
    ruler.textContent = el.selectedOptions[0]?.textContent ?? '';
    el.style.width = `${ruler.getBoundingClientRect().width + 4}px`;
  };
  const DEST: [string, string][] = [['', 'anywhere'], ...countries.map((c): [string, string] => [c.code, c.name])];
  const DEST_SHORT: [string, string][] = [
    ['', 'Anywhere'],
    ...countries.map((c): [string, string] => [c.code, `${flag(c.code)} ${c.name}`]),
  ];
  const sentenceBlanks = {
    months: blank('months', WHEN, { named: 'When' }),
    country: blank('country', DEST, { named: 'Where to' }),
    reach: blank('reach', PRICE, { named: 'For what price' }),
  };
  const live = h('p', { class: 'live', 'aria-live': 'polite' });
  const withTag = h('p', { class: 'with-tag' });
  // the choices that only show as tags, under the sentence and in the Filters panel alike
  const tag = ([lead, what]: readonly Kid[], remove: () => void) =>
    h(
      'span',
      { class: 'tag' },
      lead,
      h('strong', {}, what),
      ' ',
      button(
        {
          class: 'remove',
          'aria-label': `Remove “${String(what)}”`,
          onclick: own(() => {
            remove();
            render();
          }),
        },
        '×',
      ),
    );
  const tags = (): HTMLElement[] => [
    ...(s.with && isWith(s.with)
      ? [
          tag(withPhrase(s.with), () => {
            s.with = '';
          }),
        ]
      : []),
    ...(s.friends
      ? [
          tag(['With ', 'friends going'], () => {
            s.friends = 0;
          }),
        ]
      : []),
  ];
  const festivalIn = h('span', {}, ' festival in ');
  // words where they fit after "festival in", digits where only they do (narrow phones); otherwise words
  const fitMonths = () => {
    const el = sentenceBlanks.months,
      sameLine = () => Math.abs(el.offsetTop - festivalIn.offsetTop) < el.offsetHeight / 2;
    const label = (digits: boolean) => {
      for (const o of el.options)
        o.textContent = (digits && WHEN_DIGITS[o.value]) || (WHEN.find(([v]) => String(v) === o.value)?.[1] ?? o.value);
      sizeToFit(el);
    };
    label(false);
    if (!sameLine()) {
      label(true);
      if (!sameLine()) label(false);
    }
  };
  // the hint under "anywhere" hangs to the right of it, or to the left where the menu ends near the edge
  const whereNote = note('note-bottom', 'up', 'click', ' to change where');
  const placeNote = () => {
    toggle(whereNote, 'flip', false);
    if (whereNote.getBoundingClientRect().right > hero.getBoundingClientRect().right) toggle(whereNote, 'flip', true);
  };
  const layout = () => {
    fitMonths();
    placeNote();
  };
  const dance = h(
    'span',
    { class: 'dance' },
    DANCES.map((d) => h('span', {}, d)),
  );
  const n = h('span', { class: 'article-n' }, 'n');
  const hero = h(
    'header',
    { class: ['sentence-hero', 'arriving'] },
    h('p', { class: 'kicker', 'aria-hidden': 'true' }, 'Kiz Radar'), // a phone's header shows only the logo
    h(
      'p',
      { class: 'sentence' },
      'I want to go to a',
      h('span', { 'aria-hidden': 'true' }, n, ' ', dance),
      h('span', { class: 'visually-hidden' }, ' ', text('genre', KEY.genre.KIZOMBA)),
      h('br', { class: 'phone-break' }),
      festivalIn,
      sentenceBlanks.months,
      `, flying from ${home().city} to `,
      h('span', { class: 'anchor' }, sentenceBlanks.country, whereNote),
      ' for ',
      h('span', { class: 'nowrap' }, sentenceBlanks.reach, '.'),
      ruler,
    ),
    withTag,
    note('note-inline', 'up', 'click', ' to change'),
    live,
    h(
      'p',
      { class: 'nevermind' },
      choose(LOOSEST, 'Never mind, show me all events', () => results.scrollIntoView({ behavior: scrolling() })),
    ),
  );

  // sticky bar: the same three choices in short form, the count, and "More filters"
  const barBlanks = {
    months: blank('months', SHORT.months, { cls: 'mini', named: 'When' }),
    country: blank('country', DEST_SHORT, { cls: 'mini', named: 'Where to' }),
    reach: blank('reach', SHORT.reach, { cls: 'mini', named: 'For what price' }),
  };
  const barCount = h('span', { class: 'bar-count' });
  const moreBtn = moreButton('more-panel', 'More filters ▾');
  const check = (key: NumberChoice, label: string | null) => {
    const c = h('input', { type: 'checkbox' });
    c.checked = Boolean(s[key]);
    c.addEventListener('change', () => {
      s[key] = c.checked ? 1 : 0;
      render();
    });
    return h('label', { class: 'check' }, c, ' ', label);
  };
  const moreFields = () => [
    tags().length > 0 ? h('div', { class: 'with-tag' }, tags()) : null,
    h(
      'div',
      { class: 'core-fields' },
      h('label', { class: 'field' }, h('span', {}, 'Destination'), blank('country', DEST_SHORT, { cls: 'plain' })),
    ),
    h('label', { class: 'field' }, h('span', {}, 'Line-up'), blank('lineup', LINEUP, { cls: 'plain' })),
    h('label', { class: 'field' }, h('span', {}, 'Order'), blank('sort', ORDER, { cls: 'plain' })),
    h(
      'div',
      { class: 'checks' },
      check('friends', 'Only festivals friends go to'),
      ...CHECKED.map(([k, feature]) => check(k, text('feature', feature))),
      s.reach ? check('unchecked', 'Include festivals with unknown prices') : null, // at any price they are in
    ),
  ];
  const panel = h('div', { class: 'more-panel', id: 'more-panel', hidden: true }, moreFields());
  const bar = h(
    'div',
    { class: 'sticky-bar', 'aria-label': 'Filters' },
    h(
      'div',
      { class: 'bar-inner' },
      barBlanks.months,
      h('span', { class: 'wide-only' }, barBlanks.country),
      barBlanks.reach,
      barCount,
      moreBtn,
    ),
    panel,
  );
  dropdown(moreBtn, panel, [bar], signal);

  const results = h('section', { class: 'sentence-results' });
  // once someone has changed a blank they've got it: fade the hints, and don't show them again
  function hideHints() {
    toggle(hero, 'hints-done', true);
    blanksHint.mark();
  }
  if (blanksHint.seen()) toggle(hero, 'hints-done', true);
  root.replaceChildren(h('div', { class: 'sentence-page' }, hero, bar, results));
  leftOut(root, dropped);
  rotate(dance, n, signal);
  // sit flush under the site header, whatever its height on this screen
  const header = document.querySelector('header.top');
  const place_ = () => {
    if (header) bar.style.top = `${header.getBoundingClientRect().height}px`;
  };
  place_();
  onResize(place_, signal);
  // a hint under the Explore tab, until someone has been there
  const tab = document.querySelector('a[data-nav="explore"]');
  const tabNote = exploreHint.seen() ? null : note('note-tab', 'up', 'psst… more here');
  if (tabNote) tab?.append(tabNote);
  const io = new IntersectionObserver(
    ([en]) => {
      const away = !en?.isIntersecting;
      toggle(bar, 'shown', away);
      if (tabNote) toggle(tabNote, 'away', away); // don't float over the cards
    },
    { rootMargin: '-60px 0px 0px 0px' },
  );
  io.observe(hero);
  signal.addEventListener('abort', () => {
    io.disconnect();
    tabNote?.remove();
  });

  const everyOne = (count: number) => (count === 1 ? 'this one' : 'all of these');
  const someOf = (count: number) => (count === 1 ? 'one of these' : `${count} of these`);
  // "Cédric & Christina are going to 3 of these. Show only those", when featured people go to some of them
  function friendsLine(rows: readonly Festival[]): HTMLElement | null {
    const f = s.friends ? null : friendsIn(rows);
    if (f === null) return null;
    const all_ = f.n === rows.length;
    const which = all_ ? everyOne(rows.length) : someOf(f.n);
    return h(
      'span',
      { class: 'friends' },
      f.faces,
      h(
        'span',
        {},
        f.names,
        ` ${f.many ? 'are' : 'is'} going to `,
        which,
        '. ',
        all_ ? null : choose({ friends: 1 }, 'Show only those'),
      ),
    );
  }

  // the blanks and the filters as they are chosen
  function paintChoices(): void {
    if (!s.reach) s.unchecked = 0; // unknown prices are in at any price, so no choice to keep
    showInAddressBar(festivalsHref(changed(s, DEFAULTS)));
    for (const k of ['months', 'country', 'reach'] as const) {
      sentenceBlanks[k].value = String(s[k]);
      barBlanks[k].value = String(s[k]);
      sizeToFit(sentenceBlanks[k]);
    }
    layout();
    panel.replaceChildren(...nodes(moreFields()));
    const extra = (['with', 'friends', 'lineup', 'unchecked', ...CHECKED.map(([k]) => k)] as const).filter(
      (k) => s[k] !== DEFAULTS[k],
    ).length;
    const onPhone = extra + (s.country ? 1 : 0); // on a phone the destination is one of the panel's filters
    moreBtn.replaceChildren(
      h('span', { class: 'wide' }, 'More filters'),
      h('span', { class: 'narrow' }, 'Filters', onPhone ? ` (${onPhone})` : ''),
      h('span', { class: 'wide' }, extra ? ` (${extra})` : ''),
      ' ▾',
    );
    const shown = tags();
    withTag.hidden = shown.length === 0;
    withTag.replaceChildren(...shown);
  }

  // when the time and price hide everything, a way to widen just those, keeping the place and the rest
  const widen = (widened: number) => choose(WIDEST, `Show the ${widened} in the coming year, at any price`);
  const showThem = () =>
    h(
      'a',
      {
        href: '#',
        onclick: (ev: Event) => {
          ev.preventDefault();
          results.scrollIntoView({ behavior: scrolling() });
        },
      },
      'Show them ↓',
    );
  // how many festivals are like that, or what to change when none is
  function liveLine(rows: readonly Festival[], widened: number): Kid {
    if (rows.length === 0)
      return widened
        ? h('span', {}, 'None in that time or for that price. ', widen(widened))
        : 'Nothing like that yet. Try a longer time, anywhere, or any price.';
    return h(
      'span',
      {},
      `${plural(rows.length, 'festival')} like that`,
      s.reach ? h('span', {}, ` (full pass and Friday-to-Monday return flight under ${under(s.reach)}). `) : '. ',
      showThem(),
      friendsLine(rows),
    );
  }
  // the festivals' cards, or what to change when none fits
  function resultList(rows: readonly Festival[], widened: number): HTMLElement {
    if (rows.length > 0) {
      const hinted = artistHint.seen() ? -1 : firstWithArtists(rows);
      const cards = h('div', { class: 'festival-cards' }),
        more = button({ class: ['more-btn', 'show-more'] });
      paged({ list: cards, more }, rows, PAGE, (e, i) =>
        eventCard(e, {
          hint: i === hinted ? note('note-artist', 'up', 'click', ' a name to see where else they teach') : null,
        }),
      );
      return h('div', {}, cards, more);
    }
    if (widened) return h('p', { class: 'empty' }, 'No festival fits that time and price. ', widen(widened));
    return h('p', { class: 'empty' }, 'No festival fits all of that. ', choose(LOOSEST, 'Show all events instead'));
  }

  function render(): void {
    paintChoices();
    if (!all) {
      live.textContent = 'Looking for festivals like that…';
      barCount.textContent = '';
      results.replaceChildren(loading());
      return;
    }
    const rows = matches(all, s);
    const widened = rows.length > 0 || (s.months === 12 && !s.reach) ? 0 : matches(all, { ...s, ...WIDEST }).length;
    live.replaceChildren(...nodes([liveLine(rows, widened)]));
    barCount.textContent = plural(rows.length, 'festival');
    results.replaceChildren(resultList(rows, widened));
  }
  render();
  data
    .then(() => {
      if (!signal.aborted) {
        all = festivals();
        render();
      }
    })
    .catch((e: unknown) => {
      live.replaceChildren(
        h('span', { class: 'error' }, `Could not load the festivals: ${e instanceof Error ? e.message : String(e)}`),
      );
    });
  const refit = () => {
    for (const el of Object.values(sentenceBlanks)) sizeToFit(el);
    layout();
  };
  requestAnimationFrame(refit); // and again once the web font has loaded
  // The sentence fades in once its fonts are in (or after a second at most), so it is laid out once, in its own
  // fonts, instead of jumping when they swap in.
  done(
    Promise.race([document.fonts.ready, new Promise((fontsOrNot) => setTimeout(fontsOrNot, 1000))]).then(() => {
      if (signal.aborted) return;
      refit();
      requestAnimationFrame(() => toggle(hero, 'arriving', false));
    }),
    'showing the sentence',
  );
  onResize(layout, signal);
}

// Each dance shows for a few seconds, then cross-fades to the next while its slot eases to the new width, so the
// words after it slide along; the n of "an" fades in and out the same way. On a phone the dance ends its line.
// Should a dance's width still change the line breaks at some screen width, the slot keeps the widest width there.
// With reduced motion the first dance stays.
const SHOWN_MS = 3000;
const PAGE = 30; // festival cards shown at once, then 30 more at a time
function rotate(el: HTMLElement, n: HTMLElement, signal: AbortSignal): void {
  const words = [...el.children].filter((w): w is HTMLElement => w instanceof HTMLElement),
    sentence = el.closest('.sentence');
  let i = 0,
    eases = false;
  const width = (k: number) =>
    `${eases ? (words[k]?.scrollWidth ?? 0) : Math.max(...words.map((w) => w.scrollWidth))}px`;
  const show = () => {
    for (const [k, w] of words.entries()) toggle(w, 'on', k === i);
    toggle(n, 'on', takesAn(words[i]?.textContent ?? null));
    toggle(n, 'held', !eases); // keeps its space and only fades, like the dance
    el.style.width = width(i);
  };
  const lines = () => [...(sentence?.querySelectorAll('select') ?? [])].map((s) => s.offsetTop).join();
  function measure() {
    // would any dance's own width change the line breaks?
    el.style.transition = 'none';
    n.style.transition = 'none';
    const seen = new Set(
      words.map((w) => {
        el.style.width = `${w.scrollWidth}px`;
        toggle(n, 'held', false);
        toggle(n, 'on', takesAn(w.textContent));
        return lines();
      }),
    );
    eases = seen.size === 1;
    show();
    el.getBoundingClientRect(); // a reflow, so the transition starts from here
    el.style.transition = '';
    n.style.transition = '';
  }
  measure();
  done(document.fonts.ready.then(measure), 'measuring the dances'); // widths change once the web font is in
  onResize(measure, signal);
  if (calm()) return;
  const timer = setInterval(() => {
    if (document.hidden) return; // no one is looking: the next dance waits
    i = (i + 1) % words.length;
    show();
  }, SHOWN_MS);
  signal.addEventListener('abort', () => clearInterval(timer));
}

// the hint about artist names goes on the first card that has any, until someone has opened an artist
const firstWithArtists = (rows: readonly Festival[]) => rows.findIndex((e) => e.headliners.length);
