// What house/formats refuses outside ui.ts: Intl.DateTimeFormat named as a value or a type, a date's
// toLocaleDateString() or toLocaleTimeString() called, and a flight search's address in a string or a template's text.
declare const day: Date;
export const worded = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }); // refused
export type Worded = Intl.DateTimeFormat; // refused
export const date = day.toLocaleDateString('en-GB'); // refused
export const time = day.toLocaleTimeString(); // refused
export const search = 'https://www.google.com/travel/flights'; // refused
export const searchTo = (to: string): string => `https://www.google.com/travel/flights?q=${to}`; // refused
