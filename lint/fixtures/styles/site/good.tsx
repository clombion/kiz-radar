// The intended way: a class of the stylesheet; a value known only at run time set through a ref with
// style.setProperty, one property at a time.
declare const width: string;
export const classed = <p class="note">x</p>;
export const measured = <p ref={(el) => el.style.setProperty('--width', width)}>x</p>;
export const other = <p title={width}>x</p>;
