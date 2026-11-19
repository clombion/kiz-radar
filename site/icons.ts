// The drawings the page shows: Lucide's line icons, by their Lucide names, and the site's own few, written as data in
// pipeline/drawings.py, from which site/drawings.ts is generated. Which feature shows which, and in what words, is
// pipeline/states.py's.
import { LUCIDE as LINES, type LucideName, OWN } from './drawings.ts';
import { iconOf, type Key, type KeysWhere, text, where } from './wording.ts';

// a drawing's markup, as drawings.ts writes it: an <svg> hidden from assistive technology
type Markup = (typeof LINES)[keyof typeof LINES] | (typeof OWN)[keyof typeof OWN];

// A drawing the page shows. Only this class makes one, from a drawing of drawings.ts, so no text from the data or the
// address ever becomes markup; and only it puts markup in an element (house/markup, lint/markup.ts, holds innerHTML
// here). Each is hidden from assistive technology, as pipeline/drawings.py writes it: a drawing is shown beside the
// words that say what it means, or in a button named by them, so a screen reader reading it would say nothing more.
export class Drawing {
  readonly #markup: Markup;
  private constructor(markup: Markup) {
    this.#markup = markup;
  }
  // the hand-drawn arrow of the hints next to the Festivals page's blanks
  static readonly ARROW_UP = new Drawing(OWN['arrow-up']);
  // the map's sheet handle
  static readonly CHEVRON = new Drawing(OWN.chevron);
  // a community page's privacy: a lock, and people, people also the share card's eyebrow
  static readonly LOCK = new Drawing(LINES.lock);
  static readonly PEOPLE = new Drawing(LINES.users);
  // what a list is, behind a button
  static readonly INFO = new Drawing(LINES.info);
  // a community's calendar's steps to the four months before and after
  static readonly PREVIOUS = new Drawing(LINES['chevron-left']);
  static readonly NEXT = new Drawing(LINES['chevron-right']);
  // the review page's steps between items
  static readonly PREVIOUS_ITEM = new Drawing(OWN['previous-item']);
  static readonly NEXT_ITEM = new Drawing(OWN['next-item']);
  // a trip's roster by travel and by place
  static readonly BED = new Drawing(LINES['bed-double']);
  static readonly PLANE = new Drawing(LINES.plane);
  // today in a month, the site's and the share card's
  static readonly RING = new Drawing(OWN.ring);
  // a Lucide icon, by its name: one drawings.ts has, so a name it lacks fails to compile
  static lucide(name: LucideName): Drawing {
    return new Drawing(LINES[name]);
  }
  // the element given, with the drawing in it
  into<E extends Element>(el: E): E {
    el.innerHTML = this.#markup;
    return el;
  }
}
// the icon a feature is drawn with (pipeline/states.py names it)
export const icon = (feature: Key<'feature'>): Drawing => Drawing.lucide(iconOf('feature', feature));
// a dance's icon in the search, which no feature has: a note
export const NOTE = Drawing.lucide('music');

// Features that tell festivals apart as [key, words, icon], in the order they matter to someone deciding whether to
// go: those a card shows, and the rest, shown once a card is open.
// the features a page shows
type Shown = KeysWhere<'feature', 'card' | 'view'>;
export type Trait = readonly [Shown, string, Drawing];
const trait = (key: Shown): Trait => [key, text('feature', key), icon(key)];
export const TRAITS = where('feature', 'card').map(trait);
export const MORE_TRAITS = where('feature', 'view').map(trait);
