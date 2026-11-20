// What house/tests refuses beside the two files it makes exceptions for: the imports those two may make, made by any
// other file, named as they name them.
import { h } from '../../site/dom.ts'; // refused

export const used = [h];
export const site = (): Promise<unknown> => import('../../site/main.ts'); // refused
export const review = (): Promise<unknown> => import('../../site/review.ts'); // refused
