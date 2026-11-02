// src/templates/kassenantrag.js
//
// Zuschussantrag §40 Abs. 4 SGB XI an die Pflegekasse (docs/plan-kassenantrag.md).
// Phase 1: one formloses Anschreiben for every Kasse — the official per-Kasse
// forms (docs/pflegekassen/forms) follow in Phase 2.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveFields } from "./signing-docs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const KASSEN = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "pflegekassen.json"), "utf8"),
);

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

// The OC field kassenkundeName is free text (datalist suggestions only), so
// match on name/aliases: exact, else the longest name contained in the typed
// text ("IKK gesund plus Magdeburg" must not stop at the "IKK" alias).
export function findKasse(name) {
  const n = norm(name);
  if (!n) return null;
  let best = null;
  let bestLen = 2;
  for (const k of KASSEN) {
    for (const a of [k.name, ...(k.aliases || [])].map(norm)) {
      if (a === n) return k;
      if (a.length > bestLen && n.includes(a)) [best, bestLen] = [k, a.length];
    }
  }
  return best;
}

// "Aufgrund … der bisherigen Badewanne …" — the fixture being replaced. A
// Badewanne anywhere in the works wins (Wanne→Dusche umbau), else a Dusche.
export function defaultReason(measures) {
  const t = (measures || []).join(" ");
  const obj = /badewanne|\bwanne\b/i.test(t.replace(/duschwanne/gi, ""))
    ? "Badewanne"
    : /dusch/i.test(t)
      ? "Duschwanne"
      : "Sanitäreinrichtungen";
  return (
    "Aufgrund der bestehenden körperlichen Einschränkungen ist die sichere Nutzung " +
    `der bisherigen ${obj} erheblich beeinträchtigt. Die beantragten Maßnahmen sind ` +
    "zur Reduzierung des Sturzrisikos, zur Erhaltung der Restselbstständigkeit sowie " +
    "zur Verbesserung des individuellen Wohnumfeldes gemäß § 40 SGB XI erforderlich."
  );
}

// "Ziel der Maßnahme" — the three purposes the official forms ask about (LP).
export const ZWECK = {
  ermoeglicht: "die häusliche Pflege wird erst ermöglicht",
  erleichtert: "die häusliche Pflege wird erheblich erleichtert",
  selbststaendig: "eine möglichst selbstständige Lebensführung wird wiederhergestellt",
};

const fmtDate = (v) => {
  const m = String(v || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v || "");
};

// Everything the Antrag shows. `data` = getOfferRenderData(...).data of the
// signed offer; overrides = what the rep entered on site: measures, the
// customer-specific reason (individualReason), answers, signer.
export function antragValues(sr, data = {}, overrides = {}) {
  const f = resolveFields(sr, { key: "vollmacht" });
  const k = sr.payloadSnapshot?.Kundendaten || {};
  // Offer lines come with their own "- " bullet; the letter adds its own.
  const clean = (s) => String(s || "").replace(/^[\s\-–•*]+/, "").trim();
  const measures = (
    Array.isArray(overrides.measures) ? overrides.measures : (data.PrimaryServiceLines || []).map((l) => l.ServiceLine)
  )
    .map(clean)
    .filter(Boolean);
  const kasse = findKasse(f.kassenkundeName);
  // Prefilled from the offer's Wohnsituation/Vermieter fields, confirmed on site.
  const a = overrides.answers || {};
  const answers = {
    wohnsituation: a.wohnsituation ?? k.wohnsituation ?? "",
    vermieter: a.vermieter ?? (k.vermieterGenehmigung === "Ja" ? "liegt vor" : "wird nachgereicht"),
    weitere: Number(a.weitere ?? 0) || 0,
    zweck: (Array.isArray(a.zweck) ? a.zweck : []).filter((z) => ZWECK[z]),
  };
  const individualReason = String(overrides.individualReason || "").trim();
  return {
    kasse,
    kasseName: kasse?.name || f.kassenkundeName,
    // LP's list holds the verified Antrag address (a branch address only
    // matters for the final invoice), so a full list address wins over a typed
    // one (seen live: just "Nordhausen"). Typed only fills the gap.
    kasseAddress:
      kasse?.address?.length > 1 || !f.kk_krankenkasseAdresse
        ? kasse?.address || [f.kassenkundeName]
        : [kasse?.address?.[0] || f.kassenkundeName, f.kk_krankenkasseAdresse],
    name: `${f.lastName}, ${f.firstName}`.replace(/^, |, $/g, ""),
    subjectName: `${f.lastName} ${f.firstName}`.trim(),
    address: [f.street, `${f.postalCode} ${f.city}`.trim()].filter(Boolean).join(", "),
    phone: f.phone,
    geburtsdatum: fmtDate(f.geburtsdatum),
    kvnr: f.kk_versichertennr,
    pflegegrad: f.pflegegrad,
    offerNumber: sr.offerNumber || "",
    measures,
    answers,
    individualReason,
    // LP: a reason specific to this customer first (why THIS measure), the
    // standard § 40 sentence after it.
    reason: [individualReason, defaultReason(measures)].filter(Boolean).join(" "),
    signer: overrides.signer || k.emc2_contact || "",
    date: new Date().toLocaleDateString("de-DE"),
  };
}

