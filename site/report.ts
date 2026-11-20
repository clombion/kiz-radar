// What goes wrong is said once: in the console, with where it happened, and in a line at the top of the page, which
// can be closed (problem.tsx). A view that throws while it builds says so in its place (an h() view through guarded, a
// Solid view through its error boundary, mount.tsx), so one bad row never leaves a blank page; a promise left to run on
// its own ends in report (done); the window's listeners catch whatever else escapes.
import { h } from './dom.ts';
import { showProblem } from './problem.tsx';

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function report(e: unknown, where: string): void {
  console.error(`Kiz Radar: ${where}:`, e);
  showProblem(`Something went wrong (${where}: ${message(e)}). Reloading the page may help. `);
}

// a promise the code doesn't wait for, whose failure is reported
export const done = (p: Promise<unknown>, where: string): void => {
  p.catch((e: unknown) => report(e, where));
};

// What a view that threw while it built says in its place, said in the console too, naming the view: guarded's, and a
// Solid view's error boundary's (mount.tsx).
export function cannotShow(where: string, e: unknown): HTMLElement {
  console.error(`Kiz Radar: ${where}:`, e);
  return h('p', { class: ['status', 'error'] }, `This page could not be shown: ${message(e)}`);
}

// a view built in root, or, if building it throws, what went wrong in its place
export function guarded(root: HTMLElement, where: string, build: () => void): void {
  try {
    build();
  } catch (e) {
    root.replaceChildren(cannotShow(where, e));
  }
}

export function reportUncaught(): void {
  addEventListener('error', (ev) => report(ev.error ?? ev.message, 'the page'));
  addEventListener('unhandledrejection', (ev) => report(ev.reason, 'the page'));
}
