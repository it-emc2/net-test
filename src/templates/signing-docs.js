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
`;

// Effective contact fields: prefill overlaid with any customer corrections.
function effectivePrefill(sr, doc) {
  return Object.assign({}, sr.prefill || {}, doc?.editedFields || {});
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
`;

// Scoped document CSS for Vollmacht/Abtretung display fragments.
const DOC_CSS = `
.signdoc { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12pt; line-height:1.5; }
.signdoc h1 { font-size:18pt; margin:0 0 6px; }
.signdoc h2 { font-size:13pt; margin:18px 0 8px; background:#ddd; border:1px solid #000; padding:5px 8px; }
.signdoc .muted { color:#333; }
.signdoc .row { margin:4px 0; }
.signdoc .label { color:#333; font-size:10pt; }
.signdoc .box { border:1px solid #000; padding:12px 14px; margin:10px 0; }
.signdoc .opt { margin:6px 0; }
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
.ang { font-family: Arial, Helvetica, sans-serif; color:#111; font-size:12pt; line-height:1.5; }
.ang h1 { font-size:20pt; margin:0; }
.ang h2 { font-size:13pt; margin:18px 0 8px; background:#ddd; border:1px solid #000; padding:5px 8px; }
.ang .head { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom:2px solid #000; padding-bottom:10px; }
.ang .head img { height:60px; }
.ang .meta { text-align:right; font-size:10.5pt; color:#333; }
.ang .cust { margin:16px 0; }
.ang .muted { color:#333; }
.ang ul { margin:6px 0 0 0; padding:0 0 0 18px; }
.ang ul li { margin:2px 0; }
.ang .lines { list-style:none; padding:0; margin:6px 0; }
.ang .lines li { margin:2px 0; }
.ang table { width:100%; border-collapse:collapse; margin:8px 0; font-size:11pt; }
.ang th, .ang td { text-align:left; padding:6px 8px; border:1px solid #000; }
.ang th { background:#ddd; }
.ang td.num, .ang th.num { text-align:right; white-space:nowrap; }
.ang .totals { width:auto; margin-left:auto; min-width:280px; }
.ang .totals td { border:0; padding:4px 8px; }
.ang .totals tr.alt td { font-weight:bold; border-top:1px solid #000; }
.ang .pay .opt { margin:5px 0; }
.ang .sig-img { max-width:300px; max-height:130px; display:block; margin:6px 0; }
.ang .sig-line { border-top:1px solid #000; width:300px; margin-top:4px; padding-top:4px; font-size:10pt; color:#333; }
.ang .audit { margin-top:22px; font-size:8.5pt; color:#555; border-top:1px solid #000; padding-top:8px; }
`;

function linesList(arr, key) {
  const items = (arr || [])
    .map((r) => String(r?.[key] ?? "").trim())
    .filter(Boolean)
    .map((t) => `<li>${esc(t)}</li>`)
    .join("");
  return items ? `<ul class="lines">${items}</ul>` : "";
}

/**
 * @param {object} data  result of getOfferRenderData().data (mapData output)
 * @param {object} opts  { mode: 'display'|'pdf', sr, doc }
 * The offer body is read-only. In 'pdf' mode the chosen payment term (already
 * ticked in data.SelfPayLines) and the signature block are included.
 */
