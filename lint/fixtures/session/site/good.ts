// The intended way: the tab's storage from kept.ts, the one module that names it; localStorage is house/storage's.
import { tab } from '../../../../site/kept.ts';

export const token = tab().getItem('token');
export const said = 'The admin signs in again in a new tab.';
