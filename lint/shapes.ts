// What several house rules read: the types of the syntax tree they visit; a call of a name, a method called by its
// name, a property read by its name, a name written as a key, the name an import takes, the variable a name is where it
// is read; and a rule that refuses the calls it picks. Which files may write them is .oxlintrc.json's.
import type { Rule } from './plugin.ts';

export type Visitor = ReturnType<NonNullable<Rule['create']>>;
export type Scope = ReturnType<Parameters<NonNullable<Rule['create']>>[0]['sourceCode']['getScope']>;
export type Variable = NonNullable<ReturnType<Scope['set']['get']>>;
export type Call = Parameters<NonNullable<Visitor['CallExpression']>>[0];
export type Member = Parameters<NonNullable<Visitor['MemberExpression']>>[0];
export type Node = Parameters<NonNullable<Visitor['Literal']>>[0]['parent'];

// a name as a pattern matches it: each of its characters as itself
const escaped = (name: string): string => name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

// a string or a template's source, in its quotes, naming one of `names`, between `before` and `after` (patterns)
export const quotedOneOf = (names: readonly string[], before = '', after = ''): RegExp =>
  new RegExp(`^['"\`]${before}(?:${names.map(escaped).join('|')})${after}['"\`]$`, 'u');

// a name written as `name`, or, where `computed`, as a string ['name']
export const named = (node: Node, name: string, computed = false): boolean =>
  computed ? node.type === 'Literal' && node.value === name : node.type === 'Identifier' && node.name === name;

// TypeScript's wrappers of an expression, which leave its value as it is: x as T, x satisfies T, <T>x, x!
export function unwrapped(node: Node): Node {
  let inner = node;
  while (
    inner.type === 'TSAsExpression' ||
    inner.type === 'TSSatisfiesExpression' ||
    inner.type === 'TSTypeAssertion' ||
    inner.type === 'TSNonNullExpression'
  )
    inner = inner.expression;
  return inner;
}

// the string an expression is, whatever TypeScript wraps it in: a string, or a template without values; undefined for
// any other
export function stringOf(node: Node): string | undefined {
  const inner = unwrapped(node);
  if (inner.type === 'Literal') return typeof inner.value === 'string' ? inner.value : undefined;
  if (inner.type !== 'TemplateLiteral' || inner.expressions.length > 0) return undefined;
  return inner.quasis[0]?.value.cooked ?? undefined;
}

// the name a key or a member's property spells out: a name, else, where `computed`, a string, as in ['name'] or
// [`name`]; undefined for any other
export const keyName = (key: Node, computed: boolean): string | undefined =>
  computed ? stringOf(key) : key.type === 'Identifier' ? key.name : undefined;

// the name an import's specifier takes from its module: a name, or a string ({ 'a b' as c })
export const importedName = (spec: {
  readonly imported:
    | { readonly type: 'Identifier'; readonly name: string }
    | { readonly type: 'Literal'; readonly value: string };
}): string => (spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value);

// the variable `name` is in `scope`: the nearest scope out from it that declares the name, undefined if none does
export function variableOf(scope: Scope, name: string): Variable | undefined {
  for (let at: Scope | null = scope; at !== null; at = at.upper) {
    const variable = at.set.get(name);
    if (variable !== undefined) return variable;
  }
  return undefined;
}

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

// name(…): the name itself called, not optionally, with no type arguments and no parentheses around it
export const callsName = (call: Call, name: string): boolean =>
  call.callee.type === 'Identifier' &&
  call.callee.name === name &&
  !call.optional &&
  call.typeArguments == null &&
  call.start === call.callee.start;

// x.name: the name written, the member not optional
const namesProperty = (member: Member, names: ReadonlySet<string>): boolean =>
  !member.computed && !member.optional && member.property.type === 'Identifier' && names.has(member.property.name);

// x.name(…), name one of `names`: the name written, neither the call nor the member optional
export const callsMethod = (call: Call, names: ReadonlySet<string>): boolean =>
  call.callee.type === 'MemberExpression' && namesProperty(call.callee, names) && !call.optional;

// where a member is written to rather than read: assigned, updated, a loop's variable, or a target of a destructuring
// assignment
const WRITTEN_LEFT = new Set(['AssignmentExpression', 'AssignmentPattern', 'ForInStatement', 'ForOfStatement']);
const WRITTEN = new Set(['UpdateExpression', 'ArrayPattern', 'RestElement']);
const written = (member: Member): boolean => {
  const { parent } = member;
  if (WRITTEN.has(parent.type)) return true;
  if (WRITTEN_LEFT.has(parent.type)) return 'left' in parent && parent.left === member;
  return parent.type === 'Property' && parent.parent.type === 'ObjectPattern' && parent.value === member;
};

// x.name read, not written to
export const readsProperty = (member: Member, names: ReadonlySet<string>): boolean =>
  namesProperty(member, names) && !written(member);

// JSX: an element's opening tag, and an attribute of it
export type Opening = Parameters<NonNullable<Visitor['JSXOpeningElement']>>[0];
export type Attribute = Parameters<NonNullable<Visitor['JSXAttribute']>>[0];

// an element's tag, as written: a name (div, Badge); undefined for a member (Ui.Badge) or a namespace (svg:path)
export const tagOf = (opening: Opening): string | undefined =>
  opening.name.type === 'JSXIdentifier' ? opening.name.name : undefined;

// a component, not an element of the page: its tag a capital's, or a member of an object (Ui.Badge)
export const isComponent = (opening: Opening): boolean =>
  opening.name.type === 'JSXMemberExpression' || /^[A-Z]/u.test(tagOf(opening) ?? '');

// what an attribute is given: a string, or the expression in its braces; undefined for none, or empty braces
export function valueOf(attribute: Attribute): Node | undefined {
  const { value } = attribute;
  if (value === null) return undefined;
  if (value.type !== 'JSXExpressionContainer') return value;
  return value.expression.type === 'JSXEmptyExpression' ? undefined : value.expression;
}

// an attribute's name, its namespace left out (prop:innerHTML is innerHTML)
export const attributeName = (attribute: Attribute): string =>
  attribute.name.type === 'JSXIdentifier' ? attribute.name.name : attribute.name.name.name;

// the attribute an element is given by `name`, written as such: neither a namespace's nor in a spread
export const attributeOf = (opening: Opening, name: string): Attribute | undefined =>
  opening.attributes.find(
    (a): a is Attribute => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  );
