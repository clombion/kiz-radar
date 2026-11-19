// Exempt: ui.ts words the dates and links the flight searches.
declare const day: Date;
export const worded = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
export const date = day.toLocaleDateString('en-GB');
export const search = (to: string): string => `https://www.google.com/travel/flights?q=${to}`;
