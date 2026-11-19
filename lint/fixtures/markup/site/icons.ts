// Exempt: icons.ts puts the SVG written there in an element (Drawing.into).
export const into = (el: Element, svg: string): Element => {
  el.innerHTML = svg;
  return el;
};
