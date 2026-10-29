// Text as it is matched: "Łódź" and "lodz" are one, and so are "Rencontres" and "rencontrés".
export const fold = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/ł/gu, 'l')
    .replace(/[øœ]/gu, 'o')
    .replace(/æ/gu, 'ae')
    .replace(/ß/gu, 'ss')
    .replace(/đ/gu, 'd')
    .replace(/ı/gu, 'i');
const BETWEEN_WORDS = /[^a-z0-9]+/u;
// the words of a text, folded
export const words = (s: string): string[] => fold(s).split(BETWEEN_WORDS).filter(Boolean);
