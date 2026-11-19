// The intended way, the module's namespace: process is a binding of the file.
import * as process from 'node:process';

export const { argv } = process;
