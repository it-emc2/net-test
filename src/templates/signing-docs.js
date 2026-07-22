// src/templates/signing-docs.js
//
// HTML builders for the online-signing documents. Each returns an HTML string
// used both for on-screen display (a fragment) and for the final PDF
// (rendered by src/utils/htmlToPdf.js).

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Company logo embedded as a data URI so it works in both the page and the
// (server-side, no-origin) puppeteer PDF render. Loaded once.
let _logoDataUri = null;
function logoDataUri() {
  if (_logoDataUri !== null) return _logoDataUri;
  try {
    const p = path.join(__dirname, "..", "public", "assets", "logo.png");
    _logoDataUri = "data:image/png;base64," + fs.readFileSync(p).toString("base64");
  } catch {
    _logoDataUri = "";
  }
  return _logoDataUri;
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Payment options, indexed to selectedPaymentTermIdx. Must mirror the "O …"
// lines in docx-template.js (PARA_sz_LINES / PARA_kk_LINES).
export const SZ_PAYMENT_OPTIONS = [
  "20 % Anzahlung – ohne Abzug",
  "30 % Anzahlung abzüglich 1 % Skonto vom Anzahlungsbetrag",
  "40 % Anzahlung abzüglich 2 % Skonto vom Anzahlungsbetrag",
];

// Kassenkunde: Zahlungsbedingungen für den Selbstkostenanteil.
export const KK_PAYMENT_OPTIONS = [
  "50 % sofort und 50 % nach Fertigstellung, ohne Abzug",
  "100 % sofort abzüglich 2 % Skonto",
];

export function paymentOptionsFor(customerType) {
  return customerType === "KASSE" ? KK_PAYMENT_OPTIONS : SZ_PAYMENT_OPTIONS;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 6px; }
  h2 { font-size: 13pt; margin: 20px 0 8px; background: #ddd; border: 1px solid #000; padding: 5px 8px; }
  .muted { color: #333; }
  .row { margin: 4px 0; }
  .label { color: #333; font-size: 10pt; }
  .box { border: 1px solid #000; padding: 12px 14px; margin: 10px 0; }
  .opt { margin: 6px 0; font-size: 12pt; }
  .sig-img { max-width: 320px; max-height: 140px; display: block; margin: 6px 0; }
  .sig-line { border-top: 1px solid #000; width: 320px; margin-top: 4px; padding-top: 4px; font-size: 10pt; color: #333; }
  .audit { margin-top: 26px; font-size: 8.5pt; color: #555; border-top: 1px solid #000; padding-top: 8px; }
  .dochead { text-align: right; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
  .dochead img { height: 88px; width: auto; }
`;

// Logo header for the Vollmacht/Abtretung documents.
function docHeader() {
  return logoDataUri()
    ? `<div class="dochead"><img src="${logoDataUri()}" alt="EmC2"></div>`
    : "";
}

// Effective contact fields: prefill overlaid with any customer corrections.
function effectivePrefill(sr, doc) {
  return Object.assign({}, sr.prefill || {}, doc?.editedFields || {});
}

// Resolve all Vollmacht/Abtretung fields: customer edits (doc.editedFields)
// override the snapshot (prefill for contact data, Kundendaten for Kasse data).
function resolveFields(sr, doc) {
  const p = sr.prefill || {};
  const k = sr.payloadSnapshot?.Kundendaten || {};
  const e = doc?.editedFields || {};
  const pick = (key, dflt) => (e[key] !== undefined ? e[key] : dflt);
  return {
    firstName: pick("firstName", p.firstName || ""),
    lastName: pick("lastName", p.lastName || ""),
    street: pick("street", p.street || ""),
    postalCode: pick("postalCode", p.postalCode || ""),
    city: pick("city", p.city || ""),
    phone: pick("phone", p.phone || ""),
    email: pick("email", p.email || ""),
    geburtsdatum: pick("geburtsdatum", p.geburtsdatum || ""),
    kassenkundeName: pick("kassenkundeName", k.kassenkundeName || ""),
    kk_versichertennr: pick("kk_versichertennr", k.kk_versichertennr || ""),
    pflegegrad: pick("pflegegrad", String(k.pflegegrad || "")),
    kk_pflegegradSeit: pick("kk_pflegegradSeit", k.kk_pflegegradSeit || ""),
    kk_krankenkasseAdresse: pick("kk_krankenkasseAdresse", k.kk_krankenkasseAdresse || ""),
  };
}

// A labelled field. display mode = disabled input (unlocked by the section's
// edit button) unless locked=false; pdf mode = plain text.
function fld(label, key, value, mode, locked = true) {
  if (mode === "pdf") {
    return `<div class="row"><span class="label">${label}</span><span>${esc(value)}</span></div>`;
  }
  return `<div class="fld"><span class="fld-label">${label}</span><input type="text" data-edit-field="${key}" value="${esc(value)}"${locked ? " disabled" : ""}></div>`;
}

function pflegegradField(value, mode) {
  const grades = ["1", "2", "3", "4", "5"];
  if (mode === "pdf") {
    const marks = grades.map((g) => `${g === String(value) ? "☒" : "☐"} ${g}`).join(" &nbsp; ");
    return `<div class="row"><span class="label">Pflegegrad:</span><span>${marks}</span></div>`;
  }
  return `<div class="fld"><span class="fld-label">Pflegegrad:</span><span class="pg-opts">${grades
    .map(
      (g) =>
        `<label><input type="radio" name="pflegegrad" value="${g}"${g === String(value) ? " checked" : ""} disabled> ${g}</label>`,
    )
    .join("")}</span></div>`;
}

function editButton() {
  return `<button type="button" class="edit-toggle" data-editing="0">✎ Bearbeiten</button>`;
}

function wrap(title, inner) {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${BASE_CSS}</style></head><body>${inner}</body></html>`;
}

function signatureBlock(doc, prefill, opts = {}) {
  const name =
    opts.name != null
      ? opts.name
      : `${doc.editedFields?.firstName || prefill?.firstName || ""} ${
          doc.editedFields?.lastName || prefill?.lastName || ""
        }`.trim();
  const signedAt = doc.signedAt ? new Date(doc.signedAt) : new Date();
  const image = opts.image !== undefined ? opts.image : doc.signatureImage;
  const img = image ? `<img class="sig-img" src="${image}" alt="Unterschrift">` : "";
  const audit =
    opts.showAudit === false
      ? ""
      : `<div class="audit">
      Elektronisch signiert am ${signedAt.toLocaleString("de-DE")} ·
      IP: ${esc(doc.signedIp || "-")} ·
      über den Online-Signatur-Link der EmC2 Attila Landgrafe.
    </div>`;
  return `
    <h2>${esc(opts.heading || "Unterschrift")}</h2>
    <div class="row">${esc(doc.place || prefill?.city || "")}, ${signedAt.toLocaleDateString("de-DE")}</div>
    ${img}
    <div class="sig-line">${esc(name)}</div>
    ${audit}`;
}

// ---- interactive controls (rendered INSIDE the document in display mode) ----

// Styling for the interactive controls; included in the display fragments so
// they are self-contained regardless of the host page.
const INTERACTIVE_CSS = `
.opt-label { display:flex; align-items:flex-start; gap:8px; padding:6px 0; font-size:12pt; cursor:pointer; }
.opt-label input { margin-top:4px; }
#sigCanvas { width:100%; height:170px; border:1px solid #000; background:#fff; touch-action:none; cursor:crosshair; display:block; }
.si-btnrow { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px; }
.si-btnrow button { font-size:13px; padding:7px 14px; border:1px solid #aaa; background:#fff; cursor:pointer; }
#submitBtn { background:#0066cc; color:#fff; border-color:#0066cc; font-weight:600; padding:10px 24px; font-size:15px; }
#submitBtn:disabled { opacity:.5; cursor:not-allowed; }
.si-linkbtn { border:none; background:transparent; color:#0066cc; text-decoration:underline; cursor:pointer; }
#typeWrap { margin-top:10px; }
#typeName { border:none; border-bottom:1px solid #000; padding:5px 2px; font-size:15px; background:transparent; width:100%; max-width:340px; }
#uploadWrap { margin-top:10px; }
#sigUpload { font-size:14px; margin-top:4px; }
.sig-preview { display:block; margin-top:10px; max-width:320px; max-height:140px; border:1px solid #aaa; background:#fff; padding:4px; }
.si-err { margin-top:12px; padding:10px 12px; border:1px solid #b71c1c; background:#fdecea; color:#7f1d1d; }
.hidden { display:none !important; }
.editsec h2 { display:flex; justify-content:space-between; align-items:center; gap:10px; }
.edit-toggle { font-size:12px; padding:3px 12px; border:1px solid #000; background:#fff; cursor:pointer; font-weight:normal; }
.edit-toggle:hover { background:#f2f2f2; }
.fld { display:flex; gap:10px; margin:9px 0; align-items:baseline; }
.fld-label { min-width:160px; flex-shrink:0; color:#333; font-size:11pt; }
.fld input[type=text] { flex:1; border:none; border-bottom:1px solid transparent; padding:3px 2px; font-size:12pt; background:transparent; color:#111; }
.fld input[type=text]:not(:disabled) { border-bottom-color:#000; background:#fffdf0; }
.fld input:disabled { color:#111; -webkit-text-fill-color:#111; opacity:1; cursor:default; }
.pg-opts { display:flex; gap:16px; flex-wrap:wrap; }
.pg-opts label { display:flex; gap:5px; align-items:center; }
`;

// Scoped document CSS for Vollmacht/Abtretung display fragments.
const DOC_CSS = `
.signdoc { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12pt; line-height:1.5; }
.signdoc h1 { font-size:18pt; margin:0 0 6px; }
.signdoc h2 { font-size:13pt; margin:18px 0 8px; background:#ddd; border:1px solid #000; padding:5px 8px; }
.signdoc .muted { color:#333; }
.signdoc .row { display:flex; gap:10px; margin:9px 0; align-items:baseline; }
.signdoc .row .label { min-width:160px; flex-shrink:0; }
.signdoc .label { color:#333; font-size:11pt; }
.signdoc .box { border:1px solid #000; padding:16px 18px; margin:12px 0; }
.signdoc .opt { margin:8px 0; }
.signdoc .dochead { text-align:right; border-bottom:2px solid #000; padding-bottom:8px; margin-bottom:12px; }
.signdoc .dochead img { height:88px; width:auto; }
`;

// Interactive signature area (canvas + clear + type-name fallback + upload).
// suffix distinguishes a second, independent signature pad on the same
// document (e.g. the Bevollmächtigte/r signature on the Zusatzblatt) — the
// front-end (signpage/app.js) wires up any block whose #sigCanvas<suffix>
// exists.
function interactiveSignatureBlock(opts = {}) {
  const suffix = opts.suffix || "";
  const heading = opts.heading || "Ihre Unterschrift";
  const hint = opts.hint || "Bitte unterschreiben Sie mit dem Finger oder der Maus im Feld.";
  return `
    <h2>${esc(heading)}</h2>
    <p class="muted">${esc(hint)}</p>
    <canvas id="sigCanvas${suffix}"></canvas>
    <div class="si-btnrow">
      <button type="button" id="clearSig${suffix}">Löschen</button>
      <button type="button" class="si-linkbtn" id="toggleType${suffix}">Namen tippen statt zeichnen</button>
      <button type="button" class="si-linkbtn" id="toggleUpload${suffix}">Bild hochladen</button>
    </div>
    <div class="hidden" id="typeWrap${suffix}">
      <div class="label">Ihr vollständiger Name</div>
      <input type="text" id="typeName${suffix}" placeholder="Vor- und Nachname">
    </div>
    <div class="hidden" id="uploadWrap${suffix}">
      <div class="label">Bild Ihrer Unterschrift (JPG oder PNG)</div>
      <input type="file" id="sigUpload${suffix}" accept="image/*">
      <img id="sigPreview${suffix}" class="sig-preview hidden" alt="Vorschau der hochgeladenen Unterschrift">
    </div>`;
}

function submitBar(label) {
  return `
    <div class="si-btnrow" style="margin-top:20px;">
      <button type="button" id="submitBtn">${esc(label || "Unterschreiben & weiter")}</button>
    </div>
    <div id="docError" class="si-err hidden"></div>`;
}

// Parse SelfPayLines into { title, options[], footer } for interactive radios.
function parsePayLines(selfPayLines) {
  const lines = Array.isArray(selfPayLines) ? selfPayLines : [];
  let title = "";
  const options = [];
  const footer = [];
  for (const l of lines) {
    const t = String(l?.Text || "");
    if (l?.IsTitle) title = t;
    else if (/^[O☒]\s/.test(t)) options.push(t.replace(/^[O☒]\s+/, "").replace(/\s+oder\s*$/i, ""));
    else footer.push(t);
  }
  return { title, options, footer };
}

// Whether SelfPayLines actually offers a choice (vs. a single fixed line,
// e.g. Kassenkunde Selbstkostenanteil under KK_PAYMENT_THRESHOLD).
export function hasPaymentChoice(selfPayLines) {
  return parsePayLines(selfPayLines).options.length > 0;
}

function interactivePaymentBlock(data) {
  const { title, options, footer } = parsePayLines(data.SelfPayLines);
  if (!options.length) return "";
  return `
    <h2>Zahlungsbedingungen</h2>
    ${title ? `<p class="muted">${esc(title)}</p>` : ""}
    <div class="si-pay">
      ${options
        .map(
          (t, i) =>
            `<label class="opt-label"><input type="radio" name="paymentTerm" value="${i}"><span>${esc(t)}</span></label>`,
        )
        .join("")}
    </div>
    ${footer.map((f) => `<p class="muted" style="font-size:10.5pt;">${esc(f)}</p>`).join("")}`;
}

// ---- Angebot as HTML (same content as the docx offer, clean layout) ----

const ANGEBOT_CSS = `
.ang { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:11pt; line-height:1.45; }
.ang h2 { font-size:12pt; margin:20px 0 8px; background:#e6e6e6; padding:6px 10px; }
.ang .topbar { display:flex; justify-content:flex-end; }
.ang .topbar img { height:96px; }
.ang .sender { font-size:8.5pt; color:#333; border-bottom:1px solid #999; padding-bottom:2px; margin:6px 0 14px; }
.ang .addr-row { display:flex; justify-content:space-between; gap:24px; }
.ang .cust div { margin:1px 0; }
.ang .meta { min-width:300px; }
.ang .mrow { display:flex; justify-content:space-between; gap:16px; margin:1px 0; }
.ang .mrow .mlabel { color:#333; }
.ang .mrow .mval { text-align:right; }
.ang .b { font-weight:bold; }
.ang .angtitle { background:none; padding:0; font-size:13pt; font-weight:bold; margin:26px 0 12px; }
.ang .muted { color:#333; }
.ang table.pos { width:100%; border-collapse:collapse; margin:10px 0; font-size:10.5pt; }
.ang table.pos th { background:#e6e6e6; text-align:left; padding:6px 8px; border-bottom:1px solid #999; }
.ang table.pos td { padding:8px; border-bottom:1px solid #ccc; vertical-align:top; }
.ang table.pos th.num, .ang table.pos td.num { text-align:right; white-space:nowrap; }
.ang .pos-lines { list-style:none; padding:0; margin:6px 0 0; }
.ang .pos-lines li { margin:2px 0; padding-left:14px; position:relative; }
.ang .pos-lines li::before { content:"–"; position:absolute; left:0; }
.ang .matsub { font-weight:bold; margin:12px 0 4px; }
.ang .matline { margin:2px 0; padding-left:2px; }
.ang .totals { width:auto; margin-left:auto; min-width:300px; border-collapse:collapse; }
.ang .totals td { padding:5px 8px; }
.ang .totals td.num { text-align:right; white-space:nowrap; }
.ang .totals tr.alt td { font-weight:bold; border-top:1px solid #000; }
.ang .pay .opt { margin:5px 0; }
.ang .sig-img { max-width:300px; max-height:130px; display:block; margin:6px 0; }
.ang .hinweise { margin:16px 0; }
.ang .hinweise p { margin:8px 0; }
.ang .closing { margin-top:22px; }
.ang .our-sig-img { max-width:220px; max-height:80px; display:block; margin:8px 0 2px; }
.ang .accept-line { font-weight:bold; margin:22px 0 6px; }
.ang .sig-line { border-top:1px solid #000; width:300px; margin-top:4px; padding-top:4px; font-size:10pt; color:#333; }
.ang .audit { margin-top:22px; font-size:8.5pt; color:#555; border-top:1px solid #000; padding-top:8px; }
`;

/**
 * @param {object} data  result of getOfferRenderData().data (mapData output)
 * @param {object} opts  { mode: 'display'|'pdf', sr, doc }
 * The offer body is read-only. In 'pdf' mode the chosen payment term (already
 * ticked in data.SelfPayLines) and the signature block are included.
 */
// Fixed EmC2 contact details shown in the offer header (as in the docx offer).
const EMC2_SENDER = "EmC2 Attila Landgrafe, Waldstraße 5, 95032 Hof";
const EMC2_PHONE = "09281 5915900";
const EMC2_EMAIL = "service@e-m-c-2.de";
const OFFER_INTRO =
  "vielen Dank für Ihre Anfrage und Ihr damit verbundenes Interesse. " +
  "Wir freuen uns, Ihnen folgendes Angebot unterbreiten zu können.";

// "Sehr geehrter Herr Mustermann," — appends the last name to the salutation.
function greetLine(d) {
  const g = d.Greeting || "Sehr geehrte Damen und Herren";
  const n = String(d.Nachname || "").trim();
  return `<p>${esc(g)}${n ? " " + esc(n) : ""},</p>`;
}

// Position bullet list (service lines) shown inside the Bezeichnung cell.
function posLines(arr, key) {
  const items = (arr || [])
    .map((r) => String(r?.[key] ?? "").trim())
    .filter(Boolean)
    .map((t) => `<li>${esc(t.replace(/^-\s*/, ""))}</li>`)
    .join("");
  return items ? `<ul class="pos-lines">${items}</ul>` : "";
}

// Material block: bold ALL-CAPS subcategory headers, plain item lines.
// NOTE: selected products (Items / "Produkte") are already contained in
// MaterialsLines (they're added to the materials/Zubehör bucket and priced
// there once). We do NOT render Items separately — that would show the same
// product twice. Pricing is unaffected (single count in materials).
function materialBlock(d) {
  const out = [];
  for (const row of d.MaterialsLines || []) {
    const line = String(row?.MaterialLine ?? "").trim();
    if (!line) continue;
    if (!line.startsWith("-")) out.push(`<div class="matsub">${esc(line)}</div>`);
    else out.push(`<div class="matline">${esc(line)}</div>`);
  }
  return out.join("");
}

// Festpreis-/Hinweisblock nach der Gesamtsumme (BU-Angebot).
// Der Festpreis-Satz wird immer gezeigt; der ACHTUNG-/Regie-Absatz nur wenn
// eine Duschwanne montiert wird; die Selbstkosten-/Zuschusszeile nur für
// Kassenkunden mit gewährtem Zuschuss. Der Stundensatz kommt aus RegieRateFmt
// (59,50€ SZ / 69,50€ KK).
function festpreisBlock(d) {
  const payer = String(d.PayerKind || "").toUpperCase();
  const isKK = payer === "KK" || payer === "KASSENKUNDE";
  const hasDuschwanne = (d.PrimaryServiceLines || []).some((r) =>
    /duschwanne/i.test(String(r?.ServiceLine || "")),
  );
  const rate = String(d.RegieRateFmt || "").trim();
  const out = [
    `<p>Es handelt sich hierbei um ein Festpreisangebot für die oben definierten Leistungen. Für eine Teilbeauftragung wäre ein neues Angebot erforderlich.</p>`,
  ];
  if (hasDuschwanne) {
    out.push(
      `<p><strong>ACHTUNG:</strong> Ob eine ebenerdige Montage der Duschwanne möglich ist, kann erst nach dem Ausbau der bestehenden Wanne beurteilt werden. Sollten dabei zusätzliche oder weitere Leistungen erforderlich oder von Ihnen gewünscht sein, können zusätzliche Kosten entstehen. Diese werden vorab mit Ihnen besprochen, bedürfen Ihrer Zustimmung und werden auf Regiebasis nach tatsächlichem Aufwand abgerechnet.${rate ? ` (Stundensatz-Facharbeiter: ${esc(rate)} netto)` : ""}</p>`,
    );
  }
  if (isKK && d.hasSubsidyLine) {
    out.push(
      `<p>Der Selbstkostenanteil beträgt ${esc(d.SelbstkostenanteilFmt || "")} unter Berücksichtigung eines gewährten Zuschusses durch die Pflegekasse i.H.v. ${esc(d.Zuschusskrankenkasse || "")}.</p>`,
    );
  }
  return `<div class="hinweise">${out.join("")}</div>`;
}

// Abschlussblock: Grußformel + Gültigkeit + Unterschrift des zuständigen
// EmC2-Mitarbeiters (aus OurSignatureImage) + "Ihr Team von EmC2".
// Gilt für BU und AH.
function closingBlock(d) {
  const validity = d.ValidityDate
    ? ` Dieses Angebot ist gültig bis ${esc(d.ValidityDate)}.`
    : "";
  const sigImg = d.OurSignatureImage
    ? `<img class="our-sig-img" src="${d.OurSignatureImage}" alt="Unterschrift EmC2">`
    : "";
  return `
    <div class="closing">
      <p>Für Rückfragen stehen wir Ihnen gerne zur Verfügung. Wir bedanken uns für Ihr Vertrauen und freuen uns, von Ihnen zu hören.${validity} Mit freundlichen Grüßen.</p>
      ${sigImg}
      <p class="b">Ihr Team von EmC2</p>
    </div>`;
}

// Kleiner Zustimmungs-Hinweis direkt über dem Unterschriftsfeld.
function acceptHeading() {
  return `<div class="accept-line">Angebot akzeptiert / Auftrag bestätigt:</div>`;
}

export function buildAngebotHtml(data, opts = {}) {
  const mode = opts.mode || "display";
  const d = data || {};

  const totals = Array.isArray(d.Totals) ? d.Totals : [];
  const totalsTable = totals.length
    ? `<table class="totals"><tbody>${totals
        .map(
          (t) =>
            `<tr class="${t.isAlt ? "alt" : ""}"><td>${esc(t.label || "")}</td><td class="num">${esc(t.value || "")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  // Payment + signature live INSIDE the document. In 'display' mode they are
  // interactive (radios + signature pad); in 'pdf' mode they are baked in.
  // The closing block (Grußformel + EmC2-Unterschrift) is rendered between the
  // payment terms and the customer's signature area.
  let payHtml = "";
  let sigHtml = "";
  if (mode === "pdf") {
    const payLines = Array.isArray(d.SelfPayLines) ? d.SelfPayLines : [];
    payHtml = payLines.length
      ? `<h2>Zahlungsbedingungen</h2><div class="pay">${payLines
          .map(
            (l) =>
              `<div class="opt${l.IsTitle ? " muted" : ""}">${esc(l.Text || "")}</div>`,
          )
          .join("")}</div>`
      : "";
    const p = effectivePrefill(opts.sr || {}, opts.doc || {});
    sigHtml = signatureBlock(opts.doc || {}, p);
  } else {
    payHtml = interactivePaymentBlock(d);
    sigHtml = interactiveSignatureBlock() + submitBar("Unterschreiben & weiter");
  }

  const metaRow = (label, val, bold) =>
    `<div class="mrow"><span class="mlabel${bold ? " b" : ""}">${label}</span><span class="mval">${esc(val)}</span></div>`;

  const inner = `
    <div class="ang">
      <style>${ANGEBOT_CSS}${mode === "pdf" ? "" : INTERACTIVE_CSS}</style>
      <div class="topbar">
        ${logoDataUri() ? `<img src="${logoDataUri()}" alt="EmC2">` : "<strong>EmC2</strong>"}
      </div>
      <div class="sender">${esc(EMC2_SENDER)}</div>

      <div class="addr-row">
        <div class="cust">
          ${d.Anrede ? `<div>${esc(d.Anrede)}</div>` : ""}
          <div>${esc([d.Vorname, d.Nachname].filter(Boolean).join(" "))}</div>
          <div>${esc(d.Adresse || "")}</div>
          <div>${esc([d.PLZ, d.Stadt].filter(Boolean).join(" "))}</div>
        </div>
        <div class="meta">
          ${metaRow("Angebotsnummer", d.Angebotsnummer || "")}
          ${metaRow("Datum", d.Datum || "")}
          ${d.Ansprechpartner ? metaRow("Ansprechpartner", d.Ansprechpartner) : ""}
          ${metaRow("Telefon", EMC2_PHONE)}
          ${metaRow("E-Mail", EMC2_EMAIL)}
          ${d.Kundennummer ? metaRow("Referenz", d.Kundennummer, true) : ""}
        </div>
      </div>

      <div class="angtitle">Ihr Angebot ${esc(d.Angebotsnummer || "")}</div>
      ${greetLine(d)}
      <p>${esc(OFFER_INTRO)}</p>

      <table class="pos">
        <thead><tr>
          <th>Pos</th><th>Menge</th><th>Bezeichnung</th>
          <th class="num">Einheitspreis</th><th class="num">Gesamt</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>001</td>
            <td>1 Stk</td>
            <td>
              <strong>${esc(d.ServicePosTitle || "Auszuführende Arbeiten")}</strong>
              ${posLines(d.PrimaryServiceLines, "ServiceLine")}
              ${(d.IncludedServiceLines || []).length ? `<div class="muted" style="margin-top:8px;"><em>Im Preis enthalten:</em></div>${posLines(d.IncludedServiceLines, "ServiceLine")}` : ""}
            </td>
            <td class="num">${esc(d.ServiceUnitPrice || d.ServiceTotal || "")}</td>
            <td class="num">${esc(d.ServiceTotal || "")}</td>
          </tr>
          ${
            (d.MaterialsLines || []).length
              ? `<tr>
                   <td>002</td>
                   <td>1 Stk</td>
                   <td>
                     <strong>${esc(d.MaterialsPosTitle || "Material für Badumbau")}</strong>
                     <div style="margin-top:6px;">${materialBlock(d)}</div>
                   </td>
                   <td class="num">${esc(d.MaterialsUnitPrice || d.MaterialsTotal || "")}</td>
                   <td class="num">${esc(d.MaterialsTotal || "")}</td>
                 </tr>`
              : ""
          }
          ${(d.BonusRows || [])
            .filter((b) => b && b.BonusLabel)
            .map(
              (b) =>
                `<tr>
                   <td>${esc(b.Bonus || "")}</td>
                   <td>${esc(b.BonusMenge || "1 Stk")}</td>
                   <td>
                     <strong>${esc(b.BonusLabel)}</strong>
                     ${b.BonusDetail ? `<div class="pos-lines"><div>${esc(b.BonusDetail)}</div></div>` : ""}
                   </td>
                   <td class="num">${esc(b.preis || "")}</td>
                   <td class="num">${esc(b.gesamt || "")}</td>
                 </tr>`,
            )
            .join("")}
        </tbody>
      </table>

      <h2>Zusammenstellung</h2>
      ${totalsTable}

      ${festpreisBlock(d)}

      ${payHtml}

      ${closingBlock(d)}

      ${acceptHeading()}
      ${sigHtml}
    </div>`;

  return mode === "pdf" ? wrap("Angebot", inner) : inner;
}

// ---- AH (Alltagshilfe) Angebot — mirrors the AH offer PDF; no payment terms ----
export function buildAhAngebotHtml(data, opts = {}) {
  const mode = opts.mode || "display";
  const d = data || {};
  const services = Array.isArray(d.AhServices) ? d.AhServices : [];

  const anfahrtRow = `
    <tr>
      <td>1.</td>
      <td>
        <strong>Anfahrtspauschale Alltagshilfe</strong>
        <div class="muted" style="font-size:10pt;">Die Anfahrtspauschale enthält die Kosten für das Rüsten vor der Anfahrt sowie die KFZ-Kosten.</div>
      </td>
      <td class="num">${esc(d.AhAnfahrtMenge || "")}</td>
      <td class="num">${esc(d.AhAnfahrtEinzelpreis || "")}</td>
      <td class="num">${esc(d.AhAnfahrtGesamt || "")}</td>
    </tr>`;

  const serviceRows = services
    .map((s) => {
      const tasks = (s.AhServiceTasks || [])
        .map((t) => `<li>${esc(t.AhTaskLabel || "")}</li>`)
        .join("");
      return `<tr>
        <td>${esc(s.AhServicePos || "")}</td>
        <td>
          <strong>${esc(s.AhServiceTitle || "")}</strong>
          ${s.AhServiceSubtitle ? `<div class="muted">${esc(s.AhServiceSubtitle)}</div>` : ""}
          ${tasks ? `<ul class="pos-lines">${tasks}</ul>` : ""}
        </td>
        <td class="num">${esc(s.AhServiceMenge || "")}</td>
        <td class="num">${esc(s.AhServiceEinzelpreis || "")}</td>
        <td class="num">${esc(s.AhServiceGesamt || "")}</td>
      </tr>`;
    })
    .join("");

  const kond = (d.AhKondRows || [])
    .filter((r) => r && r.AhKondLabel)
    .map(
      (r) =>
        `<div class="row"><span class="label" style="min-width:340px;">${esc(r.AhKondLabel)}</span><span>${esc(r.AhKondValue || "")}</span></div>`,
    )
    .join("");

  // Signature: interactive on screen; baked in the final PDF. No payment terms.
  let sig = "";
  if (mode === "pdf") {
    const p = effectivePrefill(opts.sr || {}, opts.doc || {});
    sig = signatureBlock(opts.doc || {}, p);
  } else {
    sig = interactiveSignatureBlock() + submitBar("Unterschreiben & absenden");
  }

  const metaRow = (label, val) =>
    `<div class="mrow"><span class="mlabel">${label}</span><span class="mval">${esc(val)}</span></div>`;

  const inner = `
    <div class="ang">
      <style>${ANGEBOT_CSS}${mode === "pdf" ? "" : INTERACTIVE_CSS}</style>
      <div class="topbar">
        ${logoDataUri() ? `<img src="${logoDataUri()}" alt="EmC2">` : "<strong>EmC2 Alltagshilfe</strong>"}
      </div>
      <div class="sender">EmC2 Soziale Dienste UG (haftungsbeschränkt) · Waldstraße 5 · 95032 Hof</div>

      <div class="addr-row">
        <div class="cust">
          ${d.Anrede ? `<div>${esc(d.Anrede)}</div>` : ""}
          <div>${esc([d.Vorname, d.Nachname].filter(Boolean).join(" "))}</div>
          <div>${esc(d.Adresse || "")}</div>
          <div>${esc([d.PLZ, d.Stadt].filter(Boolean).join(" "))}</div>
        </div>
        <div class="meta">
          ${metaRow("Angebot-Nr.", d.Angebotsnummer || "")}
          ${metaRow("Datum", d.Datum || "")}
          ${d.ValidityDate ? metaRow("Gültig bis", d.ValidityDate) : ""}
          ${d.Ansprechpartner ? metaRow("Ansprechpartner", d.Ansprechpartner) : ""}
        </div>
      </div>

      <div class="angtitle">Ihr Angebot für Hilfe im Haushalt</div>
      ${greetLine(d)}
      <p>${esc(OFFER_INTRO)}</p>

      <table class="pos">
        <thead><tr>
          <th>Pos.</th><th>Beschreibung</th>
          <th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">Gesamtpreis</th>
        </tr></thead>
        <tbody>${anfahrtRow}${serviceRows}</tbody>
      </table>

      <table class="totals"><tbody>
        <tr class="alt"><td>Gesamtbetrag</td><td class="num">${esc(d.AhGesamtbetrag || "")}</td></tr>
      </tbody></table>

      ${d.AhNote ? `<p class="muted">${esc(d.AhNote)}</p>` : ""}

      ${kond ? `<h2>Konditionen</h2>${kond}` : ""}

      ${closingBlock(d)}

      ${acceptHeading()}
      ${sig}
    </div>`;

  return mode === "pdf" ? wrap("Angebot – Alltagshilfe", inner) : inner;
}

// ---- Phase 2 (Kassenkunde) — ready to wire ----

// Wrap a Vollmacht/Abtretung body for on-screen display (scoped, interactive).
function displayFragment(inner) {
  return `<div class="signdoc"><style>${DOC_CSS}${INTERACTIVE_CSS}</style>${inner}</div>`;
}

export function buildVollmachtHtml(sr, doc, mode = "pdf") {
  const f = resolveFields(sr, doc);
  const entlastung = !!doc.extraFields?.entlastungsguthaben;
  const budgetWuM = doc.extraFields?.budgetWuM !== false; // default on
  const editBtn = mode === "pdf" ? "" : " " + editButton();

  const guthaben =
    mode === "pdf"
      ? `<div class="box">
           <div class="opt">${entlastung ? "☒" : "☐"} aktuelles Entlastungsguthaben</div>
           <div class="opt">${budgetWuM ? "☒" : "☐"} Budget für Wohnumfeldverbessernde Maßnahmen</div>
         </div>`
      : `<div class="box">
           <label class="opt-label"><input type="checkbox" id="entlastungCheckbox"><span>aktuelles Entlastungsguthaben (§45b SGB XI)</span></label>
           <label class="opt-label"><input type="checkbox" id="budgetWuMCheckbox" checked><span>Budget für Wohnumfeldverbessernde Maßnahmen</span></label>
         </div>`;

  const body = `
    ${docHeader()}
    <h1>Vollmacht für die Krankenkasse</h1>
    <p class="muted">Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3,4,5 SGB XI
    und Abfrage des Entlastungsbudgets nach §45b SGB XI.</p>
    <div class="box">
      <div class="row"><span class="label">Bevollmächtigter:</span> <span>EmC2 Attila Landgrafe / EmC2 Soziale Dienste UG (haftungsbeschränkt), Waldstraße 5, 95032 Hof</span></div>
    </div>
    <div class="editsec">
      <h2>Vollmachtgeber/in${editBtn}</h2>
      <div class="box">
        ${fld("Nachname:", "lastName", f.lastName, mode)}
        ${fld("Vorname:", "firstName", f.firstName, mode)}
        ${fld("Straße:", "street", f.street, mode)}
        ${fld("PLZ:", "postalCode", f.postalCode, mode)}
        ${fld("Ort:", "city", f.city, mode)}
        ${fld("Telefon:", "phone", f.phone, mode)}
        ${fld("Geburtsdatum:", "geburtsdatum", f.geburtsdatum, mode)}
        ${fld("Krankenkasse:", "kassenkundeName", f.kassenkundeName, mode)}
        ${fld("KVNR:", "kk_versichertennr", f.kk_versichertennr, mode)}
      </div>
    </div>
    <h2>Abzufragende Guthaben</h2>
    ${guthaben}
    <p class="muted">Diese Vollmacht gilt bis auf Widerruf oder bis das Vertragsverhältnis
    aufgehoben wird und kann jederzeit schriftlich widerrufen werden.</p>`;

  if (mode === "pdf") return wrap("Vollmacht für die Krankenkasse", body + signatureBlock(doc, f));
  return displayFragment(body + interactiveSignatureBlock() + submitBar("Unterschreiben & weiter"));
}

export function buildAbtretungHtml(sr, doc, mode = "pdf") {
  const f = resolveFields(sr, doc);
  const editBtn = mode === "pdf" ? "" : " " + editButton();
  const body = `
    ${docHeader()}
    <h1>Abtretungserklärung für wohnumfeldverbessernde Maßnahmen (§40 SGB XI)</h1>
    <div class="editsec">
      <h2>Kontaktdaten Auftraggeber${editBtn}</h2>
      <div class="box">
        ${fld("Nachname:", "lastName", f.lastName, mode)}
        ${fld("Vorname:", "firstName", f.firstName, mode)}
        ${fld("Geburtstag:", "geburtsdatum", f.geburtsdatum, mode)}
        ${fld("Vers.-Nr.:", "kk_versichertennr", f.kk_versichertennr, mode)}
        ${fld("Straße:", "street", f.street, mode)}
        ${fld("PLZ:", "postalCode", f.postalCode, mode)}
        ${fld("Ort:", "city", f.city, mode)}
        ${fld("Telefon:", "phone", f.phone, mode)}
        ${fld("E-Mail:", "email", f.email, mode)}
        ${pflegegradField(f.pflegegrad, mode)}
        ${fld("Pflegegrad seit:", "kk_pflegegradSeit", f.kk_pflegegradSeit, mode)}
      </div>
    </div>
    <div class="editsec">
      <h2>Kontaktdaten Pflegekasse${editBtn}</h2>
      <div class="box">
        ${fld("Name:", "kassenkundeName", f.kassenkundeName, mode)}
        ${fld("Adresse:", "kk_krankenkasseAdresse", f.kk_krankenkasseAdresse, mode)}
      </div>
    </div>
    <p class="muted">Hiermit erteile ich meine Abtretungserklärung und mein Einverständnis,
    dass der Anbieter EmC2 Attila Landgrafe, Waldstraße 5, 95032 Hof, die Leistungen nach
    §40 SGB XI direkt mit der Pflegekasse abrechnen darf.</p>`;

  if (mode === "pdf") return wrap("Abtretungserklärung", body + signatureBlock(doc, f));
  return displayFragment(body + interactiveSignatureBlock() + submitBar("Unterschreiben & absenden"));
}

// ---- AH (Alltagshilfe) — Zusatzblatt + Abtretungserklärung §45b SGB XI ----

// Optional Bevollmächtigte/r block: two free-typed contact fields (no
// pre-filled value to protect, so unlike fld() they start unlocked) plus,
// only when a name is given, their own signature (captured via the second
// interactiveSignatureBlock({ suffix: "2" }) pad).
function bevollmaechtigterBox(doc, mode) {
  const bevName = doc.editedFields?.bevollmaechtigterName || "";
  const bevPhone = doc.editedFields?.bevollmaechtigterTelefon || "";
  return `<div class="box">
    ${fld("Nachname, Vorname Bevollmächtigte/r / abweichender Ansprechpartner:", "bevollmaechtigterName", bevName, mode, false)}
    ${fld("Telefon:", "bevollmaechtigterTelefon", bevPhone, mode, false)}
  </div>`;
}

function rechnungsversandBox(doc, prefill, mode) {
  const post = !!doc.extraFields?.rechnungPost;
  const perEmail = !!doc.extraFields?.rechnungEmail;
  const emailAdresse = doc.editedFields?.rechnungEmailAdresse || prefill?.email || "";
  if (mode === "pdf") {
    return `<div class="box">
      <div class="opt">${post ? "☒" : "☐"} Ich möchte immer eine Rechnungskopie per Post erhalten. <sup>1)</sup></div>
      <div class="opt">${perEmail ? "☒" : "☐"} Ich möchte immer eine Rechnungskopie per E-Mail erhalten. <sup>1)</sup></div>
      <div class="row"><span class="label">E-Mail-Adresse:</span><span>${esc(emailAdresse)}</span></div>
    </div>`;
  }
  return `<div class="box">
    <label class="opt-label"><input type="checkbox" id="rechnungPostCheckbox"><span>Ich möchte immer eine Rechnungskopie per Post erhalten. <sup>1)</sup></span></label>
    <label class="opt-label"><input type="checkbox" id="rechnungEmailCheckbox"><span>Ich möchte immer eine Rechnungskopie per E-Mail erhalten. <sup>1)</sup></span></label>
    ${fld("E-Mail-Adresse:", "rechnungEmailAdresse", emailAdresse, mode, false)}
  </div>`;
}

export function buildZusatzblattHtml(sr, doc, mode = "pdf") {
  const f = resolveFields(sr, doc);
  const custName = `${f.firstName} ${f.lastName}`.trim();
  const bevName = doc.editedFields?.bevollmaechtigterName || "";

  // The Bevollmächtigte/r signature only exists (in the PDF) when a name was
  // actually given — it is an optional sub-section of an optional section.
  const bevSignatureHtml =
    mode === "pdf"
      ? bevName
        ? signatureBlock(doc, f, {
            heading: "Unterschrift Bevollmächtigte/r",
            name: bevName,
            image: doc.extraFields?.bevollmaechtigterSignature || "",
            showAudit: false,
          })
        : `<div class="row"><span class="label">Unterschrift Bevollmächtigte/r:</span><span>–</span></div>`
      : interactiveSignatureBlock({
          suffix: "2",
          heading: "Unterschrift Bevollmächtigte/r",
          hint: "Nur ausfüllen, wenn oben ein/e Bevollmächtigte/r bzw. abweichende/r Ansprechpartner/in angegeben wurde.",
        });

  const body = `
    ${docHeader()}
    <h1>Wichtige Hinweise zum Angebot / zu Terminen</h1>
    <p>Die Termine können aufgrund unvorhersehbarer Ereignisse (z.&nbsp;B. Verkehrslage) hinsichtlich des Start- u. Endzeitpunktes variieren. Wir bitten dafür um Verständnis!</p>
    <p>Die Leistungen sind nach §4 Nr. 16 (g) UStG von der Umsatzsteuer befreit.</p>
    <p>Die Abrechnung erfolgt im 5-Minuten-Takt, je angefangene 5 Minuten nach tatsächlichem Aufwand lt. Leistungsnachweis zum Monatsende entweder:</p>
    <p>I) direkt über Ihre Kranken- bzw. Pflegekasse, wenn Sie gesetzlich versichert sind. Dazu muss uns vor Auftragsbeginn die Abtretungserklärung vollständig ausgefüllt und unterschrieben vorliegen.</p>
    <p class="muted">oder</p>
    <p>II) über Sie direkt, wenn Sie privatversichert bzw. beihilfeberechtigt sind. Dazu erhalten Sie von uns eine Rechnung, die von Ihnen bei Ihrer privaten Kranken- bzw. Pflegekasse eingereicht wird.</p>
    <p>Es gelten unsere Allgemeinen Geschäftsbedingungen sowie unsere Datenschutzerklärung, diese finden Sie im Anhang und jederzeit unter: https://agb.emczwei.de bzw. https://datenschutz.emczwei.de. Mit Ihrer Unterschrift stimmen Sie diesen zu.</p>

    <h2>Vollmacht / Abweichender Ansprechpartner (optionale Angabe)</h2>
    <p class="muted">Wurde der Auftrag in Vollmacht für den Auftraggeber bestätigt oder erfolgt im Zuge der Auftragsumsetzung die Kommunikation auch mit einem/r vom Auftraggeber Bevollmächtigten, bitten wir um Angabe der Kontaktdaten:</p>
    ${bevollmaechtigterBox(doc, mode)}
    <p class="muted">Hiermit bestätige ich, dass ich in Vollmacht für den Auftraggeber agiere und entsprechend befugt bin:</p>
    ${bevSignatureHtml}

    <h2>Rechnungsversand (optionale Angabe)</h2>
    ${rechnungsversandBox(doc, f, mode)}
    <p class="muted" style="font-size:10.5pt;"><sup>1)</sup> Für unseren Mehraufwand, wenn wir Ihnen die Kopie der Kassenrechnung per Post oder E-Mail zusenden, müssen wir je Rechnungsversand eine Gebühr von 3,00&nbsp;€ inkl. MwSt. berechnen.</p>

    <p>Hiermit bestätige ich, <strong>${esc(custName)}</strong>, dass ich das Dokument zur Kenntnis genommen habe:</p>`;

  if (mode === "pdf") {
    return wrap(
      "Wichtige Hinweise zum Angebot / zu Terminen",
      body + signatureBlock(doc, f, { heading: "Datum, Unterschrift" }),
    );
  }
  return displayFragment(
    body +
      interactiveSignatureBlock({
        heading: "Datum, Unterschrift",
        hint: "Bitte unterschreiben Sie hier, um zu bestätigen, dass Sie das Dokument zur Kenntnis genommen haben.",
      }) +
      submitBar("Unterschreiben & absenden"),
  );
}

export function buildAbtretungAhHtml(sr, doc, mode = "pdf") {
  const f = resolveFields(sr, doc);
  const editBtn = mode === "pdf" ? "" : " " + editButton();
  const body = `
    ${docHeader()}
    <h1>Abtretungserklärung für zusätzliche Betreuungsleistungen § 45b SGB XI</h1>
    <div class="editsec">
      <h2>Kontaktdaten Auftraggeber${editBtn}</h2>
      <div class="box">
        ${fld("Nachname:", "lastName", f.lastName, mode)}
        ${fld("Vorname:", "firstName", f.firstName, mode)}
        ${fld("Geburtstag:", "geburtsdatum", f.geburtsdatum, mode)}
        ${fld("Vers.-Nr.:", "kk_versichertennr", f.kk_versichertennr, mode)}
        ${fld("Straße:", "street", f.street, mode)}
        ${fld("PLZ:", "postalCode", f.postalCode, mode)}
        ${fld("Ort:", "city", f.city, mode)}
        ${fld("Telefon:", "phone", f.phone, mode)}
        ${fld("E-Mail:", "email", f.email, mode)}
        ${pflegegradField(f.pflegegrad, mode)}
        ${fld("Pflegegrad seit:", "kk_pflegegradSeit", f.kk_pflegegradSeit, mode)}
      </div>
    </div>
    <div class="editsec">
      <h2>Kontaktdaten Pflegekasse${editBtn}</h2>
      <div class="box">
        ${fld("Name:", "kassenkundeName", f.kassenkundeName, mode)}
        ${fld("Adresse:", "kk_krankenkasseAdresse", f.kk_krankenkasseAdresse, mode)}
      </div>
    </div>
    <p class="muted">Hiermit erteile ich eine Abtretungserklärung und mein Einverständnis, dass der Anbieter
    EmC2 Soziale Dienste UG (haftungsbeschränkt), Waldstraße 5, 95032 Hof</p>
    <ul style="margin:8px 0 8px 22px;padding:0;">
      <li>die Leistungen nach § 45b SGB XI direkt mit der Pflegekasse abrechnen darf.</li>
      <li>mein aktuelles Entlastungsguthaben regelmäßig bei der Pflegekasse abfragen darf.</li>
    </ul>`;

  if (mode === "pdf")
    return wrap("Abtretungserklärung § 45b SGB XI", body + signatureBlock(doc, f));
  return displayFragment(body + interactiveSignatureBlock() + submitBar("Unterschreiben & absenden"));
}
