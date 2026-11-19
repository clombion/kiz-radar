// Exempt: tests/site/app.ts owns the page's fetch, keeping it before its own replaces it.
export const own = fetch;
