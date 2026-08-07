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
  .section-lbl{font-size:9pt; text-transform:uppercase; letter-spacing:.06em; color:#0a5462; font-weight:700; margin:20px 0 8px;}
  .pos-card{border:1px solid #dbe4e6; border-radius:4px; padding:10px 12px; margin-bottom:10px; background:#f4f8f9;}
  .pos-card .row1{display:flex; justify-content:space-between; align-items:baseline; gap:10px;}
  .pos-card .ptitle{font-weight:700; font-size:10.5pt;}
  .pos-card .pcalc{font-size:9.5pt; color:#5c6e76; text-align:right;}
  .pos-card .pcalc b{color:#1b2a30; font-size:10.5pt;}
  .note{font-size:9pt; color:#8b9ba1; font-style:italic; margin:4px 0 2px;}
  .foot{position:fixed; bottom:0; left:0; right:0; font-size:8pt; color:#8b9ba1; border-top:1px solid #dbe4e6; padding-top:6px;}
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

function footBlock() {
  return `<div class="foot">EmC2 Attila Landgrafe &middot; Waldstraße 5 &middot; 95032 Hof &middot; service@e-m-c-2.de</div>`;
}

function posBlock(prefix, data) {
  const no = data[`${prefix}_No`];
  const title = data[`${prefix}_Title`];
  if (!no && !title) return "";
  const lines = data[`${prefix}_CostLines`] || [];
  return `
    <div class="section-lbl">Position ${esc(no)} &mdash; ${esc(title)}</div>
    <div class="pos-card">
      <div class="row1">
        <div class="ptitle">${esc(no)} &middot; ${esc(title)}</div>
        <div class="pcalc">${esc(data[`${prefix}_Qty`])} ${esc(data[`${prefix}_Unit`])} &times; ${esc(data[`${prefix}_UnitPrice`])} = <b>${esc(data[`${prefix}_LineTotal`])}</b></div>
      </div>
    </div>
    <table>
      <thead><tr><th>Kostenart</th><th class="num">Menge</th><th>Einheit</th><th>Beschreibung</th><th class="num">EK/Einheit</th><th class="num">Gesamt</th></tr></thead>
      <tbody>
        ${lines
          .map(
            (l) => `<tr><td>${esc(l.Kostenart)}</td><td class="num">${esc(l.Menge)}</td><td>${esc(l.Einheit)}</td><td>${esc(l.Beschreibung)}</td><td class="num">${esc(l.EK_je_Einheit)}</td><td class="num">${esc(l.Gesamt)}</td></tr>`,
          )
          .join("")}
        <tr class="total"><td colspan="5">Summe Position ${esc(no)}</td><td class="num">${esc(data[`${prefix}_LineTotal`])}</td></tr>
      </tbody>
    </table>`;
}

function reisezeitKostenBlock(data) {
  const employees = data.Employees || [];
  return `
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
    <div class="note">${esc(data.ZeitenHinweisText)}</div>`;
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
      <tr><td>II. Material für Badumbau</td><td class="num">${esc(data.PosII_Label)}</td></tr>
      <tr><td>III. Optionale Produkte</td><td class="num">${esc(data.PosIII_Label)}</td></tr>
      <tr class="sub"><td>${esc(data.AufschlagLabel)}</td><td class="num">${esc(data.AufschlagValueLabel)}</td></tr>
      ${
        data.RabattValueLabel
          ? `<tr class="sub"><td>Rabatt</td><td class="num">${esc(data.RabattValueLabel)}</td></tr>`
          : ""
      }
      <tr class="sub"><td>Zwischensumme</td><td class="num">${esc(data.ZwischensummeLabel)}</td></tr>
      <tr class="sub"><td>Bonus / Gratis</td><td class="num">${esc(data.BonusGesamtLabel)}</td></tr>
      <tr class="total"><td>Nettobetrag</td><td class="num">${esc(data.NettobetragLabel)}</td></tr>
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
  ${footBlock()}
</div>

<div class="page">
  ${headerBlock(data)}
  ${posBlock("Pos001", data)}
  ${reisezeitKostenBlock(data)}
  ${footBlock()}
</div>

<div class="page">
  ${headerBlock(data)}
  ${posBlock("Pos002", data)}
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
  ${footBlock()}
</div>

</body></html>`;
}