export function buildAngebotHtml(data, opts = {}) {
  const mode = opts.mode || "display";
  const d = data || {};

  const items = Array.isArray(d.Items) ? d.Items : [];
  const itemsTable = items.length
    ? `<table>
        <thead><tr><th>Produkt</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">Zwischensumme</th></tr></thead>
        <tbody>${items
          .map(
            (it) =>
              `<tr><td>${esc(it.ProduktId || "")}</td><td class="num">${esc(it.Menge ?? "")}</td><td class="num">${esc(it.Einzelpreis || "")}</td><td class="num">${esc(it.Zwischensumme || "")}</td></tr>`,
          )
          .join("")}</tbody>
       </table>
       <div class="muted" style="text-align:right;">Produkte Zwischensumme: <strong>${esc(d.ProdukteZwischensumme || "")}</strong></div>`
    : "";

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

  const inner = `
    <div class="ang">
      <style>${ANGEBOT_CSS}${mode === "pdf" ? "" : INTERACTIVE_CSS}</style>
      <div class="head">
        <div>
          ${logoDataUri() ? `<img src="${logoDataUri()}" alt="EmC2">` : '<h1>EmC2</h1>'}
        </div>
        <div class="meta">
          <div><strong>Angebot</strong></div>
          <div>Nr.: ${esc(d.Angebotsnummer || "")}</div>
          <div>Datum: ${esc(d.Datum || "")}</div>
          ${d.ValidityDate ? `<div>Gültig bis: ${esc(d.ValidityDate)}</div>` : ""}
        </div>
      </div>

      <div class="cust">
        <div>${esc([d.Anrede, d.Vorname, d.Nachname].filter(Boolean).join(" "))}</div>
        <div>${esc(d.Adresse || "")}</div>
        <div>${esc([d.PLZ, d.Stadt].filter(Boolean).join(" "))}</div>
      </div>

      ${d.Greeting ? `<p>${esc(d.Greeting)},</p>` : ""}

      <h2>${esc(d.ServicePosTitle || "Auszuführende Arbeiten")}</h2>
      ${linesList(d.PrimaryServiceLines, "ServiceLine")}

      ${
        (d.IncludedServiceLines || []).length
          ? `<h2>Im Preis enthaltene Leistungen</h2>${linesList(d.IncludedServiceLines, "ServiceLine")}`
          : ""
      }

      ${itemsTable ? `<h2>Produkte</h2>${itemsTable}` : ""}

      ${
        (d.MaterialsLines || []).length
          ? `<h2>${esc(d.MaterialsPosTitle || "Material")}</h2>${linesList(d.MaterialsLines, "MaterialLine")}`
          : ""
      }

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
  const p = effectivePrefill(sr, doc);
  const k = sr.payloadSnapshot?.Kundendaten || {};
  const entlastung = !!doc.extraFields?.entlastungsguthaben;

  const guthaben =
    mode === "pdf"
      ? `<div class="box">
           <div class="opt">${entlastung ? "☒" : "☐"} aktuelles Entlastungsguthaben</div>
           <div class="opt">☒ Budget für Wohnumfeldverbessernde Maßnahmen</div>
         </div>`
      : `<div class="box">
           <label class="opt-label"><input type="checkbox" id="entlastungCheckbox"><span>aktuelles Entlastungsguthaben (§45b SGB XI)</span></label>
           <div class="opt">☒ Budget für Wohnumfeldverbessernde Maßnahmen (wird immer abgefragt)</div>
         </div>`;

  const body = `
    <h1>Vollmacht für die Krankenkasse</h1>
    <p class="muted">Vollmacht zur Beantragung des Zuschusses nach §40 Abs. 3,4,5 SGB XI
    und Abfrage des Entlastungsbudgets nach §45b SGB XI.</p>
    <div class="box">
      <div class="row"><span class="label">Bevollmächtigter:</span> EmC2 Attila Landgrafe / EmC2 Soziale Dienste UG (haftungsbeschränkt), Waldstraße 5, 95032 Hof</div>
    </div>
    <h2>Vollmachtgeber/in</h2>
    <div class="box">
      <div class="row"><span class="label">Name, Vorname:</span> ${esc(`${p.lastName || ""}, ${p.firstName || ""}`)}</div>
      <div class="row"><span class="label">Adresse:</span> ${esc(`${p.street || ""}, ${p.postalCode || ""} ${p.city || ""}`)}</div>
      <div class="row"><span class="label">Telefon:</span> ${esc(p.phone || "")} &nbsp; <span class="label">Geburtsdatum:</span> ${esc(p.geburtsdatum || "")}</div>
      <div class="row"><span class="label">Krankenkasse:</span> ${esc(k.kassenkundeName || "")} &nbsp; <span class="label">KVNR:</span> ${esc(k.kk_versichertennr || "")}</div>
    </div>
    <h2>Abzufragende Guthaben</h2>
    ${guthaben}
    <p class="muted">Diese Vollmacht gilt bis auf Widerruf oder bis das Vertragsverhältnis
    aufgehoben wird und kann jederzeit schriftlich widerrufen werden.</p>`;

  if (mode === "pdf") return wrap("Vollmacht für die Krankenkasse", body + signatureBlock(doc, p));
  return displayFragment(body + interactiveSignatureBlock() + submitBar("Unterschreiben & weiter"));
}

export function buildAbtretungHtml(sr, doc, mode = "pdf") {
  const p = effectivePrefill(sr, doc);
  const k = sr.payloadSnapshot?.Kundendaten || {};
  const pflegegrad = String(k.pflegegrad || "");
  const grades = ["1", "2", "3", "4", "5"]
    .map((g) => `${g === pflegegrad ? "☒" : "☐"} ${g}`)
    .join(" &nbsp; ");
  const body = `
    <h1>Abtretungserklärung für wohnumfeldverbessernde Maßnahmen (§40 SGB XI)</h1>
    <h2>Kontaktdaten Auftraggeber</h2>
    <div class="box">
      <div class="row"><span class="label">Name:</span> ${esc(`${p.lastName || ""}, ${p.firstName || ""}`)}</div>
      <div class="row"><span class="label">Geburtstag:</span> ${esc(p.geburtsdatum || "")} &nbsp; <span class="label">Vers.-Nr.:</span> ${esc(k.kk_versichertennr || "")}</div>
      <div class="row"><span class="label">Adresse:</span> ${esc(`${p.street || ""}, ${p.postalCode || ""} ${p.city || ""}`)}</div>
      <div class="row"><span class="label">Telefon:</span> ${esc(p.phone || "")} &nbsp; <span class="label">E-Mail:</span> ${esc(p.email || "")}</div>
      <div class="row"><span class="label">Pflegegrad:</span> ${grades} &nbsp; <span class="label">seit:</span> ${esc(k.kk_pflegegradSeit || "")}</div>
    </div>
    <h2>Kontaktdaten Pflegekasse</h2>
    <div class="box">
      <div class="row"><span class="label">Name:</span> ${esc(k.kassenkundeName || "")}</div>
      <div class="row"><span class="label">Adresse:</span> ${esc(k.kk_krankenkasseAdresse || "")}</div>
    </div>
    <p class="muted">Hiermit erteile ich meine Abtretungserklärung und mein Einverständnis,
    dass der Anbieter EmC2 Attila Landgrafe, Waldstraße 5, 95032 Hof, die Leistungen nach
    §40 SGB XI direkt mit der Pflegekasse abrechnen darf.</p>`;

  if (mode === "pdf") return wrap("Abtretungserklärung", body + signatureBlock(doc, p));
  return displayFragment(body + interactiveSignatureBlock() + submitBar("Unterschreiben & absenden"));
}
