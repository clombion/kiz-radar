// What Biome lets through, and so the rule: a semicolon on a line of its own, after spaces, followed by more on its
// line, or by spaces before the line's end, within text, and inside a line.
export const Own = (
  <div>
    <p>x</p>
    ;
  </div>
);
export const Spaced = (
  <div>
    <p>y</p>  ;
  </div>
);
export const More = (
  <div>
    <p>z</p>; more
  </div>
);
export const Trailing = (
  <div>
    <p>w</p>;  
  </div>
);
export const Text = (
  <div>
    text;
  </div>
);
export const Inline = <div><i />;</div>;
