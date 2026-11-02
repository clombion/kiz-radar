// A review as review.json holds it, small: two contested homes and one unsure pair, for the dashboard's tests.
import type { Review } from '../../site/pending.ts';

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
  orphaned: [],
  steps: [],
  reads: [],
};
