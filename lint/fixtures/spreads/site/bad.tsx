// What house/spreads refuses: an element spreading the same name, or member of names, twice, each repeat, however
// spelled: a key in quotes or a name, optionally, through TypeScript's wrappers, with spaces.
declare const props: { a: { b: object }; title: string };
declare const maybe: { a: object } | undefined;
declare function Card(props: object): unknown;
export const twice = <div {...props} title="x" {...props} />; // refused
export const thrice = <div {...props} {...props} {...props} />; // refused: spreads, spreads
export const member = <div {...props.a} {...props.a} />; // refused
export const deeper = <Card {...props.a.b} {...props.a.b} />; // refused
export const keyed = <div {...props['a']} {...props.a} />; // refused
export const optional = <div {...maybe?.a} {...maybe?.a} />; // refused
export const cast = <div {...(props as object)} {...props} />; // refused
export const asserted = <div {...maybe!.a} {...maybe?.a} />; // refused
export const spaced = <div {...props.a} {...props.a} />; // refused
