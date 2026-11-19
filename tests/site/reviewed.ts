// A review as review.json holds it, small: two contested homes and one unsure pair, for the dashboard's tests; and
// what the files that start the review page (app.ts's startReview) share: the instant, GitHub's answers, the page of a
// writer, and the claims it wrote.
import { digest } from '../../site/claims.ts';
import type { Review } from '../../site/pending.ts';
import type { startReview } from './app.ts';

export const REVIEW: Review = {
  built_at: '2026-10-29T18:00:00+00:00',
  repository: 'clombion/kiz-radar-claims',
  countries: [
    { code: 'AO', name: 'Angola' },
    { code: 'PT', name: 'Portugal' },
  ],
  homes: [
    {
      artist_id: 1,
      key: 'p:ana',
      name: 'Ana',
      kind: 'person',
      bookings: 3,
      basis: 'contested',
      stated: [
        { code: 'AO', festivals: 2, events: ['Kizz Luanda'] },
        { code: 'PT', festivals: 1, events: ['Lisbon Kiz'] },
      ],
      booked_in: ['PT'],
    },
    {
      artist_id: 2,
      key: 'p:bo',
      name: 'Bo',
      kind: 'person',
      bookings: 2,
      basis: 'contested',
      stated: [{ code: 'PT', festivals: 1, events: ['Lisbon Kiz'] }],
      booked_in: ['PT'],
    },
  ],
  merges: [
    {
      a: {
        key: 'p:abi',
        name: 'Abi',
        festivals: 1,
        roles: ['teacher'],
        stated: ['GB'],
        booked_in: ['GB'],
        written: ['Abi'],
      },
      b: {
        key: 'p:abi@dj',
        name: 'DJ Abi',
        festivals: 1,
        roles: ['dj'],
        stated: ['FR'],
        booked_in: ['GB'],
        written: [],
      },
      shared: 1,
      rationale: 'unsure',
    },
  ],
  artists: [
    { key: 'p:kwenda', name: 'Kwenda Lima', kind: 'person', bookings: 4, latest: ['Kizz Luanda 2026'] },
    { key: 'p:kl@dj', name: 'DJ KL', kind: 'person', bookings: 2, latest: ['Lisbon Kiz 2026'] },
    { key: 'c:ana+bo', name: 'Ana & Bo', kind: 'couple', bookings: 3, latest: [] },
  ],
  festivals: [],
  cities: [
    {
      key: 'porto-pt',
      name: 'Porto',
      country_code: 'PT',
      festivals: 2,
      events: ['Porto Kizomba', 'Kiz Gaia'],
      proposal: { tier: 'small', gateways: ['OPO', 'VGO'], note: 'OPO 25 min by metro; VGO 1 h 40 by bus' },
    },
    { key: 'faro-pt', name: 'Faro', country_code: 'PT', festivals: 1, events: ['Faro Kiz'], proposal: null },
  ],
  orphaned: [],
  steps: [],
  reads: [],
};

// The instant every review page starts on, a minute after the review's build: a claim's `at`, as the clock does not
// tick, and seven days before the writer's token expires.
export const AT = new Date('2026-10-29T18:01:23Z');
// Whose token GitHub names.
export const LOGIN = 'clombion';
// What kept.ts keeps under each of its keys: the token, the day it expires, and the items settled since the build.
export const KEPT = {
  token: 'kiz-radar-claims-token',
  expires: 'kiz-radar-claims-token-expires',
  settled: 'kiz-radar-review-settled',
} as const;

type Elsewhere = NonNullable<Parameters<typeof startReview>[0]['elsewhere']>;
// What GitHub answers a claim written with a token it knows: written, the token may not write there, or the file is
// there already.
type Write = 201 | 403 | 422;
// Where the review's claims are written: a file of the claims repository, by its name.
const CONTENTS = new RegExp(`^/repos/${REVIEW.repository}/contents/[^/]+\\.json$`, 'u');
// GitHub, knowing one token: /user names its owner when asked with it, and a claim put with it answers `write`; any
// other request with it is not found (404), so a request no test scripted shows; any request with another token is
// refused (401).
export const github =
  ({ token, write = 201 }: { token: string; write?: Write }): Elsewhere =>
  (url, init) => {
    const answer = (status: number, body: object) => Response.json(body, { status });
    if (new Headers(init.headers).get('Authorization') !== `Bearer ${token}`) {
      return answer(401, { message: 'Bad credentials' });
    }
    if (url.pathname === '/user' && (init.method ?? 'GET') === 'GET') return answer(200, { login: LOGIN });
    if (init.method === 'PUT' && CONTENTS.test(url.pathname)) return answer(write, {});
    return answer(404, { message: 'Not Found' });
  };

// A writer's page: their token kept on this device, with the day it expires, a week after AT.
const WRITER_TOKEN = 'a device token';
export const WRITER = {
  token: WRITER_TOKEN,
  storage: { local: { [KEPT.token]: WRITER_TOKEN, [KEPT.expires]: '2026-11-05' } },
} as const;

// What a writer's review page starts with: REVIEW at AT, their storage, GitHub knowing their token; and what its token
// button says once the token is checked.
export const AS_WRITER: Parameters<typeof startReview>[0] = {
  now: AT,
  review: REVIEW,
  storage: WRITER.storage,
  elsewhere: github({ token: WRITER.token }),
};
export const WRITING = `Writing as ${LOGIN} · 7 days left: make a new one soon`;

// A claim as a writer's page puts it: at the file its digest names in the claims repository, spelled here as review.json
// names it rather than read from REVIEW, so a page that ignores the review's repository fails; with the writer's token.
export const claimed = async (text: string): Promise<{ url: string; auth: string; file: string }> => ({
  url: `https://api.github.com/repos/clombion/kiz-radar-claims/contents/${await digest(text)}.json`,
  auth: `Bearer ${WRITER.token}`,
  file: text,
});

// The claims the page wrote since the request `from` of those it asked: each PUT's address, the header it was sent
// with, and the file it put, decoded from its base64.
export function writes(
  asked: Awaited<ReturnType<typeof startReview>>['asked'],
  from: number,
): { url: string; auth: string | null; file: string }[] {
  return asked
    .slice(from)
    .filter(({ init }) => init.method === 'PUT')
    .map(({ url, init }) => {
      if (typeof init.body !== 'string') throw new Error(`the PUT to ${url.href} sent no text`);
      const body: unknown = JSON.parse(init.body);
      const content = typeof body === 'object' && body !== null && 'content' in body ? String(body.content) : '';
      return {
        url: url.href,
        auth: new Headers(init.headers).get('Authorization'),
        file: new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0))),
      };
    });
}