// Required from the offer before anything goes to a Kasse.
export function missingFields(v) {
  return [
    ["kasseName", "Pflegekasse"],
    ["name", "Name"],
    ["geburtsdatum", "Geburtsdatum"],
    ["kvnr", "Versichertennummer"],
  ]
    .filter(([key]) => !v[key])
    .map(([, label]) => label);
}

// Required from the rep on site (send only).
export function missingAnswers(v) {
  const out = [];
  if (v.individualReason.length < 20) out.push("individuelle Begründung (mind. 1 Satz)");
  if (!v.answers.wohnsituation) out.push("Wohnsituation");
  if (!v.answers.zweck.length) out.push("Ziel der Maßnahme");
  return out;
}

function wohnText(a) {
  if (a.wohnsituation === "Miete") return `Mietwohnung – Zustimmung des Vermieters ${a.vermieter}`;
  return a.wohnsituation === "Eigentum" ? "Eigentum" : a.wohnsituation;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SENDER = "EmC2 Attila Landgrafe • Waldstraße 5 • 95032 Hof";
const ATTACHMENTS = [
  "die Vollmacht des/der Versicherten",
  "das Angebot zu den geplanten wohnumfeldverbessernden Maßnahmen",
  "die Abtretungserklärung",
];

// Plain-text body, used as the email text (the PDF carries the same content).
export function antragText(v) {
  return [
    "Sehr geehrte Damen und Herren,",
    "",
    `wir wenden uns im Auftrag unseres Kunden / unserer Kundin ${v.name}, geb. ${v.geburtsdatum}, ` +
      `versichert bei Ihnen unter der Versichertennummer ${v.kvnr}, an Sie.`,
    "Uns liegt eine Vollmacht vor, die uns berechtigt, diesen Antrag stellvertretend einzureichen " +
      "und die gesamte Korrespondenz mit Ihnen zu führen.",
    "",
    "Hiermit beantragen wir den Zuschuss für wohnumfeldverbessernde Maßnahmen gemäß § 40 Abs. 4 SGB XI. " +
      "Die geplante Maßnahme dient der Anpassung des häuslichen Wohnumfeldes, um die selbstständige " +
      "Lebensführung zu erleichtern und die häusliche Pflege nachhaltig zu unterstützen.",
    "",
    "Geplante Maßnahmen" + (v.offerNumber ? ` (Angebot ${v.offerNumber})` : "") + ":",
    ...v.measures.map((m) => `- ${m}`),
    "",
    "Begründung:",
    v.reason,
    "",
    "Angaben zur Wohnsituation:",
    `- Wohnsituation: ${wohnText(v.answers)}`,
    `- Weitere pflegebedürftige Personen, die das Bad nutzen: ${v.answers.weitere || "keine"}`,
    ...(v.answers.zweck.length ? [`- Ziel der Maßnahme: ${v.answers.zweck.map((z) => ZWECK[z]).join("; ")}`] : []),
    "",
    "Im Anhang übersenden wir Ihnen:",
    ...ATTACHMENTS.map((a) => `- ${a}`),
    "",
    "Wir bitten um Prüfung und Bewilligung des Zuschusses sowie um eine schriftliche Rückmeldung " +
      "über das weitere Vorgehen. Für Rückfragen oder ergänzende Unterlagen stehen wir Ihnen " +
      "jederzeit gerne zur Verfügung.",
    "",
    "Mit freundlichen Grüßen",
    "EmC2 Attila Landgrafe",
    "Service & Vertrieb",
    v.signer ? `i. A. ${v.signer}` : "",
  ].join("\n");
}

// Short on purpose: BARMER's mailbox sorts by it and failed on a long subject (LP).
export function antragSubject(v) {
  return `Wohnumfeldverbesserung – ${v.subjectName} – KVNR: ${v.kvnr}`;
}

// Blank-line separated blocks; "- " lines become a list.
function textToHtml(text) {
  return text
    .split("\n\n")
    .map((block) => {
      const lines = block.split("\n");
      const items = lines.filter((l) => l.startsWith("- "));
      const head = lines.filter((l) => !l.startsWith("- ")).map(esc).join("<br>");
      return (
        (head ? `<p>${head}</p>` : "") +
        (items.length ? `<ul>${items.map((l) => `<li>${esc(l.slice(2))}</li>`).join("")}</ul>` : "")
      );
    })
    .join("");
}

// Margins for htmlToPdfBuffer — must match the @page rule in the letter.
export const PDF_OPTS = { margin: { top: "20mm", bottom: "20mm", left: "0", right: "0" } };

// A4 letter, address block in the DIN-5008 window (Onlinebrief24 reads it there).
export function buildKassenantragHtml(v) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>Antrag § 40 SGB XI</title><style>
  /* 20 mm page margin so page 2+ don't start at the edge; positions below
     are relative to it — the address window stays at 45 mm from the top. */
  @page { size: A4; margin: 20mm 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #111; margin: 0; }
  .page { padding: 7mm 20mm 0 25mm; position: relative; }
  .window { position: absolute; top: 25mm; left: 20mm; width: 85mm; height: 45mm; }
  .sender { font-size: 7pt; border-bottom: 0.5pt solid #000; padding-bottom: 1mm; margin-bottom: 3mm; }
  .date { position: absolute; top: 60mm; right: 20mm; }
  .content { margin-top: 68mm; }
  h1 { font-size: 11pt; margin: 0 0 2mm; }
  .ref { margin: 0 0 6mm; }
  p { margin: 0 0 3mm; }
  ul { margin: 0 0 3mm; padding-left: 6mm; }
</style></head><body><div class="page">
  <div class="window">
    <div class="sender">${esc(SENDER)}</div>
    ${v.kasseAddress.map((l) => `<div>${esc(l)}</div>`).join("")}
  </div>
  <div class="date">Hof, ${esc(v.date)}</div>
  <div class="content">
    <h1>Antrag auf Zuschuss für wohnumfeldverbessernde Maßnahmen gemäß § 40 Abs. 4 SGB XI</h1>
    <div class="ref">Versicherte/r: ${esc(v.name)} · geb. ${esc(v.geburtsdatum)} · Vers.-Nr. ${esc(v.kvnr)}${
      v.pflegegrad ? ` · Pflegegrad ${esc(v.pflegegrad)}` : ""
    }<br>${esc(v.address)}</div>
    ${textToHtml(antragText(v))}
  </div>
</div></body></html>`;
}
