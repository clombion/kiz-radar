// What goes wrong is said once: in the console, with where it happened, and in a line at the top of the page, which
// can be closed (problem.tsx). A view that throws while it builds says so in its place (mount.tsx cannotShow, from its
// error boundary or from mounted, for what escapes the render), so one bad row never leaves a blank page; a promise
// left to run on its own ends in report (done); the window's listeners catch whatever else escapes. This module is the
// one place the site writes to the console (logged).
import { showProblem } from './problem.tsx';

// an error's words, or what was thrown as text
export const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// what went wrong said in the console, with where: report's, and that of a view that cannot be shown (mount.tsx)
export function logged(e: unknown, where: string): void {
  console.error(`Kiz Radar: ${where}:`, e);
}

export function report(e: unknown, where: string): void {
  logged(e, where);
  showProblem(`Something went wrong (${where}: ${message(e)}). Reloading the page may help. `);
}

// a promise the code doesn't wait for, whose failure is reported
export const done = (p: Promise<unknown>, where: string): void => {
  p.catch((e: unknown) => report(e, where));
};

export function reportUncaught(): void {
  addEventListener('error', (ev) => report(ev.error ?? ev.message, 'the page'));
  addEventListener('unhandledrejection', (ev) => report(ev.reason, 'the page'));
}
