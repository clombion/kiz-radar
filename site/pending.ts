// What waits for a review, as review.json holds it (pipeline/review.py, Review): read by its shape, so the page meets
// only values the build wrote.
import { int, list, nullable, record, text } from './json.ts';

const REVIEW = record({
  built_at: text,
  repository: text,
  countries: list(record({ code: text, name: text })),
  homes: list(
    record({
      key: text,
      name: text,
      kind: text,
      bookings: int,
      basis: nullable(text),
      stated: list(record({ code: text, festivals: int })),
    }),
  ),
  merges: list(record({ key_a: text, key_b: text, name_a: text, name_b: text, evidence: text, rationale: text })),
  festivals: list(
    record({
      event_id: int,
      event: text,
      start: text,
      waits_for: text,
      first_read: text,
      page: nullable(text),
      to_do: text,
    }),
  ),
  orphaned: list(record({ id: text, claim: text })),
  steps: list(record({ step: text, description: text, performed_at: text, performed_by: text })),
  reads: list(record({ at: text, event_id: int, event: text, status: text })),
});
export type Review = ReturnType<typeof REVIEW>;
export const reviewOf = (v: unknown): Review => REVIEW(v, 'data/review.json');
