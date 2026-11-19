// The intended way: elements built with dom.ts's h(), which puts text in as text, and drawings put in by icons.ts.
import { h } from '../../../../site/dom.ts';

declare const said: string;
export const card = h('p', {}, said);
card.textContent = said;
