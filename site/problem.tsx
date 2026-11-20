// The line at the top of the page that says something went wrong (report.ts). An error that escaped every boundary
// halts Solid for the rest of the page, later writes dropped (halted.browser.test.ts), and such an error is what the
// line most often says; so the line reads no signal: a JSX element, its words given as it is made and its Close
// button's click delegated to <body> (body.ts), put in with plain DOM before the start of <body>. Each report is a new
// line, the last one taken away first.
import { asElement } from './bits.ts';
import { startOfBody } from './body.ts';

let line: HTMLElement | undefined;
export function showProblem(words: string): void {
  line?.remove();
  const made = asElement(
    <p class={['status', 'error', 'problem']} role="alert">
      {words}
      <button type="button" class="link" onClick={() => line?.remove()}>
        Close
      </button>
    </p>,
    HTMLParagraphElement,
    'the problem line',
  );
  line = made;
  document.body.insertBefore(made, startOfBody());
}
