// Exempt: icons.ts puts a drawing's SVG, from drawings.ts, in an element (Drawing.into).
export const into = (el: Element, svg: string): Element => {
  el.innerHTML = svg;
  return el;
};
