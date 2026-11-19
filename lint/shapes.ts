// The shapes of code several house rules refuse, as Grit's snippets matched them: a call of a name, and a rule that
// refuses the calls it picks. Which files may write them is .oxlintrc.json's.
import type { Rule } from './plugin.ts';

type Visitor = ReturnType<NonNullable<Rule['create']>>;
export type Call = Parameters<NonNullable<Visitor['CallExpression']>>[0];

// a rule refusing each call `refused` picks, the whole call
export const callRule = (id: string, message: string, refused: (call: Call) => boolean): Rule => ({
  meta: { type: 'problem', messages: { [id]: message } },
  create(context) {
    return {
      CallExpression(node) {
        if (refused(node)) context.report({ node, messageId: id });
      },
    };
  },
});

// name(…): the name itself, not optional, with no type arguments and no parentheses around it (Grit's `name($...)`)
export const callsName = (call: Call, name: string): boolean =>
  call.callee.type === 'Identifier' &&
  call.callee.name === name &&
  !call.optional &&
  call.typeArguments == null &&
  call.start === call.callee.start;
