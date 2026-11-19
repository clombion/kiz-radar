// What goes wrong is said once: in the console, with where it happened, and in a line at the top of the page, which
// can be closed. A view that throws while it builds says so in its place (guarded), so one bad row never leaves a blank
// page; a promise left to run on its own ends in report (done); the window's listeners catch whatever else escapes.
import { button, h } from './dom.ts';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

let line: HTMLElement | undefined;
function report(e: unknown, where: string): void {
  console.error(`Kiz Radar: ${where}:`, e);
  line?.remove();
  line = h(
    'p',
    { class: ['status', 'error', 'problem'], role: 'alert' },
    `Something went wrong (${where}: ${message(e)}). Reloading the page may help. `,
    button({ class: 'link', onclick: () => line?.remove() }, 'Close'),
  );
  document.body.prepend(line);
}

// a promise the code doesn't wait for, whose failure is reported
export const done = (p: Promise<unknown>, where: string): void => {
  p.catch((e: unknown) => report(e, where));
};

// a view built in root, or, if building it throws, what went wrong in its place
export function guarded(root: HTMLElement, where: string, build: () => void): void {
  try {
    build();
  } catch (e) {
    console.error(`Kiz Radar: ${where}:`, e);
    root.replaceChildren(h('p', { class: ['status', 'error'] }, `This page could not be shown: ${message(e)}`));
  }
}

export function reportUncaught(): void {
  addEventListener('error', (ev) => report(ev.error ?? ev.message, 'the page'));
  addEventListener('unhandledrejection', (ev) => report(ev.reason, 'the page'));
}
