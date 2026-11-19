// What house/privates refuses, everywhere: from outside its module, a name marked @private; from outside its folder, a
// name marked @package; however it is imported or named.
import { secret } from './hidden/parts.ts'; // refused
import { shared } from './hidden/parts.ts'; // refused
import { helper } from './hidden/parts.ts'; // refused
import { Hidden } from './hidden/parts.ts'; // refused
import type { Secret } from './hidden/parts.ts'; // refused
import { first } from './hidden/parts.ts'; // refused
import { second } from './hidden/parts.ts'; // refused
import { left } from './hidden/parts.ts'; // refused
import { renamed } from './hidden/parts.ts'; // refused
import { older } from './hidden/parts.ts'; // refused
import { noted } from './hidden/parts.ts'; // refused
import { listed } from './hidden/parts.ts'; // refused
import { alias } from './hidden/parts.ts'; // refused
import fallback from './hidden/parts.ts'; // refused
import { default as named } from './hidden/parts.ts'; // refused
import { secret as again } from './hidden/parts'; // refused
import { secret as script } from './hidden/parts.js'; // refused
import { inside } from './hidden/index.ts'; // refused
import { inside as viaFolder } from './hidden'; // refused
import { secret as forwarded } from './hidden/index.ts'; // refused

export { again, alias, fallback, first, forwarded, helper, Hidden, inside, left, listed, named, noted, older };
export { renamed, script, second, secret, shared, viaFolder };
export type { Secret };
