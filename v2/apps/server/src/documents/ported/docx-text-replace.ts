// @ts-nocheck
// GENERATED verbatim copy of src/lib/docxTextReplace.js — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
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

const preserve = (open) => (/\sxml:space=/.test(open) ? open : open.replace(/>$/, ' xml:space="preserve">'));

// Each rule is applied exactly once per paragraph — a replacement that contains its own
// search text ("Wannenaufsatz" → "Wannenaufsatz 2") must not be replaced again.
function fixParagraph(p, rules) {
  const runs = [...p.matchAll(T_RE)];
  if (!runs.length) return p;
  const joined = runs.map((m) => unxml(m[2])).join("");
  const target = apply(joined, rules);
  if (target === joined) return p;

  // 1) lossless: every match sits inside a single run
  const perRun = runs.map((m) => apply(unxml(m[2]), rules));
  if (perRun.join("") === target) {
    let i = 0;
    return p.replace(T_RE, (m, open, _t, close) => {
      const next = perRun[i++];
      return `${preserve(open)}${toxml(next)}${close}`;
    });
  }
  // 2) a match split across runs: merge the paragraph text into its first run — only when
  //    the paragraph holds nothing but text runs (no breaks, tabs, images).
  if (/<w:(br|tab|drawing|pict)\b/.test(p)) return p;
  let first = true;
  return p.replace(T_RE, (m, open, _t, close) => {
    if (!first) return `${open}${close}`;
    first = false;
    return `${preserve(open)}${toxml(target)}${close}`;
  });
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

// A priced line reads "- 2 Stk Haltegriff 40 cm": quantity first, then the description.
// Only the description can be reworded for a single position (Kosten page).
const QTY_RE = /^[\d.,]+\s*(?:Stk\.?|Stück|m²|m2|qm|lfm|km|m|h|Std\.?|Set|Paar)?\s+/i;
export function lineDescription(label) {
  const s = String(label ?? "").replace(/^\s*-\s*/, "").trim();
  return s.replace(QTY_RE, "").trim();
}

// Wording rules for the finished document: the user's own rules plus one rule per position
// whose description was changed on the Kosten page (offerOverrides.lineEdits: origLabel = the
// line as priced, label = the new description). `strip` = how the document shows a line's
// text (brand names removed), so the rule matches what is actually printed.
export function wordingRules(overrides, strip = (s) => s) {
  const rules = [...(Array.isArray(overrides?.textReplacements) ? overrides.textReplacements : [])];
  for (const e of Array.isArray(overrides?.lineEdits) ? overrides.lineEdits : []) {
    const to = String(e?.label ?? "").trim();
    const from = lineDescription(strip(String(e?.origLabel ?? "")));
    if (from && to && from !== to) rules.push({ from, to });
  }
  return rules;
}
