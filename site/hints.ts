// Hints shown until someone has done what they suggest. Remembered in this browser only.
function remembered(key: string): { seen: () => boolean; mark: () => void } {
  return {
    seen: () => {
      try {
        return localStorage.getItem(key) === '1';
      } catch {
        return false;
      }
    },
    mark: () => {
      try {
        localStorage.setItem(key, '1');
      } catch {
        /* storage is off in this browser: the hint shows again */
      }
    },
  };
}
export const blanksHint = remembered('kr-hints-seen'); // "click to change the dance" by the sentence
export const exploreHint = remembered('kr-explore-seen'); // "psst… more here" under the Explore tab
export const artistHint = remembered('kr-artist-seen'); // "click a name to see where else they teach"
