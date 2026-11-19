// From a folder below: @package and the index's @private are let through, @private refused.
import { secret } from '../parts.ts'; // refused
import { shared } from '../parts.ts';
import { inside } from '../index.ts';
import { inside as viaFolder } from '..';

export { inside, secret, shared, viaFolder };
