// What house/svgs refuses outside icons: an SVG drawn in JSX, empty or not, titled or not, or made by its tag's name.
import { Dynamic, dynamic } from '@solidjs/web';

declare const path: unknown;
export const empty = <svg />; // refused
export const sized = <svg viewBox="0 0 10 10" aria-label="Mark" role="img" />; // refused
export const drawn = <svg viewBox="0 0 10 10">{path}</svg>; // refused
export const named = <Dynamic component="svg" viewBox="0 0 10 10" />; // refused
export const braced = <Dynamic component={'svg'} />; // refused
export const Made = dynamic(() => 'svg'); // refused
