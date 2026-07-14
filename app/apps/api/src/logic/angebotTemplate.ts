// BU Angebot → HTML (paged for Puppeteer). The repeating logo header and the
// impressum + "Seite X / Y" footer are Puppeteer templates; the body holds the
// page-1 address window (DIN 5008 Form B) + the offer content.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

let logoDataUri = "";
function logo(): string {
  if (!logoDataUri) {
    const buf = readFileSync(join(__dirname, "..", "assets", "logo.png"));
    logoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return logoDataUri;
}

const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// ---- data contract (populated by buildAngebotData in a later step) ----
export interface AngebotMaterialLine {
  text: string;
  sub?: boolean; // category header
}
export interface AngebotBonusRow {
  pos: string;
  label: string;
  menge: string;
  einzel: string;
  gesamt: string;
}
export interface AngebotTotal {
  label: string;
  value: string;
  strong?: boolean;
}
export interface AngebotPaymentTerm {
  text: string;
  checked?: boolean;
}
export interface AngebotData {
  anrede: string;
  vorname: string;
  nachname: string;
  adresse: string;
  plz: string;
  stadt: string;
  angebotsnummer: string;
  datum: string;
  gueltigBis: string;
  ansprechpartner: string;
  kundennummer: string;
  greeting: string;
  serviceUnitPrice: string;
  serviceTotal: string;
  primaryServiceLines: string[];
  includedServiceLines: string[];
  materialsUnitPrice: string;
  materialsTotal: string;
  materialsLines: AngebotMaterialLine[];
  bonusRows: AngebotBonusRow[];
  totals: AngebotTotal[];
  ebenerdigHinweis: boolean;
  regieRate: string;
  hasSubsidy: boolean;
  subsidyText: string;
  paymentTitle: string;
  paymentTerms: AngebotPaymentTerm[];
  validityDate: string;
}

const NAVY = "#22356c";
const MUTED = "#5b6470";

// Repeating page header: the emc² logo (inline styles only; Puppeteer templates
// ignore the page's <style>). Sits in the reserved top margin on every page.
export function headerTemplate(): string {
  return `<div style="width:100%; -webkit-print-color-adjust:exact; padding:7mm 20mm 0; text-align:right;">
    <img src="${logo()}" style="height:18mm;" />
  </div>`;
}

// Repeating footer: impressum (centered, evenly spaced) + "Seite X / Y".
export function footerTemplate(): string {
  const col = `flex:1; text-align:center; white-space:normal;`;
  return `<div style="width:100%; font-size:7pt; color:${MUTED}; -webkit-print-color-adjust:exact; padding:0 20mm 5mm;">
    <div style="border-top:.4mm solid ${NAVY}; margin-bottom:1.4mm;"></div>
    <div style="display:flex; line-height:1.3;">
      <div style="${col}">emc² Attila Landgrafe<br/>Waldstraße 5<br/>95032 Hof<br/>Deutschland</div>
      <div style="${col}">Tel.: 09281 5915900<br/>Fax: 09281 5915909<br/>E-Mail: kontakt@e-m-c-2.de<br/>Web: emczwei.de</div>
      <div style="${col}">Hof/Saale<br/>Steuer-Nr.: 223/147/40118<br/>Geschäftsführer: Attila Landgrafe</div>
    </div>
    <div style="text-align:right; margin-top:1.2mm;">Seite <span class="pageNumber"></span> / <span class="totalPages"></span></div>
  </div>`;
}

function materialLi(l: AngebotMaterialLine): string {
  return l.sub
    ? `<li class="cat">${esc(l.text)}</li>`
    : `<li>${esc(l.text)}</li>`;
}

export function renderAngebotHtml(d: AngebotData): string {
  const primary = d.primaryServiceLines.map((t) => `<li>${esc(t)}</li>`).join("");
  const included = d.includedServiceLines.map((t) => `<li>${esc(t)}</li>`).join("");
  const includedBlock = included
    ? `<div class="included-h">Enthält je Einheit</div><ul class="lines included">${included}</ul>`
    : "";
  const mats = d.materialsLines.map(materialLi).join("");
  const bonus = d.bonusRows
    .map(
      (b) => `<tr>
        <td class="pos">${esc(b.pos)}</td><td>${esc(b.menge)}</td>
        <td>${esc(b.label)}</td>
        <td class="num">${esc(b.einzel)}</td><td class="num">${esc(b.gesamt)}</td></tr>`,
    )
    .join("");
  const totals = d.totals
    .map((t) => `<tr class="${t.strong ? "sum" : ""}"><td>${esc(t.label)}</td><td class="v">${esc(t.value)}</td></tr>`)
    .join("");
  const pay = d.paymentTerms
    .map((p) => `<div class="opt"><span class="box">${p.checked ? "☒" : "☐"}</span> ${esc(p.text)}</div>`)
    .join("");
  const subsidy = d.hasSubsidy ? ` ${esc(d.subsidyText)}` : "";
  const ebenerdig = d.ebenerdigHinweis
    ? `<p class="note warn">ACHTUNG: Ob eine ebenerdige Montage der Duschwanne möglich ist, kann erst nach dem Ausbau der bestehenden Wanne beurteilt werden. Sollten dabei zusätzliche Leistungen erforderlich oder von Ihnen gewünscht sein, können zusätzliche Kosten entstehen.</p>`
    : "";

  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><style>
    :root{ --ink:#1a1a1a; --muted:${MUTED}; --line:#c9d0da; --navy:${NAVY}; --navy-soft:#eef1f8; }
    *{ box-sizing:border-box; }
    html,body{ margin:0; padding:0; }
    body{ font-family:"Helvetica Neue",Arial,sans-serif; color:var(--ink); font-size:10.5pt; line-height:1.45; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

    /* page-1 DIN 5008 address window: top margin is 28mm, so 17mm pushes the
       Absender line to ~45mm from the physical page top (Form B). */
    .din{ margin-top:14mm; width:85mm; }
    .absender{ font-size:7pt; color:var(--muted); }
    .anschrift{ font-size:11pt; line-height:1.5; margin-top:4mm; }
    .anschrift .name{ font-weight:600; }

    .meta{ font-size:9.5pt; margin:16mm 0 6mm; }
    .meta div{ display:flex; gap:2mm; }
    .meta .k{ color:var(--muted); min-width:34mm; }
    .meta .v{ font-weight:600; }

    h1.subject{ font-size:12.5pt; margin:0 0 5mm; color:var(--navy); }
    .greeting{ margin:0 0 3mm; } .intro{ margin:0 0 6mm; }

    table.items{ width:100%; border-collapse:collapse; font-size:9.5pt; }
    table.items thead th{ background:var(--navy); color:#fff; font-weight:600; text-align:left; padding:2mm 2.5mm; font-size:8.5pt; }
    table.items thead th.num{ text-align:right; }
    table.items td{ padding:2mm 2.5mm; vertical-align:top; border-bottom:.2mm solid var(--line); }
    table.items td.num{ text-align:right; white-space:nowrap; }
    /* long service/material rows may break across pages; only keep each bullet whole */
    .lines li{ break-inside:avoid; }
    .pos{ font-weight:700; color:var(--muted); }
    .rowhead td{ background:#f6f8fb; } .rowhead .title{ font-weight:700; }
    .lines{ margin:1.5mm 0 0; padding:0; list-style:none; }
    .lines li{ position:relative; padding-left:4mm; margin:.6mm 0; }
    .lines li::before{ content:"–"; position:absolute; left:0; color:var(--navy); }
    .included-h{ font-weight:600; font-size:8.5pt; color:var(--muted); margin:2mm 0 .5mm; }
    .lines.included li{ color:var(--muted); }
    .cat{ font-weight:700; color:var(--navy); padding-top:2mm; }

    .totals{ margin:6mm 0 0 auto; width:80mm; font-size:10pt; }
    .totals table{ width:100%; border-collapse:collapse; }
    .totals td{ padding:1.4mm 0; } .totals td.v{ text-align:right; font-weight:600; white-space:nowrap; }
    .totals tr.sum td{ border-top:.4mm solid var(--ink); font-size:11.5pt; font-weight:700; padding-top:2mm; }

    .note{ font-size:9pt; color:#333; margin:6mm 0 0; }
    .note.warn{ background:var(--navy-soft); border-left:2.5mm solid var(--navy); padding:2.5mm 3mm; }
    .pay{ margin:6mm 0 0; font-size:9.5pt; } .pay h3{ font-size:10pt; margin:0 0 1.5mm; color:var(--navy); }
    .pay .opt{ margin:.8mm 0; } .pay .box{ font-family:monospace; }
    .sign{ margin:10mm 0 0; display:flex; gap:14mm; break-inside:avoid; } .sign .slot{ flex:1; }
    .sign .rule{ border-top:.3mm solid var(--ink); margin-top:14mm; padding-top:1mm; font-size:8pt; color:var(--muted); }
    .closing{ margin:8mm 0 0; font-size:9.5pt; }
  </style></head><body>
    <div class="din">
      <div class="absender">EmC² Soziale Dienste UG (haftungsbeschränkt) · Waldstraße 5 · 95032 Hof</div>
      <div class="anschrift">
        <div>${esc(d.anrede)}</div>
        <div class="name">${esc(d.vorname)} ${esc(d.nachname)}</div>
        <div>${esc(d.adresse)}</div>
        <div>${esc(d.plz)} ${esc(d.stadt)}</div>
      </div>
    </div>

    <div class="meta">
      <div><span class="k">Angebot-Nr.:</span><span class="v">${esc(d.angebotsnummer)}</span></div>
      <div><span class="k">Datum:</span><span class="v">${esc(d.datum)}</span></div>
      <div><span class="k">Gültig bis:</span><span class="v">${esc(d.gueltigBis)}</span></div>
      <div><span class="k">Ansprechpartner:</span><span class="v">${esc(d.ansprechpartner)}</span></div>
      <div><span class="k">Kundennummer:</span><span class="v">${esc(d.kundennummer)}</span></div>
    </div>

    <h1 class="subject">Ihr Angebot ${esc(d.angebotsnummer)}</h1>
    <p class="greeting">${esc(d.greeting)},</p>
    <p class="intro">vielen Dank für Ihre Anfrage und Ihr damit verbundenes Interesse. Wir freuen uns, Ihnen folgendes Angebot unterbreiten zu können.</p>

    <table class="items">
      <thead><tr>
        <th style="width:10mm">Pos.</th><th style="width:16mm">Menge</th><th>Bezeichnung</th>
        <th class="num" style="width:24mm">Einzelpreis</th><th class="num" style="width:24mm">Gesamt</th>
      </tr></thead>
      <tbody>
        <tr class="rowhead">
          <td class="pos">001</td><td>1 Stk</td>
          <td class="title">Auszuführende Arbeiten<ul class="lines">${primary}</ul>${includedBlock}</td>
          <td class="num">${esc(d.serviceUnitPrice)}</td><td class="num">${esc(d.serviceTotal)}</td>
        </tr>
        <tr class="rowhead">
          <td class="pos">002</td><td>1 Stk</td>
          <td class="title">Material für Badumbau<ul class="lines">${mats}</ul></td>
          <td class="num">${esc(d.materialsUnitPrice)}</td><td class="num">${esc(d.materialsTotal)}</td>
        </tr>
        ${bonus}
      </tbody>
    </table>

    <div class="totals"><table>${totals}</table></div>

    <p class="note">Es handelt sich hierbei um ein Festpreisangebot für die oben definierten Leistungen. Für eine Teilbeauftragung wäre ein neues Angebot erforderlich. Diese werden vorab mit Ihnen besprochen, bedürfen Ihrer Zustimmung und werden auf Regiebasis nach tatsächlichem Aufwand abgerechnet (Stundensatz-Facharbeiter: ${esc(d.regieRate)} netto).${subsidy}</p>
    ${ebenerdig}

    <div class="pay"><h3>${esc(d.paymentTitle)}</h3>${pay}</div>

    <p class="note">Bitte unterschreiben Sie bei Annahme an entsprechender Stelle und senden uns das Angebot wieder zurück – gerne auch per E-Mail an service@e-m-c-2.de. Die Unterschrift gilt für uns als Auftragsbestätigung.</p>

    <div class="sign">
      <div class="slot"><div class="rule">Ort, Datum</div></div>
      <div class="slot"><div class="rule">Unterschrift Auftraggeber</div></div>
    </div>

    <p class="closing">Für Rückfragen stehen wir Ihnen gerne zur Verfügung. Wir bedanken uns für Ihr Vertrauen und freuen uns, von Ihnen zu hören. Dieses Angebot ist gültig bis ${esc(d.validityDate)}.<br/><br/>Mit freundlichen Grüßen<br/>Ihr Team von EmC²</p>
  </body></html>`;
}

// Sample data with enough material lines to overflow to a 2nd page (for margin/
// pagination verification before the live buildAngebotData is wired).
export function sampleAngebotData(): AngebotData {
  const cats = ["Duschwanne", "Wandverkleidung", "Fußboden", "Zubehör"];
  const materialsLines: AngebotMaterialLine[] = [];
  for (const c of cats) {
    materialsLines.push({ text: c, sub: true });
    for (let i = 1; i <= 6; i++) materialsLines.push({ text: `${i} Stk Beispielartikel ${c} Position ${i} – Ausführung weiß` });
  }
  return {
    anrede: "Herr", vorname: "Max", nachname: "Mustermann",
    adresse: "Musterstraße 12", plz: "95032", stadt: "Hof",
    angebotsnummer: "ANG2026-0713-141038", datum: "14.07.2026", gueltigBis: "08.09.2026",
    ansprechpartner: "S. K.", kundennummer: "K-10427",
    greeting: "Sehr geehrter Herr Mustermann",
    serviceUnitPrice: "4.812,00 €", serviceTotal: "4.812,00 €",
    primaryServiceLines: [
      "Entfernen und Entsorgen der Badewanne inkl. Befliesung",
      "Einbau einer bodengleichen Duschwanne 120 × 90 cm",
      "Anbringen der Wandverkleidung im Duschbereich",
      "Verlegen des Vinyl-Bodenbelags inkl. Abdichtung",
      "Montage von zwei Haltegriffen",
    ],
    includedServiceLines: [
      "Fahrzeugbereitstellung",
      "Bereitstellung von Maschinen und Werkzeug",
      "Beräumung der Baustelle",
      "Kilometerpauschale (2 × 25 km)",
    ],
    materialsUnitPrice: "2.145,60 €", materialsTotal: "2.145,60 €",
    materialsLines,
    bonusRows: [
      { pos: "003", menge: "1 Stk", label: "Aktion: Haltegriff GRATIS – 1 Haltegriff gratis im Wert von 175 € inkl. Lieferung und Montage", einzel: "0,00 €", gesamt: "0,00 €" },
      { pos: "004", menge: "1 Stk", label: "Bestandskundenbonus – Rabatt von 300 € ab einem Gesamtwert von 3.000 €", einzel: "−252,10 €", gesamt: "−252,10 €" },
    ],
    totals: [
      { label: "Nettobetrag", value: "6.957,60 €" },
      { label: "Rabatt (3 %)", value: "−64,37 €" },
      { label: "zzgl. 19 % MwSt.", value: "1.309,72 €" },
      { label: "Gesamtbetrag", value: "8.202,95 €", strong: true },
    ],
    ebenerdigHinweis: true,
    regieRate: "59,50 €",
    hasSubsidy: false, subsidyText: "",
    paymentTitle: "Zahlungsbedingungen",
    paymentTerms: [
      { text: "20 % Anzahlung bei Auftragserteilung, Restbetrag nach Fertigstellung", checked: true },
      { text: "30 % Anzahlung, Restbetrag mit 1 % Skonto bei Zahlung innerhalb 8 Tagen" },
      { text: "40 % Anzahlung, Restbetrag mit 2 % Skonto bei Zahlung innerhalb 8 Tagen" },
    ],
    validityDate: "08.09.2026",
  };
}
