// This week: the festivals on any day of the current calendar week, Monday to Sunday, the soonest first, those already
// under way among them; the first page of Explore. Its cards are eventcard.tsx's.
import { meets, today, weekOf } from './days.ts';
import { festivalCards } from './eventcard.tsx';
import { festivals } from './festivals.ts';
import { dayMonth } from './ui.ts';
import { plural } from './wording.ts';

export function Week() {
  const week = weekOf(today());
  const on = festivals()
    .filter((e) => meets(e, week))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.title.localeCompare(b.title));
  return (
    <section>
      <header class="page-intro">
        <h1>This week</h1>
        <p>
          The festivals on between Monday {dayMonth(week.from)} and Sunday {dayMonth(week.to)}.
        </p>
      </header>
      {on.length === 0 ? (
        <p class="empty">No festival this week.</p>
      ) : (
        <>
          <p class="list-summary">{plural(on.length, 'festival')}</p>
          {festivalCards(on)}
        </>
      )}
    </section>
  );
}
