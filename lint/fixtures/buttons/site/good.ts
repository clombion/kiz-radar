// The intended way: dom.ts's button(), which gives it type=button; h() for any other element.
import { button, h } from '../../../../site/dom.ts';

export const close = button({ class: 'close' }, 'Close');
export const label = h('span', {}, 'Close');
