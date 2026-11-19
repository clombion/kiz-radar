// The intended way in JSX: a state named by KEY given to a component; an element's attribute, which is no call's
// argument, and a string that is no state's key, are no part of the rule.
import { KEY } from '../../../../site/states.ts';

declare function Badge(props: { state: string; label?: string }): unknown;
export const named = <Badge state={KEY.phase.ENDED} />;
export const word = <Badge state={KEY.phase.ENDED} label="tag" />;
export const attribute = <div role="group" data-state="cancelled" />;
export const text = <p>cancelled</p>;
