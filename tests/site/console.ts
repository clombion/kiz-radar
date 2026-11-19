// What a browser test's window says to its console: a warning or an error nobody declared fails the test, so that what
// Solid's development build reports (its diagnostics are console warnings and errors), and what report.ts says went
// wrong, is never passed over. console.setup.ts, the browser projects' setup file (vitest.config.ts), puts the guard on
// the window each test file runs in, which is the page's too (app.ts starts the site in it). It hears console.warn,
// console.error and a failing console.assert (an error: Chromium's own assert never calls console.error). A test
// declares what it expects, before it is said: expectConsole(kind, pattern, times = 1), for this test alone, and it
// must then be said exactly that many times; what it matches is not printed. A test that replaces console.warn or
// console.error (vi.spyOn) would hide what is said from the guard, and fails. A warning or an error said outside a test
// (as a file's page starts, or between tests) fails the file, in its last afterAll; what is said after that is not
// heard. The frames of pages.browser.test.ts are windows of their own, with their own console, which that file hears;
// what the browser itself writes to the console (a failed request, a refusal of the page's policy) is no call of the
// window's console, and not heard here.
import { afterAll, afterEach, beforeEach } from 'vitest';

type Kind = 'warn' | 'error';
interface Said {
  readonly kind: Kind;
  readonly text: string;
}
interface Expected {
  readonly kind: Kind;
  readonly pattern: RegExp;
  readonly times: number;
  heard: number;
}

const KINDS: readonly Kind[] = ['warn', 'error'];
const ASSERT = 'assert'; // the console's method, named by a key as warn and error are
const GUARDED = Symbol.for('kiz-radar console guard'); // set on the window the guard holds
// what was said and nobody declared: in the test that runs, or outside any
let unexpected: Said[] = [];
const outside: Said[] = [];
// what the test that runs declared, or undefined between tests
let expected: Expected[] | undefined;
// the guard's own console.warn and console.error, which a test must leave in place
const guards = new Map<Kind, unknown>();

// a console call's words, as the console prints its arguments
const words = (args: readonly unknown[]): string => args.map(String).join(' ');
const listed = (said: readonly Said[]): string => said.map(({ kind, text }) => `console.${kind}: ${text}`).join('\n');
const declared = (e: Readonly<Expected>): string =>
  `expectConsole('${e.kind}', ${String(e.pattern)}${e.times === 1 ? '' : `, ${String(e.times)}`})`;

// A warning or an error this test expects its page to say, exactly `times` times, matched on the call's words (its
// arguments, each as String gives it, joined by a space); called inside the test, before it is said. A pattern with
// the g or y flag is refused: its test() would move its lastIndex and skip the next match.
export function expectConsole(kind: Kind, pattern: RegExp, times = 1): void {
  if (expected === undefined) throw new Error('expectConsole() declares what a test expects: call it inside the test');
  if (pattern.global || pattern.sticky) throw new Error(`expectConsole(): ${String(pattern)} has the g or y flag`);
  if (!Number.isInteger(times) || times < 1) throw new Error(`expectConsole(): times is a count, not ${String(times)}`);
  expected.push({ kind, pattern, times, heard: 0 });
}

// what is said, of a kind: counted against what the test declared and not printed (the first declaration it matches
// that is not yet met, else the first it matches), or kept and printed
function hear(kind: Kind, text: string, print: () => void): void {
  const matching = (expected ?? []).filter((e) => e.kind === kind && e.pattern.test(text));
  const known = matching.find((e) => e.heard < e.times) ?? matching[0];
  if (known !== undefined) {
    known.heard += 1;
    return;
  }
  (expected === undefined ? outside : unexpected).push({ kind, text });
  print();
}
// the console's method of a kind, heard
const heard =
  (kind: Kind, say: (...args: readonly unknown[]) => void) =>
  (...args: readonly unknown[]): void => {
    hear(kind, words(args), () => Reflect.apply(say, console, args));
  };
// console.assert, heard as an error when its condition fails, in Chromium's words
const asserted =
  (say: (condition?: boolean, ...args: readonly unknown[]) => void) =>
  (condition?: boolean, ...args: readonly unknown[]): void => {
    if (condition === true || Boolean(condition)) return;
    const text = args.length === 0 ? 'Assertion failed' : `Assertion failed: ${words(args)}`;
    hear('error', text, () => Reflect.apply(say, console, [condition, ...args]));
  };

// what the test left wrong: a console method not the guard's, put back; what was said undeclared; a declaration not met
function problems(said: readonly Said[], declarations: readonly Readonly<Expected>[]): string[] {
  const replaced = KINDS.filter((kind) => console[kind] !== guards.get(kind));
  for (const kind of replaced) Reflect.set(console, kind, guards.get(kind));
  return [
    ...replaced.map(
      (kind) =>
        `console.${kind} was replaced, which hides what is said from the guard: declare it with expectConsole()`,
    ),
    ...(said.length > 0 ? [`the console was told what no expectConsole() declared:\n${listed(said)}`] : []),
    ...declarations
      .filter((e) => e.heard !== e.times)
      .map((e) =>
        e.heard === 0
          ? `${declared(e)} was declared and never said`
          : `${declared(e)} was said ${String(e.heard)} times, not ${String(e.times)}`,
      ),
  ];
}

// the window's console heard, and each test held to what it declared
export function guard(): void {
  // a window that ran another file's tests: its console already guarded, and a halt of Solid there would last here
  if (Reflect.has(globalThis, GUARDED))
    throw new Error('this window already ran a test file: each browser test file has a frame of its own (isolate)');
  Reflect.set(globalThis, GUARDED, true);
  for (const kind of KINDS) {
    const wrapper = heard(kind, console[kind]);
    guards.set(kind, wrapper);
    console[kind] = wrapper;
  }
  console[ASSERT] = asserted(console[ASSERT]);
  beforeEach(() => {
    unexpected = [];
    expected = [];
  });
  afterEach(() => {
    const found = problems(unexpected, expected ?? []);
    expected = undefined;
    unexpected = [];
    if (found.length > 0) throw new Error(found.join('\n'));
  });
  afterAll(() => {
    if (outside.length > 0) throw new Error(`the console was told, outside any test:\n${listed(outside)}`);
  });
}
