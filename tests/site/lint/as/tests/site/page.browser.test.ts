// What lint/tests.grit lets page.browser.test.ts import (tests/site/lint.test.ts): the four helpers it still tests,
// named as tests/site/page.browser.test.ts names them (Biome does not resolve the string).
import { dismissable } from '../../site/dismiss.ts';
import { h } from '../../site/dom.ts';
import { modal } from '../../site/modal.ts';
import { pill } from '../../site/tabs.ts';

export const used = [dismissable, h, modal, pill];
