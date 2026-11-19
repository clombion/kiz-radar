// The browser projects' setup (vitest.config.ts): run in each test file's window before the file, it puts console.ts's
// guard on the window's console.
import { guard } from './console.ts';

guard();
