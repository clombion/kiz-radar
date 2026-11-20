// What house/tests refuses beside the two files it makes exceptions for: the imports those two may make, made by any
// other file, named as they name them.
import { dismissable } from '../../site/dismiss.ts'; // refused
import { h } from '../../site/dom.ts'; // refused
import { modal } from '../../site/modal.ts'; // refused
import { pill } from '../../site/tabs.tsx'; // refused

export const used = [dismissable, h, modal, pill];
export const site = (): Promise<unknown> => import('../../site/main.ts'); // refused
export const review = (): Promise<unknown> => import('../../site/review.ts'); // refused
