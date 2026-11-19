// The text a house rule reads in the code, as Grit's JsStringLiteralExpression and JsTemplateChunkElement are: a string
// where an expression stands (not a key, a type, a module's name or a directive) in its quotes, and the chunks of a
// template literal between its values, as written. A rule takes the visitors `texts` makes and reports where it picks,
// or is a `textRule`, refusing the texts a pattern matches.
import type { Rule } from './plugin.ts';

type Visitor = ReturnType<NonNullable<Rule['create']>>;
type Literal = Parameters<NonNullable<Visitor['Literal']>>[0];
type Chunk = Parameters<NonNullable<Visitor['TemplateElement']>>[0];
export type Text = Literal | Chunk;

// a string under one of these is not an expression: a module's name, a type, an import's attribute
const NAMING = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
  'ImportSpecifier',
  'ExportSpecifier',
  'ImportAttribute',
  'TSLiteralType',
  'TSExternalModuleReference',
]);
// a string as these's key (or name) is a member's name, unless computed
const KEYED = new Set([
  'Property',
  'PropertyDefinition',
  'MethodDefinition',
  'AccessorProperty',
  'TSPropertySignature',
  'TSMethodSignature',
  'TSAbstractPropertyDefinition',
  'TSAbstractMethodDefinition',
  'TSAbstractAccessorProperty',
]);
const NAMED = new Set(['TSEnumMember', 'TSModuleDeclaration']);

const expression = (node: Literal): boolean => {
  const { parent } = node;
  if (NAMING.has(parent.type)) return false;
  if (parent.type === 'ExpressionStatement') return parent.directive == null;
  if (KEYED.has(parent.type) && 'key' in parent && parent.key === node) return 'computed' in parent && parent.computed;
  return !(NAMED.has(parent.type) && 'id' in parent && parent.id === node);
};

// the visitors calling `each` with every text and its source: a string with its quotes, a chunk without its delimiters
export const texts = (each: (node: Text, text: string) => void): Visitor => ({
  Literal(node) {
    if (typeof node.value === 'string' && node.raw != null && expression(node)) each(node, node.raw);
  },
  TemplateElement(node) {
    if (node.parent.type === 'TemplateLiteral') each(node, node.value.raw);
  },
});

// a rule refusing each text that `refused` matches, where it stands
export const textRule = (id: string, message: string, refused: RegExp): Rule => ({
  meta: { type: 'problem', messages: { [id]: message } },
  create(context) {
    return texts((node, text) => {
      if (refused.test(text)) context.report({ node, messageId: id });
    });
  },
});
