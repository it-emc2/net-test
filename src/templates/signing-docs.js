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
// edit button); pdf mode = plain text.
function fld(label, key, value, mode) {
  if (mode === "pdf") {
    return `<div class="row"><span class="label">${label}</span><span>${esc(value)}</span></div>`;
  }
  return `<div class="fld"><span class="fld-label">${label}</span><input type="text" data-edit-field="${key}" value="${esc(value)}" disabled></div>`;
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

function signatureBlock(doc, prefill) {
  const name = `${doc.editedFields?.firstName || prefill?.firstName || ""} ${
    doc.editedFields?.lastName || prefill?.lastName || ""
  }`.trim();
  const signedAt = doc.signedAt ? new Date(doc.signedAt) : new Date();
  const img = doc.signatureImage
    ? `<img class="sig-img" src="${doc.signatureImage}" alt="Unterschrift">`
    : "";
  return `
    <h2>Unterschrift</h2>
    <div class="row">${esc(doc.place || prefill?.city || "")}, ${signedAt.toLocaleDateString("de-DE")}</div>
    ${img}
    <div class="sig-line">${esc(name)}</div>
    <div class="audit">
      Elektronisch signiert am ${signedAt.toLocaleString("de-DE")} ·
      IP: ${esc(doc.signedIp || "-")} ·
      über den Online-Signatur-Link der EmC2 Attila Landgrafe.
    </div>`;
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

// Interactive signature area (canvas + clear + type-name fallback).
function interactiveSignatureBlock() {
  return `
    <h2>Ihre Unterschrift</h2>
    <p class="muted">Bitte unterschreiben Sie mit dem Finger oder der Maus im Feld.</p>
    <canvas id="sigCanvas"></canvas>
    <div class="si-btnrow">
      <button type="button" id="clearSig">Löschen</button>
      <button type="button" class="si-linkbtn" id="toggleType">Namen tippen statt zeichnen</button>
    </div>
    <div class="hidden" id="typeWrap">
      <div class="label">Ihr vollständiger Name</div>
      <input type="text" id="typeName" placeholder="Vor- und Nachname">
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
.ang .pos-lines li { margin:2px 0; }
.ang .matsub { font-weight:bold; margin:12px 0 4px; }
.ang .matline { margin:2px 0; padding-left:2px; }
.ang .totals { width:auto; margin-left:auto; min-width:300px; border-collapse:collapse; }
.ang .totals td { padding:5px 8px; }
.ang .totals td.num { text-align:right; white-space:nowrap; }
.ang .totals tr.alt td { font-weight:bold; border-top:1px solid #000; }
.ang .pay .opt { margin:5px 0; }
.ang .sig-img { max-width:300px; max-height:130px; display:block; margin:6px 0; }
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

// Position bullet list (service lines) shown inside the Bezeichnung cell.
function posLines(arr, key) {
  const items = (arr || [])
    .map((r) => String(r?.[key] ?? "").trim())
    .filter(Boolean)
    .map((t) => `<li>${esc(t.replace(/^-\s*/, ""))}</li>`)
    .join("");
  return items ? `<ul class="pos-lines">${items}</ul>` : "";
}

// Material block: bold ALL-CAPS subcategory headers, plain item lines, and the
// merged product items (as their own PRODUKTE subcategory).
function materialBlock(d) {
  const out = [];
  for (const row of d.MaterialsLines || []) {
    const line = String(row?.MaterialLine ?? "").trim();
    if (!line) continue;
    if (!line.startsWith("-")) out.push(`<div class="matsub">${esc(line)}</div>`);
    else out.push(`<div class="matline">${esc(line)}</div>`);
  }
  const items = Array.isArray(d.Items) ? d.Items : [];
  if (items.length) {
    out.push('<div class="matsub">PRODUKTE</div>');
    for (const it of items) {
      out.push(
        `<div class="matline">- ${esc(it.Menge ?? "")} Stk ${esc(it.ProduktId || "")}</div>`,
      );
    }
  }
  return out.join("");
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
  let paySig = "";
  if (mode === "pdf") {
    const payLines = Array.isArray(d.SelfPayLines) ? d.SelfPayLines : [];
    const pay = payLines.length
      ? `<h2>Zahlungsbedingungen</h2><div class="pay">${payLines
          .map(
            (l) =>
              `<div class="opt${l.IsTitle ? " muted" : ""}">${esc(l.Text || "")}</div>`,
          )
          .join("")}</div>`
      : "";
    const p = effectivePrefill(opts.sr || {}, opts.doc || {});
    paySig = pay + signatureBlock(opts.doc || {}, p);
  } else {
    paySig =
      interactivePaymentBlock(d) +
      interactiveSignatureBlock() +
      submitBar("Unterschreiben & weiter");
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
      <p>${esc(d.Greeting || "Sehr geehrte Damen und Herren")},</p>
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
            (d.MaterialsLines || []).length || (d.Items || []).length
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
        </tbody>
      </table>

      <h2>Zusammenstellung</h2>
      ${totalsTable}

      ${paySig}
    </div>`;

  return mode === "pdf" ? wrap("Angebot", inner) : inner;
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
