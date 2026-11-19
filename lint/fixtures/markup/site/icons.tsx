// Exempt: icons.ts, as it becomes .tsx, puts a drawing's SVG, from drawings.ts, in an element.
declare const svg: string;
export const Drawn = () => <span innerHTML={svg} />;
