// The Festivals page: a sentence with blanks, festival cards below, and a sticky bar with the same choices
// (plus "More filters") once the sentence has scrolled away.

import type { JSX } from 'kiz-jsx/jsx-runtime';
import { type Accessor, createSignal, flush, For, onSettled, Show } from 'solid-js';
import { asElement, onResize, own } from './bits.ts';
import type { ClassName } from './classes.ts';
import { choices, chosen, dropdown, leftOut, only, paged } from './controls.tsx';
import type { Step } from './currency.ts';
import { today } from './days.ts';
import { site, SiteUpdating } from './db.ts';
import { eventCard } from './eventcard.tsx';
import { type Festival, festivals } from './festivals.ts';
import {
  CHECKED,
  type Choices,
  choicesAddress,
  DEFAULTS,
  isOn,
  isWith,
  matches,
  readChoices,
  type Sort,
  VALUES,
  type When,
  withPhrase,
} from './finder.ts';
import { artistHint, blanksHint, exploreHint } from './hints.ts';
import { Drawing } from './icons.ts';
import { loadingMark } from './marks.tsx';
import { currency, money, step } from './money.ts';
import { createDerived, disposal, Redrawn, type ViewProps } from './mount.tsx';
import { friendsIn } from './plans.tsx';
import { done } from './report.ts';
import { festivalsHref } from './routes.ts';
import { KEY } from './states.ts';
import { calm, flag, home, scrolling } from './ui.ts';
import { plural, text } from './wording.ts';

// every choice at its widest: the defaults with no limit of time or price (the order stays as chosen)
const { sort: _order, ...UNSORTED } = DEFAULTS;
const WIDEST = { when: 'year', reach: '' } as const;
const LOOSEST: Readonly<Omit<Choices, 'sort'>> = { ...UNSORTED, ...WIDEST };
type NumberChoice = { [K in keyof Choices]: Choices[K] extends number ? K : never }[keyof Choices];

// Hand-drawn hints next to the blanks, an arrow pointing up at what they say; also of another class while that is on
// (a hint flipped to the left of what it says, or away while the bar shows)
function note(
  cls: ClassName,
  words: readonly string[],
  also?: { readonly cls: ClassName; readonly on: Accessor<boolean> },
): JSX.Element {
  return (
    <span class={['note', cls, also !== undefined && also.on() && also.cls]} aria-hidden="true">
      <span
        ref={(el) => {
          Drawing.ARROW_UP.into(el);
        }}
        class="arrow"
      />
      <span class="hand">
        <For each={words}>
          {(t) =>
            t === 'click' ? (
              <>
                <span class="click">click</span>
                <span class="tap">tap</span>
              </>
            ) : (
              t
            )
          }
        </For>
      </span>
    </span>
  );
}

// the dance in the sentence changes every few seconds; "a" gains its n before a vowel ("an Urban Kiz festival")
const DANCES = [KEY.genre.KIZOMBA, KEY.genre.URBANKIZ, KEY.genre.TARRAXO].map((g) => text('genre', g));
const VOWEL_FIRST = /^[aeiou]/iu;
const takesAn = (word: string | null) => VOWEL_FIRST.test(word ?? '');
const WHEN_WORDS: Readonly<Record<When, string>> = {
  weekend: 'the weekend',
  months: 'the next 3 months',
  year: 'the next year',
};
const WHEN = VALUES.when.map((v) => [v, WHEN_WORDS[v]] as const);
// the sentence says it in words, the bar in short; the steps are round amounts in the visitor's currency (money.ts)
const PRICE_WORDS: Readonly<Record<Choices['reach'], string>> = {
  '': 'any price',
  fair: 'a reasonable price',
  cheap: 'a cheap price',
};
const WHEN_SHORT: Readonly<Record<When, string>> = { weekend: 'This weekend', months: '3 months', year: '1 year' };
const PRICE = VALUES.reach.map((v) => [v, PRICE_WORDS[v]] as const);
const limit = (reach: Choices['reach']): number | null => (reach ? step('trip', reach) : null);
const under = (reach: Step) => money(step('trip', reach), currency);
const SHORT = {
  when: VALUES.when.map((v) => [v, WHEN_SHORT[v]] as const),
  reach: PRICE.map(([v]) => [v, v ? `Under ${under(v)}` : 'Any price'] as const),
};
const LINEUP_WORDS: Readonly<Record<(typeof VALUES.lineup)[number], string>> = {
  0: 'Any size',
  10: '10+ artists',
  20: '20+ artists',
};
const LINEUP = VALUES.lineup.map((v) => [v, LINEUP_WORDS[v]] as const);
const ORDER_WORDS: Readonly<Record<Sort, string>> = { date: 'Soonest first', fare: 'Cheapest first' };
const ORDER = VALUES.sort.map((v) => [v, ORDER_WORDS[v]] as const);

