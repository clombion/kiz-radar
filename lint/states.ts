// A state is compared and passed as KEY.<point>.<NAME> (site/states.ts), which the compiler holds to the table: a key
// of the states the site shows (lint/state-keys.ts, generated) written in quotes, or a template without values, where
// one is compared (===, !==, ==, !=, a switch's case) or passed (a call's or a new's argument) is refused, whatever else
// the code calls by the same name, however the call is written (optional, with type arguments) and whatever wraps the
// key (parentheses, as, satisfies, a type assertion). plural() takes words, not states. In JSX a component's prop is
// its call's argument: a key given to one (<Badge state="cancelled" />, or in braces) is refused; an element's
// attribute is not. .oxlintrc.json turns the rule on for site/*.ts and site/*.tsx.
import type { Rule } from './plugin.ts';
import { isComponent, type Node, stringOf, valueOf } from './shapes.ts';
import { STATE_KEYS } from './state-keys.ts';

const KEYS: ReadonlySet<string | undefined> = new Set(STATE_KEYS);
const COMPARING = new Set(['===', '!==', '==', '!=']);

export const states: Rule = {
  meta: {
    type: 'problem',
    messages: { states: 'Write a state as KEY.<point>.<NAME> (site/states.ts), held to the table.' },
  },
  create(context) {
    const isKey = (node: Node): boolean => KEYS.has(stringOf(node));
    const refuse = (node: Node): void => context.report({ node, messageId: 'states' });
    const passed = (args: readonly Node[]): void => {
      for (const arg of args) if (isKey(arg)) refuse(arg);
    };
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'plural') passed(node.arguments);
      },
      NewExpression(node) {
        passed(node.arguments);
      },
      // the left side, else the right: one finding a comparison
      BinaryExpression(node) {
        if (!COMPARING.has(node.operator)) return;
        if (isKey(node.left)) refuse(node.left);
        else if (isKey(node.right)) refuse(node.right);
      },
      SwitchCase(node) {
        if (node.test !== null && isKey(node.test)) refuse(node.test);
      },
      JSXAttribute(node) {
        const value = valueOf(node);
        if (node.parent.type === 'JSXOpeningElement' && isComponent(node.parent) && value !== undefined && isKey(value))
          refuse(value);
      },
    };
  },
};
