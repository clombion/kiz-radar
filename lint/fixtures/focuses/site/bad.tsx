// What house/focuses refuses: autofocus in any spelling, bare or given a value, in a namespace, in an object spread.
export const solid = <input autofocus />; // refused
export const react = <input autoFocus />; // refused
export const valued = <input autofocus={true} />; // refused
export const shouted = <input AUTOFOCUS />; // refused
export const property = <input prop:autofocus />; // refused
export const attribute = <input attr:autofocus />; // refused
export const spread = <input {...{ autofocus: true }} />; // refused
export const dialog = <dialog autofocus />; // refused