// the festivals, once the database is in, or why they could not be read; null while it loads
type Read = { readonly all: readonly Festival[] } | { readonly unread: string } | null;

export function sentence({ qs, data }: ViewProps): JSX.Element {
  const countries = site().destinations;
  const { state: asked, dropped } = readChoices(
    qs,
    countries.map((c) => c.code),
  );
  // unknown prices are in at any price, so no choice to keep
  const kept = (c: Readonly<Choices>): Choices => (c.reach ? c : { ...c, unchecked: 0 });
  const first = kept(asked);
  const [s, set] = chosen(first, (now) => festivalsHref(choicesAddress(now)));
  // written by the results' boundary too, should they throw as the festivals come in (unloaded): meant
  const [read, setRead] = createSignal<Read>(null, { ownedWrite: true });
  const left = disposal();

  // once someone has changed a blank they've got it: fade the hints, and don't show them again
  const [hintsDone, setHintsDone] = createSignal(blanksHint.seen());
  const [arriving, setArriving] = createSignal(true);
  const [barShown, setBarShown] = createSignal(false);
  const [tabAway, setTabAway] = createSignal(false);
  const [flipped, setFlipped] = createSignal(false);
  let hero: HTMLElement | undefined, ruler: HTMLSpanElement | undefined, results: HTMLElement | undefined;
  let bar: HTMLDivElement | undefined;

  // a native select is as wide as its longest option; size the sentence blanks to the chosen one instead
  const sizeToFit = (el: HTMLSelectElement) => {
    if (ruler === undefined) return;
    ruler.textContent = el.selectedOptions[0]?.textContent ?? '';
    el.style.width = `${ruler.getBoundingClientRect().width + 4}px`;
  };
  // the hint under "anywhere" hangs to the right of it, or to the left where the menu ends near the edge: measured
  // unflipped, each change drawn at once (flushed)
  const layout = () => {
    flush(() => {
      setFlipped(false);
    });
    const right = hero?.getBoundingClientRect().right;
    if (right !== undefined && whereNote.getBoundingClientRect().right > right)
      flush(() => {
        setFlipped(true);
      });
  };
  // the blanks sized and the hint placed, as the choices, the window or the fonts change
  const refit = () => {
    if (left.aborted) return;
    for (const el of Object.values(sentenceBlanks)) sizeToFit(el);
    layout();
  };
  // these choices, then the blanks and the hint fitted to them, and then
  const choose = (to: Partial<Choices>, then?: () => void) => {
    set(kept({ ...s(), ...to }));
    refit();
    then?.();
  };
  // a link that sets these choices and shows what they give; then
  const link = (to: Partial<Choices>, words: string, then?: () => void): JSX.Element => (
    <button type="button" class="link" onClick={() => choose(to, then)}>
      {words}
    </button>
  );
  const hideHints = () => {
    setHintsDone(true);
    blanksHint.mark();
  };
  // a choice's select, on as it is drawn (on); named, where no visible label names it, by what it chooses; showing the
  // choice as it changes, in the sentence, the bar and the panel alike
  const blank = <K extends keyof Choices>(
    key: K,
    opts: readonly (readonly [Choices[K], string])[],
    {
      on = first[key],
      cls = 'blank',
      named,
    }: { readonly on?: Choices[K]; readonly cls?: ClassName; readonly named?: string } = {},
  ) =>
    asElement(
      choices(
        opts,
        on,
        (v) => {
          hideHints();
          choose(only(key, v));
        },
        { class: cls, label: named, kept: () => s()[key] },
      ),
      HTMLSelectElement,
      `the choice of ${key}`,
    );
  const DEST: [string, string][] = [['', 'anywhere'], ...countries.map((c): [string, string] => [c.code, c.name])];
  const DEST_SHORT: [string, string][] = [
    ['', 'Anywhere'],
    ...countries.map((c): [string, string] => [c.code, `${flag(c.code)} ${c.name}`]),
  ];
  const sentenceBlanks = {
    when: blank('when', WHEN, { named: 'When' }),
    country: blank('country', DEST, { named: 'Where to' }),
    reach: blank('reach', PRICE, { named: 'For what price' }),
  };
  const whereNote = asElement(
    note('note-bottom', ['click', ' to change where'], { cls: 'flip', on: flipped }),
    HTMLElement,
    'the hint of where',
  );
  // the choices that only show as tags, under the sentence and in the Filters panel alike
  const tag = ([lead, what]: readonly [string, string | undefined], remove: Partial<Choices>): JSX.Element => (
    <span class="tag">
      {lead}
      <strong>{what}</strong>{' '}
      <button type="button" class="remove" aria-label={`Remove “${String(what)}”`} onClick={own(() => choose(remove))}>
        ×
      </button>
    </span>
  );
  const tagged = (now: Readonly<Choices>): boolean => Boolean((now.with && isWith(now.with)) || now.onnow);
  const tags = (now: Readonly<Choices>): JSX.Element[] => [
    ...(now.with && isWith(now.with) ? [tag(withPhrase(now.with), { with: '' })] : []),
    ...(now.onnow ? [tag(['', text('phase', KEY.phase.ON)], { onnow: 0 })] : []),
  ];

  // a filter's checkbox; one that would keep nothing is off and greyed, saying why
  const check = (
    now: Readonly<Choices>,
    key: NumberChoice,
    label: string | null,
    why: string | null = null,
  ): JSX.Element => {
    const off = why !== null && !now[key];
    return (
      <label class={['check', off && 'check-off']}>
        <input
          type="checkbox"
          checked={Boolean(now[key])}
          disabled={off}
          onChange={(ev) => choose(only(key, ev.currentTarget.checked ? 1 : 0))}
        />{' '}
        {label}
        {off ? <span class="muted">{` (${why})`}</span> : null}
      </label>
    );
  };
  const moreFields = ({ now, on }: { readonly now: Readonly<Choices>; readonly on: boolean }): JSX.Element => (
    <>
      {tags(now).length > 0 ? <div class="with-tag">{tags(now)}</div> : null}
      <div class="core-fields">
        <label class="field">
          <span>Destination</span>
          {blank('country', DEST_SHORT, { on: now.country, cls: 'plain' })}
        </label>
      </div>
      <label class="field">
        <span>Line-up</span>
        {blank('lineup', LINEUP, { on: now.lineup, cls: 'plain' })}
      </label>
      <label class="field">
        <span>Order</span>
        {blank('sort', ORDER, { on: now.sort, cls: 'plain' })}
      </label>
      <div class="checks">
        {check(now, 'onnow', 'On now only', on ? null : 'none on today')}
        <For each={CHECKED}>{([k, feature]) => check(now, k, text('feature', feature))}</For>
        {now.reach ? check(now, 'unchecked', 'Include festivals with unknown prices') : null}
      </div>
    </>
  );
  const more = dropdown(() => [bar]);
  const moreWords = (now: Readonly<Choices>): JSX.Element => {
    const extra = (['with', 'onnow', 'lineup', 'unchecked', ...CHECKED.map(([k]) => k)] as const).filter(
      (k) => now[k] !== DEFAULTS[k],
    ).length;
    const onPhone = extra + (now.country ? 1 : 0); // on a phone the destination is one of the panel's filters
    return (
      <>
        <span class="wide">More filters</span>
        <span class="narrow">
          {'Filters'}
          {onPhone ? ` (${onPhone})` : ''}
        </span>
        <span class="wide">{extra ? ` (${extra})` : ''}</span>
        {' ▾'}
      </>
    );
  };
  // to the cards, with the bar shown at once rather than once the sentence has scrolled away, so the choices just
  // made can be changed there
  function toList(): void {
    setBarShown(true);
    setTabAway(true); // as the bar does when the sentence scrolls away
    results?.scrollIntoView({ behavior: scrolling() });
  }

  // the festivals the choices keep, once they are in, how many more a wider time and price would keep, and whether
  // any the other choices keep is on today (the On now filter keeps nothing otherwise); the results draw them, the
  // live line, the count and the panel draw what they last were, should they throw
  const { drawn, last } = createDerived(() => {
    const now = s(),
      r = read();
    if (r === null || 'unread' in r) return { now, r, rows: null, widened: 0, on: false };
    const day = today(),
      rows = matches(r.all, now, day, limit(now.reach));
    const widened =
      rows.length > 0 || (now.when === 'year' && !now.reach)
        ? 0
        : matches(r.all, { ...now, ...WIDEST }, day, null).length;
    return { now, r, rows, widened, on: matches(r.all, { ...now, onnow: 0 }, day, limit(now.reach)).some(isOn) };
  });

  const counted = (rows: readonly Festival[] | null) => (rows === null ? '' : plural(rows.length, 'festival'));
  const everyOne = (count: number) => (count === 1 ? 'this one' : 'all of these');
  const someOf = (count: number) => (count === 1 ? 'one of these' : `${count} of these`);
  // "Cédric & Christina are going to 3 of these", when featured people go to some of them
  function friendsLine(rows: readonly Festival[]): JSX.Element {
    const f = friendsIn(rows);
    if (f === null) return null;
    const which = f.n === rows.length ? everyOne(rows.length) : someOf(f.n);
    return (
      <span class="friends">
        {f.faces()}
        <span>
          {f.names()}
          {` ${f.many ? 'are' : 'is'} going to `}
          {which}
          {'. '}
        </span>
      </span>
    );
  }
  // when the time and price hide everything, a way to widen just those, keeping the place and the rest
  const widen = (widened: number) => link(WIDEST, `Show the ${widened} in the coming year, at any price`);
  // how many festivals are like that, or what to change when none is
  function liveLine(rows: readonly Festival[] | null, widened: number, r: Read): JSX.Element {
    if (r !== null && 'unread' in r) return <span class="error">{`Could not load the festivals: ${r.unread}`}</span>;
    if (rows === null) return 'Looking for festivals like that…';
    if (rows.length === 0)
      return widened ? (
        <span>
          {'None in that time or for that price. '}
          {widen(widened)}
        </span>
      ) : (
        'Nothing like that yet. Try a longer time, anywhere, or any price.'
      );
    return (
      <span>
        {`${plural(rows.length, 'festival')} like that. `}
        {/* oxlint-disable-next-line jsx-a11y/anchor-is-valid -- a link to the cards below, its click scrolling to them with the page's own motion (toList): the address is the router's, so no fragment can be its href */}
        <a
          href="#"
          onClick={(ev) => {
            ev.preventDefault();
            toList();
          }}
        >
          Show them ↓
        </a>
        {friendsLine(rows)}
      </span>
    );
  }
  // the festivals' cards, or what to change when none fits
  function resultList(rows: readonly Festival[] | null, widened: number): JSX.Element {
    if (rows === null) return loadingMark();
    if (rows.length > 0) {
      const hinted = artistHint.seen() ? undefined : rows.find((e) => e.headliners.length > 0);
      const cards = paged(rows, PAGE, (e) =>
        eventCard(e, {
          hint: e === hinted ? note('note-artist', ['click', ' a name to see where else they teach']) : null,
        }),
      );
      return (
        <div>
          <div class="festival-cards">{cards.rows}</div>
          {cards.more}
        </div>
      );
    }
    if (widened)
      return (
        <p class="empty">
          {'No festival fits that time and price. '}
          {widen(widened)}
        </p>
      );
    return (
      <p class="empty">
        {'No festival fits all of that. '}
        {link(LOOSEST, 'Show every festival in the coming year instead')}
      </p>
    );
  }

  // The festivals once the database is in, drawn with the blanks fitted again, or why they could not be read: the
  // database, or the festivals drawn as they come in (their results' throw, unloaded), either said in the page's live
  // line, the loading mark kept; the page mid-update says so itself (main.ts).
  const unread = (e: unknown) => {
    setRead({ unread: e instanceof Error ? e.message : String(e) });
  };
  let comingIn = false;
  const unloaded = (e: unknown): boolean => {
    if (comingIn) unread(e);
    return comingIn;
  };
  const arrived = async (): Promise<void> => {
    try {
      await data;
      if (left.aborted) return;
      comingIn = true;
      try {
        flush(() => {
          setRead({ all: festivals() });
        });
      } finally {
        comingIn = false;
      }
      refit();
    } catch (e) {
      if (e instanceof SiteUpdating) return;
      unread(e);
    }
  };
  done(arrived(), 'showing the festivals');
  // The sentence fades in once its fonts are in (or after a second at most), so it is laid out once, in its own
  // fonts, instead of jumping when they swap in.
  const fontsIn = async (): Promise<void> => {
    await Promise.race([
      document.fonts.ready,
      new Promise((fontsOrNot) => {
        setTimeout(fontsOrNot, 1000);
      }),
    ]);
    if (left.aborted) return;
    refit();
    requestAnimationFrame(() => {
      setArriving(false);
    });
  };
  done(fontsIn(), 'showing the sentence');
  onResize(layout, left);
  // a hint under the Explore tab, until someone has been there; the tab is the header's, drawn by tabs.tsx, outside
  // the view, so it is found in the page
  const tabNote = exploreHint.seen()
    ? null
    : asElement(
        note('note-tab', ['psst… more here'], { cls: 'away', on: tabAway }),
        HTMLElement,
        "the Explore tab's hint",
      );
  onSettled(() => {
    if (tabNote !== null) document.querySelector('a[data-nav="explore"]')?.append(tabNote);
    const io = new IntersectionObserver(
      ([en]) => {
        const away = en?.isIntersecting !== true;
        setBarShown(away);
        setTabAway(away); // don't float over the cards
      },
      { rootMargin: '-60px 0px 0px 0px' },
    );
    if (hero !== undefined) io.observe(hero);
    // the blanks fitted once the sentence is drawn, and again on the next frame, once the web font may be in
    queueMicrotask(refit);
    const frame = requestAnimationFrame(refit);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      tabNote?.remove();
    };
  });

  return (
    <>
      {leftOut(dropped)}
      <div class="sentence-page">
        <header
          ref={(el) => {
            hero = el;
          }}
          class={['sentence-hero', arriving() && 'arriving', hintsDone() && 'hints-done']}
        >
          {/* a phone's header shows only the logo */}
          <p class="kicker" aria-hidden="true">
            Kiz Radar
          </p>
          <p class="sentence">
            {'I want to go to a'}
            <span aria-hidden="true">{dances(left)}</span>
            <span class="visually-hidden">{` ${text('genre', KEY.genre.KIZOMBA)}`}</span>
            <br class="phone-break" />
            {' festival in '}
            {sentenceBlanks.when}
            {`, flying from ${home().city} to `}
            <span class="anchor">
              {sentenceBlanks.country}
              {whereNote}
            </span>
            {' for '}
            <span class="nowrap">
              {sentenceBlanks.reach}
              {'.'}
            </span>
            <span
              ref={(el) => {
                ruler = el;
              }}
              class="ruler"
              aria-hidden="true"
            />
          </p>
          <p class="with-tag" hidden={!tagged(s())}>
            <Show when={s()} keyed>
              {tags}
            </Show>
          </p>
          {note('note-inline', ['click', ' to change'])}
          <p class="live" aria-live="polite">
            <Redrawn>
              <Show when={last()} keyed>
                {({ rows, widened, r }) => liveLine(rows, widened, r)}
              </Show>
            </Redrawn>
          </p>
          <p class="nevermind">
            {link(LOOSEST, 'Show all festivals', toList)}
            {' | '}
            {link({ ...LOOSEST, when: 'weekend' }, 'this weekend only', toList)}
          </p>
        </header>
        {/* sticky bar: the same three choices in short form, the count, and "More filters" */}
        <div
          ref={(el) => {
            bar = el;
          }}
          class={['sticky-bar', barShown() && 'shown']}
          aria-label="Filters"
        >
          <div class="bar-inner">
            {blank('when', SHORT.when, { cls: 'mini', named: 'When' })}
            <span class="wide-only">{blank('country', DEST_SHORT, { cls: 'mini', named: 'Where to' })}</span>
            {blank('reach', SHORT.reach, { cls: 'mini', named: 'For what price' })}
            <span class="bar-count">{counted(last().rows)}</span>
            {more.button(
              'more-panel',
              <Show when={s()} keyed>
                {moreWords}
              </Show>,
            )}
          </div>
          <div class="more-panel" id="more-panel" hidden={!more.open()}>
            <Show when={last()} keyed>
              {moreFields}
            </Show>
          </div>
        </div>
        <section
          ref={(el) => {
            results = el;
          }}
          class="sentence-results"
        >
          <Redrawn says={unloaded}>
            <Show when={drawn()} keyed>
              {({ rows, widened }) => resultList(rows, widened)}
            </Show>
          </Redrawn>
        </section>
      </div>
    </>
  );
}

