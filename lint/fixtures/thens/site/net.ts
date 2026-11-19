// Outside the rule: a .ts module, as the network module stays.
declare const said: Promise<string>;
export const read = said.then((x) => x);
