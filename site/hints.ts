// Hints shown until someone has done what they suggest, remembered in this browser's storage (kept.ts), or for the
// page when the browser refuses it.
import { device, read, write } from './kept.ts';

function remembered(key: string): { seen: () => boolean; mark: () => void } {
  return {
    seen: () => read(device, key) === '1',
    mark: () => {
      write(device, key, '1');
    },
  };
}
export const blanksHint = remembered('kr-hints-seen'); // "click to change the dance" by the sentence
export const exploreHint = remembered('kr-explore-seen'); // "psst… more here" under the Explore tab
export const artistHint = remembered('kr-artist-seen'); // "click a name to see where else they teach"
