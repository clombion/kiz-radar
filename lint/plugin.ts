// The house rules, one oxlint JS plugin (.oxlintrc.json's jsPlugins): each rule's module beside it, each with its
// fixtures in lint/fixtures/<rule>/, which tests/site/rules.test.ts lints and compares with their marked lines.
import type { RuleTester } from 'oxlint/plugins-dev';
import { session } from './session.ts';

// oxlint's rule, as its RuleTester takes one: the package exports no other name for it
export type Rule = Parameters<RuleTester['run']>[1];

const plugin: { meta: { name: string }; rules: Readonly<Record<string, Rule>> } = {
  meta: { name: 'house' },
  rules: { session },
};
export default plugin;
