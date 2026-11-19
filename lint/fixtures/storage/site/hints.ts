// Exempt: hints.ts keeps what a visitor has seen.
export const seen = (key: string): boolean => localStorage.getItem(key) !== null;
