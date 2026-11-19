// Solid wired in: a component (hello.tsx) drawn by the tests' transform, with Solid's development build, and by the
// site's build (vite.config.ts), with its production build, each answering a press.
import { expect, test } from 'vitest';
import { commands, page } from 'vitest/browser';
import { greet, isDev } from './hello.tsx';

declare module 'vitest/browser' {
  interface BrowserCommands {
    // hello.tsx's one module, as vite.config.ts builds it (vitest.config.ts)
    built: () => Promise<string>;
  }
}

// what hello.tsx exports
type Hello = Readonly<{ greet: typeof greet; isDev: boolean }>;
// a module with hello.tsx's exports
const isHello = (m: unknown): m is Hello =>
  typeof m === 'object' &&
  m !== null &&
  'greet' in m &&
  typeof m.greet === 'function' &&
  'isDev' in m &&
  typeof m.isDev === 'boolean';

// the greeting drawn into a new element of the page, pressed once, then taken away
async function pressed(hello: Hello, name: string) {
  const root = document.body.appendChild(document.createElement('div'));
  const gone = hello.greet(root, name);
  const view = page.elementLocator(root);
  await expect.element(view.getByRole('paragraph')).toHaveTextContent(`Hello, ${name}. Pressed 0`);
  await view.getByRole('button', { name: 'Pressed 0' }).click();
  await expect.element(view.getByRole('paragraph')).toHaveTextContent(`Hello, ${name}. Pressed 1`);
  gone();
  expect(root.childElementCount).toBe(0);
  root.remove();
}

test("the tests draw a Solid component with Solid's development build", async () => {
  expect(isDev).toBe(true);
  await pressed({ greet, isDev }, 'tests');
});

test("the site's build draws a Solid component with Solid's production build", async () => {
  const code = await commands.built();
  expect(code).not.toContain('<Hello');
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  // oxlint-disable-next-line house/tests -- the built hello.tsx, a module of no site/ file, at a blob: address
  const built: unknown = await import(/* @vite-ignore */ url);
  URL.revokeObjectURL(url);
  if (!isHello(built)) throw new Error("the build lost hello.tsx's exports");
  expect(built.isDev).toBe(false);
  await pressed(built, 'build');
});