// The dance in the sentence: each shows for a few seconds, then cross-fades to the next while its slot eases to the
// new width, so the words after it slide along; the n of "an" fades in and out the same way. On a phone the dance ends
// its line. Should a dance's width still change the line breaks at some screen width, the slot keeps the widest width
// there. With reduced motion the first dance stays. Its classes are signals, each change drawn at once (flushed) where
// it is measured; its timer and listeners go with the view (left).
const SHOWN_MS = 3000;
const PAGE = 30; // festival cards shown at once, then 30 more at a time
function dances(left: AbortSignal): JSX.Element {
  const [at, setAt] = createSignal(0);
  const [nOn, setNOn] = createSignal(false);
  const [nHeld, setNHeld] = createSignal(false);
  let el: HTMLElement | undefined, n: HTMLElement | undefined;
  const words: HTMLElement[] = [];
  let i = 0,
    eases = false;
  const width = (k: number) =>
    `${eases ? (words[k]?.scrollWidth ?? 0) : Math.max(...words.map((w) => w.scrollWidth))}px`;
  const show = () => {
    flush(() => {
      setAt(i);
      setNOn(takesAn(DANCES[i] ?? null));
      setNHeld(!eases); // keeps its space and only fades, like the dance
    });
    if (el !== undefined) el.style.width = width(i);
  };
  const lines = () => [...(el?.closest('.sentence')?.querySelectorAll('select') ?? [])].map((s) => s.offsetTop).join();
  function measure() {
    if (el === undefined || n === undefined || left.aborted) return;
    // would any dance's own width change the line breaks?
    el.style.transition = 'none';
    n.style.transition = 'none';
    const seen = new Set(
      words.map((w, k) => {
        if (el !== undefined) el.style.width = `${w.scrollWidth}px`;
        flush(() => {
          setNHeld(false);
          setNOn(takesAn(DANCES[k] ?? null));
        });
        return lines();
      }),
    );
    eases = seen.size === 1;
    show();
    el.getBoundingClientRect(); // a reflow, so the transition starts from here
    el.style.transition = '';
    n.style.transition = '';
  }
  // widths change once the web font is in
  const fontsIn = async (): Promise<void> => {
    await document.fonts.ready;
    measure();
  };
  onSettled(() => {
    queueMicrotask(measure);
    done(fontsIn(), 'measuring the dances');
    onResize(measure, left);
    const timer = calm()
      ? undefined
      : setInterval(() => {
          if (document.hidden) return; // no one is looking: the next dance waits
          i = (i + 1) % words.length;
          show();
        }, SHOWN_MS);
    return () => {
      clearInterval(timer);
    };
  });
  return [
    <span
      ref={(e) => {
        n = e;
      }}
      class={['article-n', nOn() && 'is-on', nHeld() && 'held']}
    >
      n
    </span>,
    ' ',
    <span
      ref={(e) => {
        el = e;
      }}
      class="dance"
    >
      <For each={DANCES}>
        {(d, k) => (
          <span
            ref={(w) => {
              words.push(w);
            }}
            class={{ 'is-on': at() === k() }}
          >
            {d}
          </span>
        )}
      </For>
    </span>,
  ];
}
