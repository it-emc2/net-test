// src/templates/kalkulation-v2.js
//
// HTML template for the "Kalkulation (neue Version)" PDF — rendered via
// Puppeteer (src/utils/htmlToPdf.js), same pipeline as the BU/AH online
// Angebot PDFs, instead of the DOCX+LibreOffice path Kalkulation.docx uses.
// Internal document only — not the customer-facing Angebot.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

function fmtCurrency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num);
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
  *{box-sizing:border-box;}
  body{margin:0; font-family:Arial,Helvetica,sans-serif; color:#1b2a30; font-size:10.5pt; line-height:1.5;}
  .head{display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;}
  .head img{height:38px; display:block;}
  .sender{font-size:9pt; color:#5c6e76; margin-top:4px;}
  .head-right{text-align:right; font-size:9.5pt; color:#5c6e76;}
  .head-right .co{font-weight:700; color:#1b2a30; font-size:11pt;}
  .addr-meta{display:flex; justify-content:space-between; gap:24px; margin-bottom:18px;}
  .meta .row{display:flex; gap:14px; justify-content:flex-end; font-size:10pt;}
  .meta .row span:first-child{color:#5c6e76; min-width:110px; text-align:right;}
  .meta .row span:last-child{font-weight:600;}
  h1.doctitle{font-size:15pt; margin:0 0 4px;}
  .subline{font-size:9.5pt; color:#5c6e76; margin-bottom:16px;}
  table{width:100%; border-collapse:collapse; margin-bottom:8px; page-break-inside:auto;}
  tr{page-break-inside:avoid;}
  th{text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:.04em; color:#5c6e76; font-weight:700; padding:5px 6px; border-bottom:1.5px solid #1b2a30;}
  th.num, td.num{text-align:right;}
  td{padding:6px 6px; border-bottom:1px solid #dbe4e6; vertical-align:top;}
  tr.total td{border-top:1.5px solid #1b2a30; border-bottom:none; font-weight:700; padding-top:8px;}
  tr.sub td{color:#5c6e76;}
  tr.sect td{font-weight:700; background:#f4f8f9;}
  .section-lbl{font-size:9pt; text-transform:uppercase; letter-spacing:.06em; color:#0a5462; font-weight:700; margin:20px 0 8px; break-after:avoid; page-break-after:avoid;}
  .pos-card{border:1px solid #dbe4e6; border-radius:4px; padding:10px 12px; margin-bottom:10px; background:#f4f8f9;}
  .pos-card .row1{display:flex; justify-content:space-between; align-items:baseline; gap:10px;}
  .pos-card .ptitle{font-weight:700; font-size:10.5pt;}
  .pos-card .pcalc{font-size:9.5pt; color:#5c6e76; text-align:right;}
  .pos-card .pcalc b{color:#1b2a30; font-size:10.5pt;}
  .note{font-size:9pt; color:#8b9ba1; font-style:italic; margin:4px 0 2px;}
  .page{page-break-after:always; padding-bottom:20px;}
  .page:last-child{page-break-after:auto;}
`;

function headerBlock(data) {
  return `
    <div class="head">
      <div>
        ${logoDataUri() ? `<img src="${logoDataUri()}" alt="EmC2">` : "<strong>EmC2</strong>"}
        <div class="sender">EmC2 Attila Landgrafe, Waldstraße 5, 95032 Hof</div>
      </div>
      <div class="head-right">
        <div class="co">Kalkulation &middot; Intern</div>
        <div>${esc(data.Dokumentennummer)}</div>
        <div>${esc(data.Datum)}</div>
      </div>
    </div>`;
}

// Rendered by Puppeteer in the bottom page margin (footerTemplate), so body
// content can never flow underneath it. A position:fixed footer inside the body
// overlapped the last table row on full pages. Footer templates don't inherit
// page CSS — styles must be inline, with an explicit font-size.
export const KALKULATION_V2_FOOTER = `<div style="width:calc(100% - 36mm); margin:0 18mm; font-family:Arial,Helvetica,sans-serif; font-size:8pt; color:#8b9ba1; border-top:1px solid #dbe4e6; padding-top:6px; -webkit-print-color-adjust:exact;">EmC2 Attila Landgrafe &middot; Waldstraße 5 &middot; 95032 Hof &middot; service@e-m-c-2.de</div>`;

function posBlock(prefix, data, { material = false } = {}) {
  const no = data[`${prefix}_No`];
  const title = data[`${prefix}_Title`];
  if (!no && !title) return "";
  const lines = data[`${prefix}_CostLines`] || [];
  // Sum the visible rows (not the separately-computed PosLineTotal) so the
  // printed "Summe Position" always matches what a person gets adding the
  // rows above it by hand.
  const rowSum = lines.reduce((a, l) => a + (Number(l._totalNum) || 0), 0);
  return `
    <div class="section-lbl">Position ${esc(no)} &mdash; ${esc(title)}</div>
    <div class="pos-card">
      <div class="row1">
        <div class="ptitle">${esc(no)} &middot; ${esc(title)}</div>
        <div class="pcalc">${material ? `inkl. Aufschlag = <b>${esc(data.MatVkLabel)}</b>` : `${esc(data[`${prefix}_Qty`])} ${esc(data[`${prefix}_Unit`])} &times; ${esc(data[`${prefix}_UnitPrice`])} = <b>${esc(data[`${prefix}_LineTotal`])}</b>`}</div>
      </div>
    </div>
    <table>
      <thead><tr><th>Kostenart</th><th class="num">Menge</th><th>Einheit</th><th>Beschreibung</th><th class="num">${material ? "EK netto/Einheit" : "EK/Einheit"}</th><th class="num">${material ? "Gesamt EK netto" : "Gesamt"}</th></tr></thead>
      <tbody>
        ${lines
          .map(
            (l) => `<tr><td>${esc(l.Kostenart)}</td><td class="num">${esc(l.Menge)}</td><td>${esc(l.Einheit)}</td><td>${esc(l.Beschreibung)}</td><td class="num">${esc(l.EK_je_Einheit)}</td><td class="num">${esc(l.Gesamt)}</td></tr>`,
          )
          .join("")}
        <tr class="total"><td colspan="5">${material ? `Summe Material &ndash; EK netto` : `Summe Position ${esc(no)}`}</td><td class="num">${esc(fmtCurrency(rowSum))}</td></tr>
      </tbody>
    </table>
    ${
      material && data.MatVkLabel
        ? `<div class="note">Alle Materialpreise in der Tabelle sind EK-Preise netto.</div>
    <div class="section-lbl">Berechnung Aufschlag</div>
    <table style="page-break-inside:avoid;">
      <tbody>
        <tr><td>EK netto (Basis f&uuml;r den Aufschlag)</td><td class="num">${esc(data.MatBaseLabel)}</td></tr>
        <tr><td>&times; Aufschlag ${esc(data.MatPctLabel)}</td><td class="num">+ ${esc(data.MatAufschlagLabel)}</td></tr>
        ${data.MatNoMarkupLabel ? `<tr class="sub"><td>Artikel ohne Aufschlag (EK = VK)</td><td class="num">+ ${esc(data.MatNoMarkupLabel)}</td></tr>` : ""}
        <tr class="total"><td>= Material &ndash; VK netto (Position II)</td><td class="num">${esc(data.MatVkLabel)}</td></tr>
      </tbody>
    </table>`
        : ""
    }`;
}

// Selbstzahler only: Arbeitskostenanteil (Lohn) for the tax return, built from
// the same numbers already shown elsewhere in this document.
function selbstzahlerBlock(data) {
  if (!data.IsSZ) return "";
  const emps = data.Employees || [];
  return `
  <div style="page-break-before:always; break-before:page;"></div>
  <div class="section-lbl" style="margin-top:0;">Selbstzahler &mdash; Arbeitskostenanteil</div>
  <table>
    <thead><tr><th>Handwerker</th><th class="num">Vor Ort</th><th class="num">Anfahrt</th><th class="num">Lohn vor Ort</th><th class="num">Lohn Anfahrt</th><th class="num">Summe Lohn</th></tr></thead>
    <tbody>
      ${emps.map((e) => `<tr><td>${esc(e.Label)}</td><td class="num">${esc(e.OnSiteHoursLabel)}</td><td class="num">${esc(e.TravelHoursLabel)}</td><td class="num">${esc(e.OnSiteCostLabel)}</td><td class="num">${esc(e.TravelCostLabel)}</td><td class="num">${esc(e.TotalCostLabel)}</td></tr>`).join("")}
      <tr class="total"><td>Gesamt</td><td class="num">${esc(data.ArbeitszeitGesamtLabel)}</td><td class="num">${esc(data.ReisezeitGesamtLabel)}</td><td class="num">${esc(data.SzLohnVorOrtLabel)}</td><td class="num">${esc(data.SzLohnAnfahrtLabel)}</td><td class="num">${esc(data.SzLohnLabel)}</td></tr>
    </tbody>
  </table>
  <div class="section-lbl">Aufteilung des Angebots (netto)</div>
  <table style="page-break-inside:avoid;">
    <tbody>
      <tr class="sect"><td>Arbeitskostenanteil (Lohn)</td><td class="num">${esc(data.SzLohnLabel)}</td></tr>
      <tr><td>Fahrzeug, Maschinen, Ber&auml;umung, Kilometer (Nebenleistungen)</td><td class="num">${esc(data.SzNebenLabel)}</td></tr>
      <tr><td>Material (inkl. Aufschlag)</td><td class="num">${esc(data.MatVkLabel)}</td></tr>
      <tr class="sub"><td>Bonus / Gratis</td><td class="num">${esc(data.BonusGesamtLabel)}</td></tr>
      <tr class="total"><td>Nettobetrag</td><td class="num">${esc(data.NettobetragLabel)}</td></tr>
    </tbody>
  </table>
  <div class="note">Arbeitskostenanteil brutto (${esc(data.SzTaxLabel)} MwSt.): ${esc(data.SzLohnBruttoLabel)}. Lohn + Nebenleistungen = Position I.</div>`;
}

function reisezeitKostenBlock(data) {
  const employees = data.Employees || [];
  return `
    <div style="page-break-inside:avoid;">
    <div class="section-lbl">Reisezeit Kosten &mdash; ${esc(data.OfferBadge)}</div>
    <table style="page-break-inside:avoid;">
      <tbody>
        <tr class="sect"><td colspan="2">Zeiten</td></tr>
        <tr><td>Arbeitszeit</td><td class="num">${esc(data.ArbeitszeitDezimalLabel)}</td></tr>
        <tr><td>Reisezeit gesamt</td><td class="num">${esc(data.ReisezeitDezimalLabel)}</td></tr>
        <tr class="sect"><td colspan="2">Stundensätze</td></tr>
        <tr><td>Voller Satz / Fahrer</td><td class="num">${esc(data.VollerSatzLabel)}</td></tr>
        ${
          data.OfferBadge === "BU"
            ? `<tr><td>2. Mitarbeiter Reisezeit</td><td class="num">${esc(data.ZweiterMitarbeiterSatzLabel)}</td></tr>`
            : ""
        }
        ${employees
          .map(
            (e) => `
        <tr class="sect"><td colspan="2">${esc(e.Label)}</td></tr>
        <tr><td>Arbeitszeit</td><td class="num">${esc(e.OnSiteCostLabel)}</td></tr>
        <tr><td>Reisezeit</td><td class="num">${esc(e.TravelCostLabel)}</td></tr>
        <tr><td>Zwischensumme</td><td class="num"><b>${esc(e.TotalCostLabel)}</b></td></tr>`,
          )
          .join("")}
        <tr class="total"><td>Gesamtkosten aus Zeiten</td><td class="num">${esc(data.GesamtkostenAusZeitenLabel)}</td></tr>
      </tbody>
    </table>
    <div class="note">${esc(data.ZeitenHinweisText)}</div>
    </div>`;
}

export function buildKalkulationV2Html(data) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body>

<div class="page">
  ${headerBlock(data)}
  <div class="addr-meta">
    <div>
      ${data.Anrede ? `<div>${esc(data.Anrede)}</div>` : ""}
      <div style="font-weight:600;">${esc([data.Vorname, data.Nachname].filter(Boolean).join(" "))}</div>
      <div>${esc(data.Adresse)}</div>
      <div>${esc([data.PLZ, data.Stadt].filter(Boolean).join(" "))}</div>
    </div>
    <div class="meta">
      <div class="row"><span>Deal ID</span><span>${esc(data.DealId || "")}</span></div>
      <div class="row"><span>Angebotsnummer</span><span>${esc(data.Angebotsnummer)}</span></div>
    </div>
  </div>

  <h1 class="doctitle">Kalkulation zu ${esc(data.Angebotsnummer)}</h1>
  <div class="subline">${esc(data.OfferBadge)}</div>

  <div class="section-lbl">Kalkulationsübersicht</div>
  <table>
    <thead><tr><th>Position</th><th class="num">Summe</th></tr></thead>
    <tbody>
      <tr><td>I. Auszuführende Arbeiten</td><td class="num">${esc(data.PosI_Label)}</td></tr>
      <tr><td>II. Material für Badumbau <span style="color:#5c6e76">(inkl. Aufschlag)</span></td><td class="num">${esc(data.PosII_Label)}</td></tr>
      ${data.PosIII_Label && data.PosIII_Label !== data.ZeroLabel ? `<tr><td>III. Optionale Produkte</td><td class="num">${esc(data.PosIII_Label)}</td></tr>` : ""}
      ${
        data.AufschlagBegruendung
          ? `<tr class="sub"><td colspan="2" style="white-space:pre-wrap;">Begründung (Aufschlag unter Mindestwert): ${esc(data.AufschlagBegruendung)}</td></tr>`
          : ""
      }
      ${
        data.RabattValueLabel
          ? `<tr class="sub"><td>Rabatt</td><td class="num">${esc(data.RabattValueLabel)}</td></tr>`
          : ""
      }
      <tr class="sub"><td>Zwischensumme (VK netto)</td><td class="num">${esc(data.ZwischensummeLabel)}</td></tr>
      <tr class="sub"><td>Bonus / Gratis</td><td class="num">${esc(data.BonusGesamtLabel)}</td></tr>
      <tr class="total"><td>Nettobetrag (VK netto)</td><td class="num">${esc(data.NettobetragLabel)}</td></tr>
      <tr><td>zzgl. 19% MwSt.</td><td class="num">${esc(data.UstValue)}</td></tr>
      <tr class="total"><td>Gesamt (brutto)</td><td class="num">${esc(data.BruttoValue)}</td></tr>
    </tbody>
  </table>

  <div class="section-lbl">Zeiterfassung</div>
  <table>
    <thead><tr><th>Mitarbeiter</th><th class="num">Vor Ort</th><th class="num">Anfahrt</th><th class="num">Gesamt</th></tr></thead>
    <tbody>
      <tr><td>je Mitarbeiter (${esc(data.MitarbeiterCount)}&times;)</td><td class="num">${esc(data.Employee1_OnSiteHoursLabel)}</td><td class="num">${esc(data.Employee1_TravelHoursLabel)}</td><td class="num">${esc(data.Employee1_TotalHoursLabel)}</td></tr>
      <tr class="total"><td>Summe, ${esc(data.MitarbeiterCount)} Mitarbeiter</td><td class="num">${esc(data.ArbeitszeitGesamtLabel)}</td><td class="num">${esc(data.ReisezeitGesamtLabel)}</td><td class="num">${esc(data.GesamtzeitLabel)}</td></tr>
    </tbody>
  </table>
</div>

<div class="page">
  ${headerBlock(data)}
  ${posBlock("Pos001", data)}
  ${selbstzahlerBlock(data)}
  ${reisezeitKostenBlock(data)}
</div>

<div class="page">
  ${headerBlock(data)}
  ${posBlock("Pos002", data, { material: true })}
  ${
    data.HasBonus300 || data.HasBonusGrab
      ? `<div class="section-lbl">Boni &amp; Aktionen</div>
    <table>
      <thead><tr><th>Pos.</th><th>Bezeichnung</th><th class="num">Gesamt</th></tr></thead>
      <tbody>
        ${data.HasBonusGrab ? `<tr><td>${esc(data.Pos003_No)}</td><td>${esc(data.Pos003_Title)}</td><td class="num">${esc(data.Pos003_LineTotal)}</td></tr>` : ""}
        ${data.HasBonus300 ? `<tr><td>${esc(data.Pos004_No || data.Pos003_No)}</td><td>${esc(data.Pos004_Title || data.Pos003_Title)}</td><td class="num">${esc(data.Pos004_LineTotal || data.Pos003_LineTotal)}</td></tr>` : ""}
      </tbody>
    </table>`
      : ""
  }
</div>

</body></html>`;
}
