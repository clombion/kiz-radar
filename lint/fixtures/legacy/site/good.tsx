// The intended way: JSX, rendered by Solid into the root a view is handed; modules other than the site's dom.ts
// imported: a package's dom, and one whose name starts like it.
import { render } from '@solidjs/web';
import { screen } from '@testing-library/dom';
import { dayRange } from '../../../../site/ui.ts';
import { dom } from './domain.ts';
import { random } from './random.ts';

declare const root: HTMLElement;
export const dispose = render(() => <p>{dayRange('2026-11-19', '2026-11-20')}</p>, root);
export const picked = random;
export const found = [screen, dom];
