// The admin's claims as the review dashboard writes them (pipeline/claims.py, HomeClaim and MergeClaim): each built
// with its fields in its record's order, its text as the claims repository's file holds it (JSON indented by one, then
// a newline), and its file named by its digest, the first 16 hex digits of the text's SHA-256, as claims.write names
// it. tests/site/claims.test.ts holds every committed claim to this.
export type Decision = 'merge' | 'separate';
export interface HomeClaim {
  field: 'home';
  key: string;
  country: string;
  made_at: string;
  note: string;
}
export interface MergeClaim {
  field: 'merge';
  keys: [string, string];
  decision: Decision;
  made_at: string;
  note: string;
}
export type Claim = HomeClaim | MergeClaim;

// a time as a claim's Stamp is written: to the second, in UTC
export const stamp = (at: Date): string => `${at.toISOString().slice(0, 19)}+00:00`;

const said = (note: string): string => {
  const n = note.trim();
  if (n === '') throw new Error('a claim says why: its note is empty');
  return n;
};

export const homeClaim = (key: string, country: string, note: string, at: Date): HomeClaim => ({
  field: 'home',
  key,
  country,
  made_at: stamp(at),
  note: said(note),
});

// a pair in key order, the lesser first, so that it is written one way
export const mergeClaim = ({
  keys: [a, b],
  decision,
  note,
  at,
}: {
  keys: readonly [string, string];
  decision: Decision;
  note: string;
  at: Date;
}): MergeClaim => ({
  field: 'merge',
  keys: a <= b ? [a, b] : [b, a],
  decision,
  made_at: stamp(at),
  note: said(note),
});

// a claim's text: its fields as they are in the object, the record's order when a builder here made it
export const claimText = (c: object): string => `${JSON.stringify(c, null, 1)}\n`;

const DIGITS = 16; // pipeline/records.py, DIGITS
export async function digest(text: string): Promise<string> {
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(sum, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, DIGITS);
}
