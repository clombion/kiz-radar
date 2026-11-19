// What it lets through: each spread once, a call's result twice (another object each time), a member read by a
// computed key, and a child spreading its parent's.
declare const props: { a: object; b: object; title: string };
declare const f: () => object;
declare const k: 'a' | 'b';
export const once = <div title="x" {...props} />;
export const two = <div {...props.a} {...props.b} />;
export const called = <div {...f()} {...f()} />;
export const computed = <div {...props[k]} {...props[k]} />;
export const nested = (
  <div {...props}>
    <p {...props} />
  </div>
);
