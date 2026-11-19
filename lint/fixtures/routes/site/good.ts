// The intended way: a link built by routes.ts; a hash that names no route, or a route's name not at the start, is no
// link the rule reads.
import { festivalsHref } from '../../../../site/routes.ts';

export const link = festivalsHref;
export const anchor = '#top';
export const longer = '#findership';
export const named = 'the #finder';
// a community's page is a path; its hash is only an older link the site reads
export const older = '#community/oslo';
export const artist = '#artist/1';
