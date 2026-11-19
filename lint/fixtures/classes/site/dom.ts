// Exempt: dom.ts sets the classes, held to the stylesheet's.
export const toggle = (el: HTMLElement, name: string, on: boolean): boolean => el.classList.toggle(name, on);
