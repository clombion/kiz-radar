// An artist's names as their page says them: years that stop at today, a rename, and the names by role.
import { expect, test } from 'vitest';
import { type Named, nameLines, years } from '../../site/names.ts';

const TODAY = '2026-11-02';
const named = (name: string, first: string, last: string, rest: Partial<Named> = {}): Named => ({
  name,
  first,
  last,
  renamed: false,
  as: [],
  ...rest,
});

test('a name’s years stop at today: editions to come say since, or booked for when it is all they are', () => {
  expect(years('2025-03-01', '2025-09-01', TODAY)).toBe('2025');
  expect(years('2024-03-01', '2026-01-01', TODAY)).toBe('2024–2026');
  expect(years('2025-03-01', '2027-02-01', TODAY)).toBe('since 2025');
  expect(years('2027-02-01', '2027-05-01', TODAY)).toBe('booked for 2027');
  expect(years('2026-12-01', '2027-05-01', TODAY)).toBe('booked for 2026–2027');
});

test('the names by role are said only when two roles know them by different names', () => {
  expect(
    nameLines(
      [
        named('DJ Ichigo', '2026-01-08', '2027-04-23', { as: ['DJ'] }),
        named('Ichigo', '2026-01-08', '2026-05-01', { as: ['Teacher'] }),
      ],
      TODAY,
    ),
  ).toEqual(['As DJ: DJ Ichigo (since 2026) · as teacher: Ichigo (2026)']);
  expect(nameLines([named('Ti Wosh', '2026-01-22', '2026-03-01', { as: ['DJ', 'Teacher'] })], TODAY)).toEqual([]);
});

test('a rename leads', () => {
  expect(nameLines([named('Abby', '2026-02-01', '2026-10-01', { renamed: true })], TODAY)).toEqual([
    'Known as Abby 2026.',
  ]);
});
