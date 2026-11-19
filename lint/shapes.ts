// The shapes of code several house rules refuse, as Grit's snippets matched them: a call of a name, a method called by
// its name, a property read by its name, and a rule that refuses the calls it picks. Which files may write them is .oxlintrc.json's.
import type { Rule } from './plugin.ts';

type Visitor = ReturnType<NonNullable<Rule['create']>>;
export type Call = Parameters<NonNullable<Visitor['CallExpression']>>[0];
export type Member = Parameters<NonNullable<Visitor['MemberExpression']>>[0];

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

// x.name(…): the name written, neither the call nor the member optional (Grit's `$x.name($...)`)
export const callsMethod = (call: Call, name: string): boolean =>
  call.callee.type === 'MemberExpression' &&
  !call.callee.computed &&
  !call.callee.optional &&
  !call.optional &&
  call.callee.property.type === 'Identifier' &&
  call.callee.property.name === name;

// where a member is written to rather than read: assigned, updated, a loop's variable, or a target of a destructuring
// assignment (Grit's `$x.name` is an expression, and these are assignment targets)
const WRITTEN_LEFT = new Set(['AssignmentExpression', 'AssignmentPattern', 'ForInStatement', 'ForOfStatement']);
const WRITTEN = new Set(['UpdateExpression', 'ArrayPattern', 'RestElement']);
export const written = (member: Member): boolean => {
  const { parent } = member;
  if (WRITTEN.has(parent.type)) return true;
  if (WRITTEN_LEFT.has(parent.type)) return 'left' in parent && parent.left === member;
  return parent.type === 'Property' && parent.parent.type === 'ObjectPattern' && parent.value === member;
};

// x.name: the name written, the member not optional (Grit's `$x.name`)
export const namesProperty = (member: Member, names: ReadonlySet<string>): boolean =>
  !member.computed && !member.optional && member.property.type === 'Identifier' && names.has(member.property.name);

// x.name read, not written to
export const readsProperty = (member: Member, names: ReadonlySet<string>): boolean =>
  namesProperty(member, names) && !written(member);
