// Structural checks on the static site: things JavaScript and CSS can't enforce themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DOCS = new URL('../docs/', import.meta.url);
const read = p => readFileSync(new URL(p, DOCS), 'utf8');
const js = Object.fromEntries(readdirSync(new URL('js/', DOCS)).filter(f => f.endsWith('.js')).map(f => [f, read('js/' + f)]));
const css = Object.fromEntries(readdirSync(new URL('css/', DOCS)).filter(f => f.endsWith('.css')).map(f => [f, read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, '')]));
const html = read('index.html');
const word = w => new RegExp(`(?<![\\w-])${w.replace(/[$]/g, '\\$&')}(?![\\w-])`);

test('every export is imported by another module', () => {
  const unused = [];
  for (const [file, src] of Object.entries(js))
    for (const [, name] of src.matchAll(/^export (?:const|function|let|class) ([A-Za-z_$][\w$]*)/gm))
      if (!Object.entries(js).some(([f, s]) => f !== file && new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./${file}'`).test(s)))
        unused.push(`${file}: ${name}`);
  assert.deepEqual(unused, []);
});

test('every CSS class is used by the page or its scripts', () => {
  const source = Object.values(js).join('\n') + html;
  const unused = [];
  for (const [file, text] of Object.entries(css))
    for (const cls of new Set([...text.replace(/url\([^)]*\)/g, '').matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(m => m[1])))
      if (!/^leaflet-/.test(cls) && !/^\d/.test(cls) && !word(cls).test(source)) unused.push(`${file}: .${cls}`);
  assert.deepEqual(unused, []);
});

// Rules keyed by their media context and selector; a second rule for the same key means one silently overrides the other.
function rules(text) {
  const out = [];
  let media = '', depth = 0, i = 0;
  for (const m of text.matchAll(/([^{}]*)\{|\}/g)) {
    if (m[0] === '}') { depth--; if (depth === 0) media = ''; continue; }
    const head = m[1].trim();
    if (head.startsWith('@')) { media = head; depth++; continue; }
    const body = text.slice(m.index + m[0].length, text.indexOf('}', m.index));
    out.push({ media, selectors: head.split(',').map(s => s.trim().replace(/\s+/g, ' ')), body, at: i++ });
    depth++;
  }
  return out;
}

test('no selector has two rules in the same media context', () => {
  const seen = new Map(), dup = [];
  for (const [file, text] of Object.entries(css))
    for (const r of rules(text)) for (const s of r.selectors) {
      const key = `${r.media} ${s}`;
      if (seen.has(key)) dup.push(`${key.trim()} (${seen.get(key)} and ${file})`); else seen.set(key, file);
    }
  assert.deepEqual(dup, []);
});

test('each design token is defined once per theme', () => {
  const seen = new Map(), dup = [];
  for (const [file, text] of Object.entries(css))
    for (const r of rules(text)) for (const [, name] of r.body.matchAll(/(--[\w-]+)\s*:/g)) {
      const key = `${r.media} ${r.selectors.join(',')} ${name}`;
      if (seen.has(key)) dup.push(`${name} (${seen.get(key)} and ${file})`); else seen.set(key, file);
    }
  assert.deepEqual(dup, []);
});

test('links are built by routes.js', () => {
  const literal = /['"`]#(?:finder|map|artists?|countries|sql)\b/;
  assert.deepEqual(Object.entries(js).filter(([f, s]) => f !== 'routes.js' && literal.test(s)).map(([f]) => f), []);
});

test('only hints.js touches localStorage', () => {
  assert.deepEqual(Object.entries(js).filter(([f, s]) => f !== 'hints.js' && /localStorage/.test(s)).map(([f]) => f), []);
});

test('the home city comes from the data, not the code', () => {
  assert.deepEqual(Object.entries(js).filter(([, s]) => /Bergen|'BGO'/.test(s)).map(([f]) => f), []);
});

test('dates and flight links are formatted in ui.js', () => {
  assert.deepEqual(Object.entries(js).filter(([f, s]) => f !== 'ui.js' && /Intl\.DateTimeFormat|toLocaleDateString|google\.com\/travel/.test(s)).map(([f]) => f), []);
});

// ----- the closed world of states (pipeline/STATES.md): the site holds no words or keys of its own -----
const { STATES, KEY } = await import(new URL('js/states.js', DOCS));
const { say, text, where } = await import(new URL('js/wording.js', DOCS));
const { tierNow, priceLine, nextChange } = await import(new URL('js/pricing.js', DOCS));
// the code without its comments, where words may be quoted
const code = Object.fromEntries(Object.entries(js).filter(([f]) => f !== 'states.js')
  .map(([f, src]) => [f, src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')]));
// words and keys that mean something else where they are written; each must still be found, so none outlives its use
const HOMONYMS = new Set([
  'main.js: People', 'routes.js: People', 'search.js: People',            // the people who share plans
  "artists.js: 'next'", "artists.js: 'group'", "countries.js: 'group'",   // an order; ARIA's role="group"
  "search.js: 'group'", "search.js: 'person'", "plans.js: 'person'",      // a search group, a result kind, a word
  "main.js: 'page'", "map.js: 'none'", "sentence.js: 'none'",            // aria-current="page"; no filter, no transition
  "icons.js: 'none'", "search.js: 'none'",                                // an SVG's fill="none"
  'sentence.js: full pass',                                               // the price limit's own sum: pass and flight
  "tables.js: 'now'"]);                                                   // SQL's date('now')

// every words of the table, and each form of them, as the fragments a page could compose: whole words in quotes, and
// the runs between {names} long enough to be words of their own
const forms = Object.values(STATES).flatMap(p => Object.values(p).flatMap(s => [s.wording, ...Object.values(s.forms)]))
  .filter(Boolean);
const quotedWords = forms.filter(w => !w.includes('{') && w.length > 3);
const fragments = forms.filter(w => w.includes('{')).flatMap(w => w.split(/\{\w+\}/)).map(f => f.trim())
  .filter(f => f.includes(' ') && f.length >= 8);

test('no state’s words are written outside the state table', () => {
  const found = Object.entries(code).flatMap(([f, src]) => [
    ...quotedWords.filter(w => [`'${w}'`, `"${w}"`, `\`${w}\``].some(q => src.includes(q))),
    ...fragments.filter(w => src.includes(w))].map(w => `${f}: ${w}`));
  assert.deepEqual(found.filter(w => !HOMONYMS.has(w)), []);
});

test('no state’s key is written outside the state table', () => {
  const keys = new Set(Object.values(STATES).flatMap(p => Object.keys(p)));
  const found = Object.entries(code).flatMap(([f, src]) => [...keys].filter(k => new RegExp(`['"\`]${k}['"\`]`).test(src))
    .map(k => `${f}: '${k}'`));
  assert.deepEqual(found.filter(k => !HOMONYMS.has(k)), []);
});

test('every homonym still occurs where it is said to', () => {
  const gone = [...HOMONYMS].filter(h => {
    const [f, w] = h.split(': '), key = w.match(/^'(.*)'$/)?.[1];
    return !(key ? new RegExp(`['"\`]${key}['"\`]`).test(code[f] || '') : (code[f] || '').includes(w));
  });
  assert.deepEqual(gone, []);
});

test('a state, a form or a point the table doesn’t have, or words without their values, fail', () => {
  assert.throws(() => say('price', 'soon'), /no state/);
  assert.throws(() => say('people', KEY.people.GROUP), /\{n\}/);
  assert.throws(() => say('role', KEY.role.DJ, {}, 'pair'), /no form pair/);
  assert.throws(() => where('no_point', 'card'), /no point/);
});

test('every feature a card or a view shows has an icon icons.js draws', async () => {
  const { TRAITS, MORE_TRAITS } = await import(new URL('js/icons.js', DOCS));
  assert.deepEqual([...TRAITS, ...MORE_TRAITS].map(([k]) => k), [...where('feature', 'card'), ...where('feature', 'view')]);
  assert.ok([...TRAITS, ...MORE_TRAITS].every(([, , svg]) => svg.startsWith('<svg')));
});

const E = { start_date: '2027-02-05', end_date: '2027-02-07', upcoming: 1, price_state: KEY.price.PRICED, card_pass: 1 };
const tier = (amount, k = {}) => ({ amount, currency: 'EUR', fee: null, valid_from: null, valid_until: null, door: 0, sold_out: 0, ...k });
const pass = (tiers, k = {}) => ({ pass_no: 1, kind: KEY.pass_kind.FULL, tiers, ...k });
const DAY = '2026-11-15';
const TIER_CASES = [
  [pass([tier(80, { valid_until: '2026-12-31' }), tier(100)]), KEY.tier_today.NOW],
  [pass([tier(80), tier(90)]), KEY.tier_today.FROM],
  [pass([tier(80, { valid_from: '2026-12-01' })]), KEY.tier_today.NEXT],
  [pass([tier(80, { sold_out: 1 })]), KEY.tier_today.SOLD_OUT],
  [pass([tier(80, { valid_until: '2026-10-31' })]), KEY.tier_today.ENDED],
];

test('every state of the tier today is reached', () => {
  for (const [p, state] of TIER_CASES) assert.equal(tierNow(p, E, DAY).state, state);
  assert.deepEqual(new Set(TIER_CASES.map(([, s]) => s)), new Set(Object.values(KEY.tier_today)));
  assert.equal(tierNow(TIER_CASES[0][0], E, DAY).next.amount, 100);
});

test('a tier without dates runs from the day after the one before it to the day before the one after', () => {
  const p = pass([tier(70, { valid_until: '2026-11-10' }), tier(80), tier(95, { valid_from: '2026-12-01' })]);
  assert.equal(tierNow(p, E, '2026-11-10').tier.amount, 70);
  assert.equal(tierNow(p, E, '2026-11-11').tier.amount, 80);
  assert.equal(tierNow(p, E, '2026-11-30').tier.amount, 80);
  assert.equal(tierNow(p, E, '2026-12-01').tier.amount, 95);
});

test('a door price applies only during the festival, and is the next change before it', () => {
  const p = pass([tier(80, { valid_until: '2027-01-31' }), tier(120, { door: 1 })]);
  const before = tierNow(p, E, DAY);
  assert.equal(before.tier.amount, 80);
  assert.equal(nextChange(windows(before.next)), KEY.next_change.DOOR);
  assert.equal(tierNow(p, E, '2027-02-06').tier.amount, 120);
});

test('of the tiers to come, the first is next; of the tiers today, the cheapest; the next change costs more', () => {
  const later = pass([tier(90, { valid_from: '2026-12-15' }), tier(70, { valid_from: '2026-12-01' })]);
  assert.equal(tierNow(later, E, DAY).tier.amount, 70);
  const undated = pass([tier(95), tier(85)]);
  assert.deepEqual([tierNow(undated, E, DAY).state, tierNow(undated, E, DAY).tier.amount], [KEY.tier_today.FROM, 85]);
  const cheaper = pass([tier(80, { valid_until: '2026-11-30' }), tier(60, { valid_from: '2026-12-01' }), tier(90, { valid_from: '2027-01-01' })]);
  assert.equal(tierNow(cheaper, E, DAY).next.amount, 90);       // a cheaper later tier is no rise
});

// a tier as tierNow gives its next one: with its first day
const windows = t => ({ ...t, lo: t.lo ?? t.valid_from });

test('every state of a next change is reached', () => {
  const cases = [[{ door: 1 }, KEY.next_change.DOOR], [{ lo: '2026-12-01' }, KEY.next_change.DATED], [{ lo: null }, KEY.next_change.LATER]];
  for (const [t, state] of cases) assert.equal(nextChange(t), state);
  assert.deepEqual(new Set(cases.map(([, s]) => s)), new Set(Object.values(KEY.next_change)));
});

test('every state of the card’s price is reached', () => {
  const cases = [
    [E, [pass([tier(80)], { pass_no: 1, kind: KEY.pass_kind.PARTY }), pass([tier(120)], { pass_no: 2 })], KEY.card_price.FULL_PASS, { card_pass: 2 }],
    [E, [pass([tier(900)], { kind: KEY.pass_kind.PACKAGE })], KEY.card_price.PACKAGE],
    [E, [pass([tier(80, { sold_out: 1 })])], KEY.card_price.SOLD_OUT],
    [E, [pass([tier(80, { valid_until: '2026-10-31' })])], KEY.card_price.ENDED],
    [{ ...E, upcoming: 0 }, [pass([tier(80)])], KEY.card_price.ENDED],
  ];
  for (const [e, passes, state, k = {}] of cases) assert.equal(priceLine({ ...e, ...k }, passes, DAY).key, state);
  assert.deepEqual(new Set(cases.map(([, , s]) => s)), new Set(Object.values(KEY.card_price)));
  assert.equal(priceLine({ ...E, card_pass: 2 }, cases[0][1], DAY).now.tier.amount, 120);
});

test('every price line a card shows has its words', () => {
  const lines = [
    ...Object.values(KEY.price).filter(k => k !== KEY.price.PRICED).map(k => priceLine({ ...E, price_state: k }, [], DAY)),
    priceLine(E, [pass([tier(80)])], DAY), priceLine(E, [pass([tier(80)], { kind: KEY.pass_kind.PACKAGE })], DAY),
    priceLine(E, [pass([tier(80, { sold_out: 1 })])], DAY), priceLine({ ...E, upcoming: 0 }, [], DAY),
  ];
  assert.deepEqual(new Set(lines.map(l => `${l.point}.${l.key}`)), new Set([
    ...Object.values(KEY.price).filter(k => k !== KEY.price.PRICED).map(k => `price.${k}`),
    ...Object.values(KEY.card_price).map(k => `card_price.${k}`)]));
  for (const l of lines) {
    const values = { pass: 'Full pass', price: '80 €' };
    assert.ok(text(l.point, l.key, values), `${l.point}.${l.key} has no words`);
  }
  for (const k of [KEY.card_price.FULL_PASS, KEY.card_price.PACKAGE]) assert.ok(text('card_price', k, { sum: '1 €' }, 'cost'));
});
