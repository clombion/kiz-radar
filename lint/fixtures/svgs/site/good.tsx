// The intended way: a drawing from icons.ts, here an element holding one; other elements as they are.
import { Dynamic, dynamic } from '@solidjs/web';

declare function Drawn(props: { name: string }): unknown;
export const mark = <Drawn name="mark" />;
export const picture = <img src="mark.svg" alt="" />;
export const other = <Dynamic component="span" />;
export const Made = dynamic(() => 'span');
