// What house/states refuses in the site's Solid modules: a state's key compared or passed as in a .ts module, and given
// to a component as a prop, its call's argument in JSX, in quotes or in braces, however wrapped.
declare const e: { phase: string };
declare function Badge(props: { state: string }): unknown;
declare const Ui: { Badge: typeof Badge };
export const compared = e.phase === 'ended'; // refused
export const quoted = <Badge state="cancelled" />; // refused
export const braced = <Badge state={'sold_out'} />; // refused
export const templated = <Badge state={`ended`} />; // refused
export const wrapped = <Badge state={'gone' as string} />; // refused
export const member = <Ui.Badge state="cancelled" />; // refused
