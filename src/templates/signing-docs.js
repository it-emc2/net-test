// src/templates/signing-docs.js
//
// HTML builders for the online-signing documents. Each returns a full HTML
// document string that src/utils/htmlToPdf.js renders to a final PDF.
//
// Phase 1 uses buildSignatureSheetHtml (appended to the Angebot PDF).
// buildVollmachtHtml / buildAbtretungHtml are ready for Phase 2 (Kassenkunde).

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
  body { font-family: Arial, Helvetica, sans-serif; color: #1a2327; font-size: 12pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4px; }
  h2 { font-size: 14pt; margin: 22px 0 8px; }
  .muted { color: #667; }
  .row { margin: 4px 0; }
  .label { color: #667; font-size: 10pt; }
  .box { border: 1px solid #cfd6da; border-radius: 6px; padding: 12px 14px; margin: 10px 0; }
  .opt { margin: 6px 0; font-size: 12pt; }
  .sig-img { max-width: 320px; max-height: 140px; display: block; margin: 6px 0; }
  .sig-line { border-top: 1px solid #333; width: 320px; margin-top: 4px; padding-top: 4px; font-size: 10pt; color: #667; }
  .audit { margin-top: 26px; font-size: 8.5pt; color: #889; border-top: 1px solid #e2e7ea; padding-top: 8px; }
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

// Appended to the Angebot PDF: carries the chosen payment terms + signature.
export function buildSignatureSheetHtml(sr, doc) {
  const p = effectivePrefill(sr, doc);
  const OPTIONS = paymentOptionsFor(sr.customerType);
  const idx = Number(doc.extraFields?.paymentTermIdx);
  const chosen =
    Number.isFinite(idx) && OPTIONS[idx] ? OPTIONS[idx] : null;

  const opts = OPTIONS.map(
    (t, i) => `<div class="opt">${i === idx ? "☒" : "☐"} ${esc(t)}</div>`,
  ).join("");

  const inner = `
    <h1>Angebot – Bestätigung & Unterschrift</h1>
    <div class="row muted">Angebotsnummer: <strong>${esc(sr.offerNumber || "-")}</strong></div>
    <div class="row muted">Kunde: ${esc(`${p.firstName || ""} ${p.lastName || ""}`.trim())}</div>

    <h2>Gewählte Zahlungsbedingungen</h2>
    <div class="box">${opts}</div>
    ${chosen ? "" : '<div class="muted">Es wurde keine Zahlungsbedingung ausgewählt.</div>'}

    <p class="muted">Mit meiner Unterschrift bestätige ich das vorstehende Angebot
    und die gewählten Zahlungsbedingungen.</p>

    ${signatureBlock(doc, p)}
  `;
  return wrap("Angebot – Unterschrift", inner);
}

// ---- Phase 2 (Kassenkunde) — ready to wire ----

export function buildVollmachtHtml(sr, doc) {
  const p = effectivePrefill(sr, doc);
  const k = sr.payloadSnapshot?.Kundendaten || {};
  const entlastung = !!doc.extraFields?.entlastungsguthaben;
  const inner = `
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
    <div class="box">
      <div class="opt">${entlastung ? "☒" : "☐"} aktuelles Entlastungsguthaben</div>
      <div class="opt">☒ Budget für Wohnumfeldverbessernde Maßnahmen</div>
    </div>
    <p class="muted">Diese Vollmacht gilt bis auf Widerruf oder bis das Vertragsverhältnis
    aufgehoben wird und kann jederzeit schriftlich widerrufen werden.</p>
    ${signatureBlock(doc, p)}
  `;
  return wrap("Vollmacht für die Krankenkasse", inner);
}

export function buildAbtretungHtml(sr, doc) {
  const p = effectivePrefill(sr, doc);
  const k = sr.payloadSnapshot?.Kundendaten || {};
  const pflegegrad = String(k.pflegegrad || "");
  const grades = ["1", "2", "3", "4", "5"]
    .map((g) => `${g === pflegegrad ? "☒" : "☐"} ${g}`)
    .join(" &nbsp; ");
  const inner = `
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
    §40 SGB XI direkt mit der Pflegekasse abrechnen darf.</p>
    ${signatureBlock(doc, p)}
  `;
  return wrap("Abtretungserklärung", inner);
}
