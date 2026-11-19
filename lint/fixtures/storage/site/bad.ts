// What house/storage refuses outside kept.ts and the tests: localStorage by any name the code gives it, read,
// as a window's property, destructured, as an object's key or a parameter, or in a type.
export const seen = localStorage.getItem('seen'); // refused
export const box = window.localStorage; // refused
export const { localStorage: store } = window; // refused
export const { localStorage } = window; // refused
export const shorthand = { localStorage }; // refused
export const keys = { localStorage: 'seen' }; // refused
export const kept = keys.localStorage; // refused
export const later = (): Storage => localStorage; // refused
export type Box = typeof localStorage; // refused
