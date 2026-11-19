// The house rules, one oxlint JS plugin (.oxlintrc.json's jsPlugins): each rule's module beside it, each with its
// fixtures in lint/fixtures/<rule>/, which tests/site/rules.test.ts lints and compares with their marked lines.
import type { RuleTester } from 'oxlint/plugins-dev';
import { asserts } from './asserts.ts';
import { buttons } from './buttons.ts';
import { classes } from './classes.ts';
import { clicks } from './clicks.ts';
import { env } from './env.ts';
import { fetch } from './fetch.ts';
import { flags } from './flags.ts';
import { formats } from './formats.ts';
import { home } from './home.ts';
import { json } from './json.ts';
import { legacy } from './legacy.ts';
import { markup } from './markup.ts';
import { mirrors } from './mirrors.ts';
import { privates } from './privates.ts';
import { process } from './process.ts';
import { promises } from './promises.ts';
import { routes } from './routes.ts';
import { semicolons } from './semicolons.ts';
import { session } from './session.ts';
import { spreads } from './spreads.ts';
import { states } from './states.ts';
import { statics } from './statics.ts';
import { storage } from './storage.ts';
import { styles } from './styles.ts';
import { svgs } from './svgs.ts';
import { tests } from './tests.ts';
import { thens } from './thens.ts';

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
    flags,
    formats,
    home,
    json,
    legacy,
    markup,
    mirrors,
    privates,
    process,
    promises,
    routes,
    semicolons,
    session,
    spreads,
    states,
    statics,
    storage,
    styles,
    svgs,
    tests,
    thens,
  },
};
export default plugin;
