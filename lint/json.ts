// Biome's useJsonImportAttributes: a JSON module is imported with { type: 'json' }, which the runtime needs to load it
// as JSON. An import or an export from a module whose name ends in .json is refused without that attribute,
// everywhere; a type's import or export is erased, and TypeScript allows no attribute there, so it is not read.
import type { Rule } from './plugin.ts';
import type { Node } from './shapes.ts';

// an import's or an export's attributes
type Attributes = readonly { readonly key: Node; readonly value: Node }[];

// the attribute's key, a name or a string
const keyOf = (key: Node): unknown => (key.type === 'Identifier' ? key.name : key.type === 'Literal' && key.value);

const refused = (source: Node, attributes: Attributes): boolean =>
  source.type === 'Literal' &&
  typeof source.value === 'string' &&
  source.value.endsWith('.json') &&
  !attributes.some((a) => keyOf(a.key) === 'type' && a.value.type === 'Literal' && a.value.value === 'json');

export const json: Rule = {
  meta: {
    type: 'problem',
    messages: {
      json: "Import a JSON module with { type: 'json' }, which the runtime needs to load it as JSON.",
    },
  },
  create(context) {
    const check = (node: Node, source: Node, attributes: Attributes, kind: string | undefined): void => {
      if (kind !== 'type' && refused(source, attributes)) context.report({ node, messageId: 'json' });
    };
    return {
      ImportDeclaration(node) {
        check(node, node.source, node.attributes, node.importKind);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) check(node, node.source, node.attributes, node.exportKind);
      },
      ExportAllDeclaration(node) {
        check(node, node.source, node.attributes, node.exportKind);
      },
    };
  },
};
