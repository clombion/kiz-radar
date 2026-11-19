// The intended way in JSX: text as a child, which Solid puts in as text; a drawing from icons.ts.
declare const said: string;
export const card = <p>{said}</p>;
export const titled = <p title={said} textContent={said} />;
