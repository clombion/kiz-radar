// Biome's noProcessEnv, for the process a file imports: node/no-process-env reads the global process alone, so once
// house/process has the tests import it from node:process, their process.env went unseen. A read of env from an
// import of node:process (or process) is refused: a default or namespace binding's .env, written or destructured, and
// env imported by name. The global's is node/no-process-env's; a type's typeof process.env reads nothing. On wherever
// node/no-process-env is (.oxlintrc.json).
import type { Rule } from './plugin.ts';
import type { Node } from './shapes.ts';

type Scope = ReturnType<Parameters<NonNullable<Rule['create']>>[0]['sourceCode']['getScope']>;
type Definition = NonNullable<ReturnType<Scope['set']['get']>>['defs'][number];

const MODULES: ReadonlySet<unknown> = new Set(['node:process', 'process']);
// the name a specifier imports
const importedName = (spec: { imported: { type: string; name?: string; value?: unknown } }): unknown =>
  spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
// a key or member written env, or ['env']
const named = (key: Node, computed: boolean): boolean =>
  computed ? key.type === 'Literal' && key.value === 'env' : key.type === 'Identifier' && key.name === 'env';

// an import of the module as a whole from node:process: its default or its namespace
const wholeProcess = (def: Definition): boolean => {
  if (def.type !== 'ImportBinding' || def.parent?.type !== 'ImportDeclaration' || !MODULES.has(def.parent.source.value))
    return false;
  const spec = def.node;
  return spec.type !== 'ImportSpecifier' || importedName(spec) === 'default';
};

export const env: Rule = {
  meta: {
    type: 'suggestion',
    messages: {
      env: 'Unexpected use of process.env, the imported process as the global (node/no-process-env).',
    },
  },
  create(context) {
    const { sourceCode } = context;
    // a name bound, where it is read, by an import of node:process as a whole
    const imported = (node: Node, name: string): boolean => {
      for (let scope: Scope | null = sourceCode.getScope(node); scope !== null; scope = scope.upper) {
        const variable = scope.set.get(name);
        if (variable !== undefined) return variable.defs.some(wholeProcess);
      }
      return false;
    };
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type' || !MODULES.has(node.source.value)) return;
        for (const spec of node.specifiers)
          if (spec.type === 'ImportSpecifier' && spec.importKind !== 'type' && importedName(spec) === 'env')
            context.report({ node: spec, messageId: 'env' });
      },
      MemberExpression(node) {
        const { object } = node;
        if (named(node.property, node.computed) && object.type === 'Identifier' && imported(node, object.name))
          context.report({ node, messageId: 'env' });
      },
      VariableDeclarator(node) {
        const { id, init } = node;
        if (id.type !== 'ObjectPattern' || init?.type !== 'Identifier' || !imported(node, init.name)) return;
        for (const prop of id.properties)
          if (prop.type === 'Property' && named(prop.key, prop.computed))
            context.report({ node: prop, messageId: 'env' });
      },
    };
  },
};
