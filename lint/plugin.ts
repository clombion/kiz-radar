// The house rules, one oxlint JS plugin (.oxlintrc.json's jsPlugins): each rule's module beside it, each with its
// fixtures in lint/fixtures/<rule>/, which tests/site/rules.test.ts lints and compares with their marked lines.
import type { RuleTester } from 'oxlint/plugins-dev';
import { buttons } from './buttons.ts';
import { clicks } from './clicks.ts';
import { fetch } from './fetch.ts';
import { promises } from './promises.ts';
import { session } from './session.ts';
import { storage } from './storage.ts';

// oxlint's rule, as its RuleTester takes one: the package exports no other name for it
export type Rule = Parameters<RuleTester['run']>[1];

const plugin: { meta: { name: string }; rules: Readonly<Record<string, Rule>> } = {
  meta: { name: 'house' },
  rules: { buttons, clicks, fetch, promises, session, storage },
};
export default plugin;
