// What house/legacy refuses in a Solid file: drawing by hand, and dom.ts imported, re-exported or loaded, its types
// too, by any spelling of its path.
import { h } from '../../../../site/dom.ts'; // refused
import type { Kid } from '../../../../site/dom.ts'; // refused
import { replaceChildren } from './dom'; // refused
import { toggle } from './dom.js'; // refused
export { button } from '../../../../site/dom.ts'; // refused
export * from '../../../../site/dom.ts'; // refused

declare const root: HTMLElement;
declare const kids: Kid[];
root.replaceChildren(h('p', {}, 'x')); // refused
replaceChildren(root, kids); // refused
export const made = document.createElement('p'); // refused
export const drawn = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); // refused
export const maybe = root.ownerDocument?.createElement('p'); // refused
export const keyed = document['createElement']('p'); // refused
export const loaded = import('../../../../site/dom.ts'); // refused
export const called = document.createElement.call(document, 'p'); // refused
export const handed = document.createElementNS.bind(document); // refused
export const { createElement } = document; // refused
export const toggled = toggle;
