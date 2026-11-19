// The intended way: what no tag hides, an index's @package from its parent folder, and what an index forwards from it;
// a namespace import, an export from and an import() are not read, nor a package's names.
import { open, plain, prose, commented } from './hidden/parts.ts';
import * as parts from './hidden/parts.ts';
import { beside } from './hidden/index.ts';
import { forwarded } from './hidden/index.ts';
import { beside as viaFolder } from './hidden';
import { secret } from 'package/parts.ts';

export { shared } from './hidden/parts.ts';
export const later = import('./hidden/parts.ts');
export { beside, commented, forwarded, open, parts, plain, prose, secret, viaFolder };
