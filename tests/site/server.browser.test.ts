// The test server's data for the tests' own pages (vitest.config.ts): the fixture's (data.setup.ts), never the rows
// of the build in public/data/, at data/, and at the server's root, where Vite's transform sent db.ts's '../data/' in a
// test before site/'s /* @vite-ignore */: no site page asks there now (refactor-task-3.2.md, decision 7).
import { expect, test } from 'vitest';
import { commands } from 'vitest/browser';
import { get } from '../../site/net.ts';
import { FIXTURE_DATA } from './community.fixture.ts';

const digest = async (bytes: BufferSource) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const fixture = async (file: string) =>
  digest(Uint8Array.from(atob(await commands.readFile(`${FIXTURE_DATA}/${file}`, 'base64')), (c) => c.charCodeAt(0)));
const served = async (at: string) => digest(await (await get(new URL(at, location.origin))).arrayBuffer());

// oxlint-disable-next-line jest/no-done-callback -- test.for's callback takes the case, not a done callback
test.for(['/data/kiz.sqlite', '/kiz.sqlite'])("%s is the fixture's", async (at) => {
  expect(await served(at)).toEqual(await fixture(at.split('/').at(-1) ?? ''));
});

test("a file data/ has not is missing, never the build's", async () => {
  await expect(get(new URL('/data/LICENSE.md', location.origin))).rejects.toThrow('404');
});

test('an address with a malformed escape is no file of the fixture', async () => {
  await expect(get(new URL('/%E0%A4%A', location.origin))).rejects.toThrow('404');
});
