// This week: the festivals on any day of the current calendar week, Monday to Sunday, the soonest first, those already
// under way among them; the first page of Explore.
import { meets, today, weekOf } from './days.ts';
import { h } from './dom.ts';
import { eventCard } from './eventcard.ts';
import { festivals } from './festivals.ts';
import { dayMonth } from './ui.ts';
import { plural } from './wording.ts';

export function weekView(root: HTMLElement): void {
  const week = weekOf(today());
  const on = festivals()
    .filter((e) => meets(e, week))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title));
  root.replaceChildren(
    h(
      'section',
      {},
      h(
        'header',
        { class: 'page-intro' },
        h('h1', {}, 'This week'),
        h('p', {}, `The festivals on between Monday ${dayMonth(week.from)} and Sunday ${dayMonth(week.to)}.`),
      ),
      on.length === 0
        ? h('p', { class: 'empty' }, 'No festival this week.')
        : [
            h('p', { class: 'list-summary' }, plural(on.length, 'festival')),
            h(
              'div',
              { class: 'festival-cards' },
              on.map((e) => eventCard(e)),
            ),
          ],
    ),
  );
}
