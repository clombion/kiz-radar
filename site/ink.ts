// A highlighter's swipe, as a hand draws it: a little thicker or thinner, low or high, tilted, its corners uneven and
// its ink not quite even, the same for one seed however often it is drawn. The months mark a festival's days with it,
// a trip's Gantt each party's time there. An end where the thing marked goes on (in another week) is cut square.

// how thick a swipe is and how far below its line it sits, each a range in rem, and how far it may tilt, in degrees:
// a tilt lifts one end above the other the more the longer the swipe, so a long one (a trip's bar on a computer) has
// none, and its unevenness is in its thickness and corners
export interface Reach {
  height: readonly [number, number];
  drop: readonly [number, number];
  tilt: number;
}

// a swipe's style: its height, offset, tilt, corners and ink, from its seed
export function swipe(seed: string, reach: Reach, cut: { before: boolean; after: boolean }): Record<string, string> {
  let h32 = 2_166_136_261;
  for (const ch of seed) h32 = Math.imul(h32 ^ ch.charCodeAt(0), 16_777_619);
  const next = () => {
    h32 = Math.imul(h32 ^ (h32 >>> 15), 2_246_822_507);
    h32 = Math.imul(h32 ^ (h32 >>> 13), 3_266_489_909);
    h32 ^= h32 >>> 16;
    return (h32 >>> 0) / 4_294_967_296;
  };
  const between = (lo: number, hi: number) => (lo + (hi - lo) * next()).toFixed(2);
  const corner = (square: boolean) => (square ? '0' : `${between(0.3, 0.6)}rem`);
  const [tl, tr, br, bl] = [corner(cut.before), corner(cut.after), corner(cut.after), corner(cut.before)];
  return {
    height: `${between(...reach.height)}rem`,
    translate: `0 ${between(...reach.drop)}rem`,
    rotate: `${between(-reach.tilt, reach.tilt * 0.65)}deg`,
    'border-radius': `${tl} ${tr} ${br} ${bl} / ${between(0.2, 0.4)}rem ${between(0.2, 0.4)}rem ${between(0.2, 0.4)}rem ${between(0.2, 0.4)}rem`,
    opacity: between(0.78, 1),
  };
}
