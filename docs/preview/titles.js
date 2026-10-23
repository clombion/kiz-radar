// Festival titles as organisers write them ("WEnd Kizomba Lille | ALL IN ONE | 23 au 25 Octobre") tidied for
// cards: dates, years, "official" and separators removed, shouting capitals softened. The original stays on
// the detail view.
const MONTHS = 'jan(?:uary|vier)?|feb(?:ruary)?|f[ée]v(?:rier)?|febrero|mar(?:ch|s|zo)?|apr(?:il)?|avr(?:il)?|abril|may|mai|mayo|' +
  'jun(?:e|io)?|juin|jul(?:y|io)?|juil(?:let)?|aug(?:ust)?|ao[uû]t|agosto|sep(?:t(?:ember|embre)?)?|septiembre|oct(?:ober|obre|ubre)?|' +
  'nov(?:ember|embre|iembre)?|dec(?:ember)?|d[ée]c(?:embre)?|diciembre';
const DAY = '\\d{1,2}(?:st|nd|rd|th|er)?';
const JOIN = '\\s*(?:-|–|—|au|to|&|and|y|al|et)\\s*';
const DATE = new RegExp(`\\b${DAY}(?:${JOIN}${DAY})*\\.?\\s*(?:${MONTHS})\\b\\.?(?:${JOIN}${DAY}\\s*(?:${MONTHS})\\b\\.?)?(?:,?\\s*20\\d\\d)?`, 'gi');
const KEEP_UPPER = new Set(['DJ', 'SBK', 'UK', 'USA', 'MC', 'BCN', 'KUOF', 'XL', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

const SMALL = new Set(['a', 'by', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'the', 'is', 'de', 'da', 'do', 'du', 'la', 'le', 'les',
  'des', 'et', 'y', 'el', 'en', 'am', 'im', 'na', 'no', 'em', 'di', 'del']);
const VOWELS = /[aeiouyàâäéèêëîïôöûüáíóúãõ]/giu;

// Soften shouting capitals word by word. Short words without two vowels (DJ, SBK, MKC, ILKSF, KIZZ) look like
// acronyms or stylised names, so they stay as written.
export function softenCaps(text) {
  let first = true;
  return text.replace(/[\p{L}][\p{L}'’]*/gu, w => {
    const isFirst = first; first = false;
    const caps = w === w.toUpperCase() && w !== w.toLowerCase();
    if (!caps || KEEP_UPPER.has(w)) return w;
    const lower = w.toLowerCase();
    if (!isFirst && SMALL.has(lower)) return lower;
    if ((w.match(VOWELS) || []).length < 2) return w;
    return lower[0].toUpperCase() + lower.slice(1);
  });
}

export function tidyTitle(title) {
  let s = title.normalize('NFKC');                                   // 𝐁𝐄𝐂𝐀𝐔𝐒𝐄 → BECAUSE
  s = s.replace(DATE, ' ').replace(/\b20\d\d(?:\s*[-–\/]\s*20\d\d)?\b/g, ' ');
  s = s.replace(/\b\d{1,2}(?:\s*[,.\/-]\s*\d{1,2}){1,3}\b/g, ' ');      // 16,17,18-01
  s = s.replace(/[_*]+/g, ' ').replace(/\(\s*official\s*\)/gi, ' ').replace(/\bofficial(?:\s+event)?\b\s*/gi, '');
  s = s.replace(/\s*(?:\|+|\/{2,}|·|•)\s*/g, ' – ');                 // pipes and double slashes become one dash
  s = s.replace(/(^|\s–\s)\s*(?:all[\s-]*in[\s-]*one|official(?: event)?)\s*(?=\s–\s|$)/gi, '$1');
  s = s.replace(/\b(?:official event|– official)\b/gi, ' ');
  s = s.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ');
  s = s.replace(/(?:\s*[–—-]\s*){2,}/g, ' – ').replace(/^[\s–—:,.\-]+|[\s–—:,.\-#]+$/g, '');
  s = s.replace(/\s+([.,!?])/g, '$1').replace(/\s+/g, ' ').trim();
  s = softenCaps(s);
  return s.length >= 3 ? s : title;
}
