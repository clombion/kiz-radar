// The intended way: a control inside a card keeps its click with bits.ts's own().
import { own } from '../../../../site/bits.ts';

export const keep = own;
export const prevented = (event: Event): void => {
  event.preventDefault();
};
