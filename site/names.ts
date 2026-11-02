// An artist's names as their page says them (artist_names, pipeline/extract/resolve_artists.py): the name recent
// festivals renamed them to, and the names each role knows a person by ("as DJ: DJ Ichigo · as teacher: Ichigo"),
// each with its years, which stop at today: a name only editions to come use is "booked for" their year. Pure: the
// day is an argument.

export interface Named {
  readonly name: string;
  readonly first: string; // its first and last festivals' start, YYYY-MM-DD
  readonly last: string;
  readonly renamed: boolean;
  readonly as: readonly string[]; // the roles that know them by it, in words
}

export function years(first: string, last: string, today: string): string {
  const [from, to] = [first.slice(0, 4), last.slice(0, 4)];
  if (first > today) return from === to ? `booked for ${from}` : `booked for ${from}–${to}`;
  if (last > today) return `since ${from}`;
  return from === to ? from : `${from}–${to}`;
}

// a role's word inside a sentence: "teacher", but "DJ"
const inline = (word: string): string => (word === word.toUpperCase() ? word : word.toLowerCase());

// the lines the page says: a rename first, then the names by role
export function nameLines(names: readonly Named[], today: string): string[] {
  const out: string[] = [];
  const renamed = names.find((n) => n.renamed);
  if (renamed) out.push(`Known as ${renamed.name} ${years(renamed.first, renamed.last, today)}.`);
  const byRole = names
    .filter((n) => n.as.length > 0)
    .map((n) => `as ${n.as.map(inline).join(' and ')}: ${n.name} (${years(n.first, n.last, today)})`);
  if (byRole.length > 1) {
    const [lead = '', ...rest] = byRole;
    out.push([`${lead.charAt(0).toUpperCase()}${lead.slice(1)}`, ...rest].join(' · '));
  }
  return out;
}
