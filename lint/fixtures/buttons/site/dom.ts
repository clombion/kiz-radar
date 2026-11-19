// Exempt: dom.ts's button() is where a button is made.
declare const h: (tag: string, ...rest: unknown[]) => HTMLElement;
export const button = (...kids: string[]): HTMLElement => h('button', { type: 'button' }, ...kids);
