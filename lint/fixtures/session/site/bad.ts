// What house/session refuses outside kept.ts and the tests: sessionStorage by any name the code gives it, read, as a
// window's property, destructured, as an object's key or a parameter, or in a type, by name or by a key in quotes.
export const token = sessionStorage.getItem('token'); // refused
export const tab = window.sessionStorage; // refused
export const { sessionStorage: store } = window; // refused
export const { sessionStorage } = window; // refused
export const shorthand = { sessionStorage }; // refused
export const keys = { sessionStorage: 'tab' }; // refused
export const kept = keys.sessionStorage; // refused
export const later = (): Storage => sessionStorage; // refused
export type Tab = typeof sessionStorage; // refused
export const quoted = window['sessionStorage']; // refused
export const templated = globalThis[`sessionStorage`]; // refused
export const asserted = window['sessionStorage' as const]; // refused
export const { ['sessionStorage']: computed } = window; // refused
