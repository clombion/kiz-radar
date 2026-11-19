// A state is compared and passed as KEY.<point>.<NAME> (site/states.ts), which the compiler holds to the table: a key
// of the states the site shows (lint/state-keys.ts, generated) written in quotes where one is compared (===, !==, ==,
// !=, a switch's case) or passed (a call's argument) is refused, whatever else the code calls by the same name.
// plural() takes words, not states. .oxlintrc.json turns the rule on for site/*.ts.
import type { Rule } from './plugin.ts';
import { callsName, type Node, quotedOneOf } from './shapes.ts';
import { STATE_KEYS } from './state-keys.ts';

// a string or a template without values, its source in its quotes, as Grit's state_key() read it
const KEY = quotedOneOf(STATE_KEYS);
const COMPARING = new Set(['===', '!==', '==', '!=']);

export const states: Rule = {
  meta: {
    type: 'problem',
    messages: { states: 'Write a state as KEY.<point>.<NAME> (site/states.ts), held to the table.' },
  },
  create(context) {
    const { sourceCode } = context;
    // in parentheses of its own, which Grit's state_key() did not match; a call's sole argument has the call's around it
    const parenthesized = (node: Node): boolean => {
      const before = sourceCode.getTokenBefore(node);
      const after = sourceCode.getTokenAfter(node);
      if (before?.value !== '(' || after?.value !== ')') return false;
      const { parent } = node;
      if (parent?.type !== 'CallExpression' || parent.arguments.length !== 1) return true;
      return sourceCode.getTokenBefore(before)?.value === '(' && sourceCode.getTokenAfter(after)?.value === ')';
    };
    const isKey = (node: Node): boolean =>
      (node.type === 'Literal' || node.type === 'TemplateLiteral') &&
      KEY.test(sourceCode.getText(node)) &&
      !parenthesized(node);
    const refuse = (node: Node): void => context.report({ node, messageId: 'states' });
    return {
      // a call as Grit's `$f($args)` matched it: neither optional nor with type arguments; each key it passes
      CallExpression(node) {
        if (node.optional || node.typeArguments != null || callsName(node, 'plural')) return;
        for (const arg of node.arguments) if (isKey(arg)) refuse(arg);
      },
      // the left side, else the right, as Grit's or {} took the first that matched
      BinaryExpression(node) {
        if (!COMPARING.has(node.operator)) return;
        if (isKey(node.left)) refuse(node.left);
        else if (isKey(node.right)) refuse(node.right);
      },
      SwitchCase(node) {
        if (node.test !== null && isKey(node.test)) refuse(node.test);
      },
    };
  },
};
