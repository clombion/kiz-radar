// A value derived from another is a memo, createMemo(() => …), not an effect that copies it into a signal of its own:
// an effect (createEffect or createRenderEffect, by its name, by the name it is imported as from Solid, or as a member,
// Solid.createEffect) whose apply half (its second argument) is a setter (setX, by its name), or a function whose body
// only calls setters, each given what the effect read (its first parameter, in an argument, awaited or not), is
// refused, at its first setter. The calls are read through return, void, an optional call and TypeScript's wrappers.
// A setter given anything else (setPage(0) when a filter changes) reacts rather than mirrors; an apply half that does
// any other work, a method's included (el.setAttribute(…): a signal's setter is a name), is an effect's own. Of the
// four migration rules (the brief's Phase 4): .oxlintrc.json turns it on for .tsx files alone.
import type { Rule } from './plugin.ts';
import { importedName, keyName, type Node, unwrapped } from './shapes.ts';

const EFFECTS: ReadonlySet<string | undefined> = new Set(['createEffect', 'createRenderEffect']);
const SETTER = /^set[A-Z]/u;
const SOLID = /^(?:solid-js|@solidjs\/)/u;

// an expression as it is called or returned: through TypeScript's wrappers, an optional chain and void
function bare(node: Node): Node {
  const inner = unwrapped(node);
  if (inner.type === 'ChainExpression') return bare(inner.expression);
  if (inner.type === 'UnaryExpression' && inner.operator === 'void') return bare(inner.argument);
  return inner;
}

const isSetter = (node: Node): boolean => {
  const inner = bare(node);
  return inner.type === 'Identifier' && SETTER.test(inner.name);
};

// the calls an apply half's body makes, every statement one (an expression or a return); undefined if it does more
function callsOf(body: Node): Node[] | undefined {
  if (body.type !== 'BlockStatement') return [bare(body)];
  const calls = body.body.map((s) =>
    s.type === 'ExpressionStatement'
      ? bare(s.expression)
      : s.type === 'ReturnStatement' && s.argument !== null
        ? bare(s.argument)
        : s,
  );
  return calls.every((c) => c.type === 'CallExpression') ? calls : undefined;
}

export const mirrors: Rule = {
  meta: {
    type: 'problem',
    messages: {
      mirrors: 'Derive a value with createMemo(() => …); an effect that only copies what it read mirrors it.',
    },
  },
  create(context) {
    // the names Solid's effects go by in this file
    const effects = new Set(EFFECTS);
    const isEffect = (callee: Node): boolean => {
      const inner = bare(callee);
      if (inner.type === 'Identifier') return effects.has(inner.name);
      return inner.type === 'MemberExpression' && EFFECTS.has(keyName(inner.property, inner.computed));
    };
    // where the apply half only gives setters what it was given, its first setter (or the setter it is); else undefined
    const mirrored = (half: Node): Node | undefined => {
      const apply = unwrapped(half);
      if (isSetter(apply)) return apply;
      if (apply.type !== 'ArrowFunctionExpression' && apply.type !== 'FunctionExpression') return undefined;
      const read = context.sourceCode
        .getDeclaredVariables(apply)
        .filter((v) => v.defs.some((d) => d.type === 'Parameter'));
      const given = read.flatMap((v) => v.references.map((r) => r.identifier));
      const calls = apply.body === null ? undefined : callsOf(apply.body);
      const copies = (c: Node): boolean =>
        c.type === 'CallExpression' &&
        isSetter(c.callee) &&
        c.arguments.some((a) => given.some((g) => g.start >= a.start && g.end <= a.end));
      return calls?.every(copies) === true ? calls[0] : undefined;
    };
    return {
      ImportDeclaration(node) {
        if (!SOLID.test(node.source.value)) return;
        for (const spec of node.specifiers)
          if (spec.type === 'ImportSpecifier' && EFFECTS.has(importedName(spec))) effects.add(spec.local.name);
      },
      CallExpression(node) {
        const apply = node.arguments.at(1);
        if (!isEffect(node.callee) || apply === undefined) return;
        const setter = mirrored(apply);
        if (setter !== undefined) context.report({ node: setter, messageId: 'mirrors' });
      },
    };
  },
};
