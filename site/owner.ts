// The owner everything Solid draws on the page is rendered under, through its two seams: a view (mount.tsx) and a part
// of the shell (placed.tsx). The page's, which nothing disposes. A view is shown from the router's effect (main.ts)
// when it waits for nothing and no slide defers it, in that effect's callback, which has no owner, and there Solid
// refuses a root with none (PRIMITIVE_IN_EFFECT_CALLBACK, which halts it). A view's root leaves it when the view is
// disposed; a part's stays for the page's life. A module of its own, which draws nothing, so a test can count what it
// holds.
import { createRoot, getOwner } from 'solid-js';

export const page = createRoot(getOwner);
