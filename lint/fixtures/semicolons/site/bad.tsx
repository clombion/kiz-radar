// What house/semicolons refuses: JSX text starting with a semicolon and the line's end, after an element, an
// expression, as an element's first child, in a fragment.
export const Element = (
  <div>
    {/* refused */}<p>x</p>;
    <p>y</p>
  </div>
);
export const Expression = (
  <div>
    {/* refused */}{1};
  </div>
);
export const First = (
  <div>{/* refused */};
    <p>x</p>
  </div>
);
export const Fragment = (
  <>
    {/* refused */}<p>f</p>;
  </>
);
export const Each = (
  <div>
    {/* refused */}<p>a</p>;
    {/* refused */}<p>b</p>;
  </div>
);
