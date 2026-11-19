// What house/thens refuses in a Solid file: a promise's then, called however written, handed on or destructured.
declare const get: (path: string) => Promise<string>;
declare const said: Promise<string>;
get('/data/x.json').then((x) => x); // refused
said.then(String); // refused
said?.then((x) => x); // refused
said['then']((x) => x); // refused
export const Card = () => {
  said.then((x) => x); // refused
  return <p>x</p>;
};
said.then.call(said, String); // refused
export const bound = said.then.bind(said); // refused
export const { then } = said; // refused
export const { ['then']: later } = said; // refused
