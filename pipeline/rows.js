// How a page recipe reads a ticket page's rows (pipeline/read_page.py runs it in the page, without this module's
// export; tests/site/recipes.browser.test.ts runs it in Chromium): every element matching the row selector that holds
// no other match, as {field: string or null} (records.Find says what a field may say).
export default ([row, fields]) => {
  const all = [...document.querySelectorAll(row)];
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fill = (t, el, vals, re) => t.replace(/\{(@?)([A-Za-z_][\w-]*)\}/g, (_, at, k) => {
    const v = at ? el.getAttribute(k) : vals[k];
    return v == null ? '\u0000' : (re ? escRe(v) : CSS.escape(v));
  });
  const templated = f => f && /\{@?[A-Za-z_][\w-]*\}/.test((f.css || '') + (f.match || ''));
  const get = (el, f, vals) => {
    if (!f) return null;
    const css = f.css && fill(f.css, el, vals, false);
    const base = f.up ? el.closest(f.up) : el;
    const targets = f.page ? [...document.querySelectorAll(css)] : !base ? [] :
      f.all ? [...base.querySelectorAll(css)] : [css ? base.querySelector(css) : base];
    const vs = targets.filter(Boolean).map(t => f.attr ? t.getAttribute(f.attr) : t.innerText).filter(v => v != null);
    if (!vs.length) return null;
    if (f.all) return vs.map(v => v.trim()).join(' · ');
    const m = f.match ? vs.join('\n').match(new RegExp(fill(f.match, el, vals, true))) : [vs.join('\n')];
    return m ? (m[1] ?? m[0]) : null;
  };
  return all.filter(el => !all.some(o => o !== el && el.contains(o))).map(el => {
    const vals = {};
    for (const [k, f] of Object.entries(fields)) if (!templated(f)) vals[k] = get(el, f, vals);
    for (const [k, f] of Object.entries(fields)) if (templated(f)) vals[k] = get(el, f, vals);
    return Object.fromEntries(Object.keys(fields).map(k => [k, vals[k] ?? null]));
  });
}
