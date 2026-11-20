// The JSX types of the site's Solid views (tsconfig.json's jsxImportSource, through its paths): @solidjs/web's, but
// for an element's class, which is one of the stylesheet's (ClassName, site/classes.ts, generated from public/css/), a
// list of them, or an object whose keys are. Types only: Solid's compiler writes the JSX, and imports nothing from
// here.
import type { JSX as Solid } from '@solidjs/web/jsx-runtime';
import type { ClassName } from './classes.ts';

// one of the stylesheet's classes, a list of them (false, null or undefined standing for none), or an object of them,
// each on while its value is true
type Toggled = Readonly<Partial<Record<ClassName, boolean | undefined>>>;
type ClassValue = ClassName | Toggled | readonly (ClassName | Toggled | false | null | undefined)[];
// an element's attributes with its class held to the stylesheet's
type Held<A> = A extends { class?: unknown } ? Omit<A, 'class'> & { class?: ClassValue | undefined } : A;

export namespace JSX {
  type Element = Solid.Element;
  type ElementClass = Solid.ElementClass;
  type ElementAttributesProperty = Solid.ElementAttributesProperty;
  type ElementChildrenAttribute = Solid.ElementChildrenAttribute;
  type IntrinsicAttributes = Solid.IntrinsicAttributes;
  type IntrinsicElements = { [K in keyof Solid.IntrinsicElements]: Held<Solid.IntrinsicElements[K]> };
}
