// What house/tests refuses beside the two files it makes exceptions for: the imports those two may make, made by any
// other file, named as they name them.
import { inPlaceOf } from '../../site/placed.tsx'; // refused

export const used = [inPlaceOf];
export const site = (): Promise<unknown> => import('../../site/main.ts'); // refused
export const review = (): Promise<unknown> => import('../../site/review.ts'); // refused
