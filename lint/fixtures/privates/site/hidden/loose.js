#!/usr/bin/env node
// A script that starts with a hashbang and ends its declarations with a new line, not a semicolon (oxfmt lays out no
// script, so it keeps them so).
/** @private */
export const shebang = 1
const loose = 2
/** @private */
const quiet = 3
export { loose, quiet }
