// <body> as Solid draws the shell into it (placed.tsx, problem.tsx): where it starts, and the root its delegated events
// are heard from. Solid delegates a JSX onClick to the root it renders into (render registers it); a part of the shell
// is drawn into no such root, so <body> is one, registered as the page loads, and every part's clicks reach them.
import { registerDelegatedRoot } from '@solidjs/web';

registerDelegatedRoot(document.body);

// A marker at the start of <body>, put there once, the first time it is asked for: the problem line is put before it,
// the skip link after it, so the line comes first as prepend left it.
let start: Node | undefined;
export const startOfBody = (): Node => (start ??= document.body.insertBefore(new Text(), document.body.firstChild));
