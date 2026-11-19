// What house/home refuses, everywhere: the home city or its airport in a string or a template's text, wherever the
// expression stands.
declare const city: string;
export const from = 'Bergen'; // refused
export const leaving = `Flights from Bergen`; // refused
export const airport = `${city} (BGO)`; // refused
export const isHome = (name: string): boolean => name === 'BGO'; // refused
export const labels = { ['Bergen']: 'home' }; // refused
