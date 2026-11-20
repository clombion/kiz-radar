// Exempt: placed.browser.test.tsx imports the shell's seam, to draw parts of its own (.oxlintrc.json's override gives
// the rule its module, as the file names it), and nothing else of the site's views.
import { inPlaceOf } from '../../site/placed.tsx';
import { Row } from '../../site/tabs.tsx'; // refused

export const used = [inPlaceOf, Row];
