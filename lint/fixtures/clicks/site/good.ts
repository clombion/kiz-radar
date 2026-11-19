// The intended way: a control inside a card keeps its click with dom.ts's own().
import { own } from '../../../../site/dom.ts';

export const keep = own;
export const prevented = (event: Event): void => {
  event.preventDefault();
};
