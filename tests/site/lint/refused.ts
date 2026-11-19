// What lint/tests.grit refuses (tests/site/lint.test.ts), each on a line marked so: a view's values, imported,
// re-exported or loaded by import(), under any spelling of its path; an import() whose module is built at run time; a
// default import named type; a type named inside a value import, which still loads its view; an entry loaded
// anywhere but app.ts; and a module the rule does not list, which is a view until someone lists it.
import { eventCard } from '../../../site/eventcard.ts'; // refused
import { type Festival } from '../../../site/festivals.ts'; // refused
import { h } from '../../../site/dom.ts'; // refused
import { unlisted } from '../../../site/unlisted.ts'; // refused
import { tabs } from '../../../site//tabs.ts'; // refused
import { modal } from '../../../site/./modal.ts'; // refused
import type from '../../../site/dismiss.ts'; // refused

export { artistsView } from '../../../site/artists.ts'; // refused
export const used = [eventCard, h, unlisted, tabs, modal, type];
export type Used = Festival;
export const map = (): Promise<unknown> => import('../../../site/map.ts'); // refused
export const started = (): Promise<unknown> => import('../../../site/main.ts'); // refused
export const built = (name: string): Promise<unknown> => import(`../../../site/${name}`); // refused
