// The house rules, one oxlint JS plugin (.oxlintrc.json's jsPlugins): each rule's module beside it, each with its
// fixtures in lint/fixtures/<rule>/, which tests/site/rules.test.ts lints and compares with their marked lines.
import type { RuleTester } from 'oxlint/plugins-dev';
import { asserts } from './asserts.ts';
import { buttons } from './buttons.ts';
import { classes } from './classes.ts';
import { clicks } from './clicks.ts';
import { env } from './env.ts';
import { fetch } from './fetch.ts';
import { formats } from './formats.ts';
import { home } from './home.ts';
import { json } from './json.ts';
import { markup } from './markup.ts';
import { privates } from './privates.ts';
import { process } from './process.ts';
import { promises } from './promises.ts';
import { routes } from './routes.ts';
import { session } from './session.ts';
import { states } from './states.ts';
import { statics } from './statics.ts';
import { storage } from './storage.ts';
import { styles } from './styles.ts';
import { tests } from './tests.ts';

// oxlint's rule, as its RuleTester takes one: the package exports no other name for it
export type Rule = Parameters<RuleTester['run']>[1];

const plugin: { meta: { name: string }; rules: Readonly<Record<string, Rule>> } = {
  meta: { name: 'house' },
  rules: {
    asserts,
    buttons,
    classes,
    clicks,
    env,
    fetch,
    formats,
    home,
    json,
    markup,
    privates,
    process,
    promises,
    routes,
    session,
    states,
    statics,
    storage,
    styles,
    tests,
  },
};
export default plugin;
