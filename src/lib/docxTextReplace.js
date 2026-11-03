import PizZip from "pizzip";

// Wording rules (payload.offerOverrides.textReplacements) also have to reach the template's
// own fixed sentences ("Es handelt sich hierbei um ein Festpreisangebot …"), which never pass
// through the render data. Applied to the rendered DOCX, paragraph by paragraph.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unxml = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const toxml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const T_RE = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g;

function cleanRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((r) => ({ re: new RegExp(esc(String(r?.from ?? "").trim()), "gi"), ok: !!String(r?.from ?? "").trim(), to: String(r?.to ?? "") }))
    .filter((r) => r.ok);
}
const apply = (text, rules) => rules.reduce((s, r) => s.replace(r.re, () => r.to), text);

function fixParagraph(p, rules) {
  // 1) lossless: a match inside a single run
  let changed = false;
  let out = p.replace(T_RE, (m, open, txt, close) => {
    const next = apply(unxml(txt), rules);
    if (next === unxml(txt)) return m;
    changed = true;
    return `${open.replace(/>$/, ' xml:space="preserve">').replace(/ xml:space="preserve"(\s[^>]*)? xml:space="preserve"/, ' xml:space="preserve"')}${toxml(next)}${close}`;
  });
  // 2) a match split across runs: merge the paragraph text into its first run — only when
  //    the paragraph holds nothing but text runs (no breaks, tabs, images).
  const joined = [...out.matchAll(T_RE)].map((m) => unxml(m[2])).join("");
  const merged = apply(joined, rules);
  if (merged !== joined && !/<w:(br|tab|drawing|pict)\b/.test(out)) {
    let first = true;
    out = out.replace(T_RE, (m, open, _t, close) => {
      if (!first) return `${open}${close}`;
      first = false;
      return `${open.replace(/>$/, ' xml:space="preserve">')}${toxml(merged)}${close}`;
    });
    changed = true;
  }
  return changed ? out : p;
}

export function replaceTextInDocx(buffer, replacements) {
  const rules = cleanRules(replacements);
  if (!rules.length) return buffer;
  const zip = new PizZip(buffer);
  const file = "word/document.xml";
  const xml = zip.file(file).asText();
  const next = xml.replace(/<w:p[ >].*?<\/w:p>/gs, (p) => fixParagraph(p, rules));
  if (next === xml) return buffer;
  zip.file(file, next);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

// Same rules over the visible text of an HTML string (signing page); markup is left alone.
export function replaceTextInHtml(html, replacements) {
  const rules = cleanRules(replacements);
  if (!rules.length) return html;
  return String(html).replace(/>([^<]+)</g, (m, txt) => {
    const next = apply(txt, rules);
    return next === txt ? m : `>${next}<`;
  });
}
