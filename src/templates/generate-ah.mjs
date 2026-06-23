/**
 * Generator script for Angebot-AH.docx
 * Run once: node src/templates/generate-ah.mjs
 *
 * Clones the HL template (inheriting styles, fonts, headers, footers, media),
 * then replaces document.xml with AH-specific content + docxtemplater placeholders.
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tplDir = __dirname;

// ── XML helpers ────────────────────────────────────────────────────────────

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ESC[c]);

const OS = "Open Sans";
const NS =
  'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
  'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" ' +
  'xmlns:cx1="http://schemas.microsoft.com/office/drawing/2015/9/8/chartex" ' +
  'xmlns:cx2="http://schemas.microsoft.com/office/drawing/2015/10/21/chartex" ' +
  'xmlns:cx3="http://schemas.microsoft.com/office/drawing/2016/5/9/chartex" ' +
  'xmlns:cx4="http://schemas.microsoft.com/office/drawing/2016/5/10/chartex" ' +
  'xmlns:cx5="http://schemas.microsoft.com/office/drawing/2016/5/11/chartex" ' +
  'xmlns:cx6="http://schemas.microsoft.com/office/drawing/2016/5/12/chartex" ' +
  'xmlns:cx7="http://schemas.microsoft.com/office/drawing/2016/5/13/chartex" ' +
  'xmlns:cx8="http://schemas.microsoft.com/office/drawing/2016/5/14/chartex" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
  'xmlns:aink="http://schemas.microsoft.com/office/drawing/2016/ink" ' +
  'xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" ' +
  'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:oel="http://schemas.microsoft.com/office/2019/extlst" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml" ' +
  'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
  'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
  'xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" ' +
  'xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" ' +
  'xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" ' +
  'xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du" ' +
  'xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" ' +
  'xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock" ' +
  'xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" ' +
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
  'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
  'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
  'mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh w16sdtfl w16du wp14"';

function rPrContent({ bold = false, sz = "17", color = "070707", italic = false } = {}) {
  return (
    `<w:rFonts w:ascii="${OS}" w:eastAsia="${OS}" w:hAnsi="${OS}" w:cs="${OS}"/>` +
    `<w:color w:val="${color}"/>` +
    (bold ? `<w:b/><w:bCs/>` : ``) +
    (italic ? `<w:i/>` : ``) +
    `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`
  );
}

function rPr(opts = {}) {
  return `<w:rPr>${rPrContent(opts)}</w:rPr>`;
}

function run(text, opts = {}) {
  if (!text && text !== 0) return "";
  const t = String(text);
  const preserveAttr =
    t[0] === " " || t[t.length - 1] === " " || t.includes("  ")
      ? ' xml:space="preserve"'
      : "";
  return `<w:r>${rPr(opts)}<w:t${preserveAttr}>${e(t)}</w:t></w:r>`;
}

// Paragraph with optional extra pPr parts and spacing
function p(
  runs = "",
  { before = 0, after = 60, keepLines = false, ind = "", jc = "", pStyle = "" } = {}
) {
  const stylePart = pStyle ? `<w:pStyle w:val="${pStyle}"/>` : "";
  const keepPart = keepLines ? `<w:keepLines/>` : "";
  const jcPart = jc ? `<w:jc w:val="${jc}"/>` : "";
  const indPart = ind ? `<w:ind ${ind}/>` : "";
  return (
    `<w:p>` +
    `<w:pPr>${stylePart}${keepPart}<w:spacing w:before="${before}" w:after="${after}"/>` +
    `${jcPart}${indPart}<w:rPr>${rPrContent()}</w:rPr></w:pPr>` +
    runs +
    `</w:p>`
  );
}

// White invisible border (for layout tables)
function whiteBorder() {
  return (
    `<w:tcBorders>` +
    `<w:top w:val="single" w:sz="8" w:space="0" w:color="FFFFFF"/>` +
    `<w:left w:val="single" w:sz="8" w:space="0" w:color="FFFFFF"/>` +
    `<w:bottom w:val="single" w:sz="8" w:space="0" w:color="FFFFFF"/>` +
    `<w:right w:val="single" w:sz="8" w:space="0" w:color="FFFFFF"/>` +
    `</w:tcBorders>`
  );
}

// Dark border for content tables
function darkBorder(sides = "all") {
  const s = `<w:top w:val="single" w:sz="6" w:space="0" w:color="333333"/>`;
  const b = `<w:bottom w:val="single" w:sz="6" w:space="0" w:color="333333"/>`;
  const l = `<w:left w:val="single" w:sz="6" w:space="0" w:color="333333"/>`;
  const r = `<w:right w:val="single" w:sz="6" w:space="0" w:color="333333"/>`;
  if (sides === "all") return `<w:tcBorders>${s}${b}${l}${r}</w:tcBorders>`;
  if (sides === "top") return `<w:tcBorders>${s}<w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/></w:tcBorders>`;
  return `<w:tcBorders>${s}${b}${l}${r}</w:tcBorders>`;
}

function tc(width, paragraphs, { borders = "dark", vAlign = "top", bgColor = "", mar = 80 } = {}) {
  const borderXml = borders === "white" ? whiteBorder() : darkBorder();
  const bgPart = bgColor ? `<w:shd w:val="clear" w:color="auto" w:fill="${bgColor}"/>` : "";
  const vAlignPart = vAlign !== "top" ? `<w:vAlign w:val="${vAlign}"/>` : "";
  return (
    `<w:tc>` +
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    borderXml +
    bgPart +
    `<w:tcMar><w:top w:w="${mar}" w:type="dxa"/><w:left w:w="${mar}" w:type="dxa"/><w:bottom w:w="${mar}" w:type="dxa"/><w:right w:w="${mar}" w:type="dxa"/></w:tcMar>` +
    vAlignPart +
    `</w:tcPr>` +
    paragraphs +
    `</w:tc>`
  );
}

function tr(cells, { bgColor = "", height = "" } = {}) {
  const trPr =
    (bgColor ? `<w:trPr><w:shd w:val="clear" w:color="auto" w:fill="${bgColor}"/>` : `<w:trPr>`) +
    (height ? `<w:trHeight w:val="${height}"/>` : ``) +
    `</w:trPr>`;
  return `<w:tr>${trPr}${cells}</w:tr>`;
}

// Table with fixed layout
function tbl(gridCols, rows, totalWidth = 10035) {
  const grid = gridCols.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return (
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblStyle w:val="NormalTable0"/>` +
    `<w:tblW w:w="${totalWidth}" w:type="dxa"/>` +
    `<w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar>` +
    `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>` +
    `</w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>` +
    rows +
    `</w:tbl>`
  );
}

// ── Section properties (same header/footer rIds as HL template) ────────────
const SECT_PR =
  `<w:sectPr>` +
  `<w:headerReference w:type="even" r:id="rId7"/>` +
  `<w:headerReference w:type="default" r:id="rId8"/>` +
  `<w:footerReference w:type="even" r:id="rId9"/>` +
  `<w:footerReference w:type="default" r:id="rId10"/>` +
  `<w:headerReference w:type="first" r:id="rId11"/>` +
  `<w:footerReference w:type="first" r:id="rId12"/>` +
  `<w:pgSz w:w="12240" w:h="15840"/>` +
  `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="0" w:footer="0" w:gutter="0"/>` +
  `<w:pgNumType w:start="1"/>` +
  `<w:cols w:space="708"/>` +
  `</w:sectPr>`;

// ── Column widths ──────────────────────────────────────────────────────────
// Address table: 3 columns (customer | spacer | offer-info)
const ADDR_COLS = [4809, 600, 4626]; // total 10035

// Services table: 5 columns (Pos | Beschreibung | Menge | Einzelpreis | Gesamt)
const SVC_COLS = [500, 5400, 1050, 1685, 1400]; // total 10035

// Konditionen table: 2 columns (label | value)
const KOND_COLS = [6500, 3535]; // total 10035

// Signature table: 2 columns
const SIG_COLS = [5500, 4535]; // total 10035

// ── Build document body ────────────────────────────────────────────────────

function buildDocument() {
  const parts = [];

  // ── Sender line ────────────────────────────────────────────────────────
  parts.push(
    p(
      run("EmC2 Soziale Dienste UG (haftungsbeschränkt) • Waldstraße 5 • 95032 Hof", { sz: "17", color: "555555" }),
      { before: 171, after: 40 }
    )
  );

  // ── Address + offer-info table ─────────────────────────────────────────
  const addrCell = tc(
    ADDR_COLS[0],
    [
      p(run("{Anrede}", { sz: "17" }), { after: 20 }),
      p(run("{Vorname} {Nachname}", { sz: "17", bold: true }), { after: 20 }),
      p(run("{Adresse}", { sz: "17" }), { after: 20 }),
      p(run("{PLZ} {Stadt}", { sz: "17" }), { after: 20 }),
    ].join(""),
    { borders: "white", mar: 10 }
  );

  const spacerCell = tc(ADDR_COLS[1], p("", { after: 0 }), {
    borders: "white",
    mar: 10,
  });

  // Right info block (label:value pairs)
  function infoRow(label, valPlaceholder) {
    return (
      `<w:tr><w:trPr></w:trPr>` +
      tc(
        1800,
        p(run(label, { sz: "16", color: "555555" }), { after: 30 }),
        { borders: "white", mar: 30 }
      ) +
      tc(
        2826,
        p(run(valPlaceholder, { sz: "16" }), { after: 30 }),
        { borders: "white", mar: 30 }
      ) +
      `</w:tr>`
    );
  }

  const infoTable =
    `<w:tbl>` +
    `<w:tblPr><w:tblStyle w:val="NormalTable0"/><w:tblW w:w="${ADDR_COLS[2]}" w:type="dxa"/>` +
    `<w:tblInd w:w="0" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="1800"/><w:gridCol w:w="2826"/></w:tblGrid>` +
    infoRow("Angebot-Nr.:", "{Angebotsnummer}") +
    infoRow("Datum:", "{Datum}") +
    infoRow("Gültig bis:", "{ValidityDate}") +
    infoRow("Ansprechpartner:", "{Ansprechpartner}") +
    `</w:tbl>`;

  const infoCell = tc(ADDR_COLS[2], infoTable, {
    borders: "white",
    mar: 10,
  });

  parts.push(
    tbl(
      ADDR_COLS,
      tr(addrCell + spacerCell + infoCell, { height: "1380" }),
      10035
    )
  );

  // ── Spacer ─────────────────────────────────────────────────────────────
  parts.push(p("", { after: 120 }));

  // ── Subject line ───────────────────────────────────────────────────────
  parts.push(p(run("Ihr Angebot für Hilfe im Haushalt", { bold: true, sz: "20" }), { after: 80 }));

  // ── Greeting ───────────────────────────────────────────────────────────
  parts.push(p(run("{Greeting} {Nachname},", { sz: "17" }), { after: 80 }));

  // ── Intro text ─────────────────────────────────────────────────────────
  parts.push(
    p(
      run("vielen Dank für Ihre Anfrage und Ihr damit verbundenes Interesse.", { sz: "17" }),
      { after: 20 }
    )
  );
  parts.push(
    p(
      run("Wir freuen uns, Ihnen folgendes Angebot unterbreiten zu können:", { sz: "17" }),
      { after: 120 }
    )
  );

  // ── Services table ─────────────────────────────────────────────────────
  // Column widths: Pos(500) | Beschreibung(5400) | Menge(1050) | Einzelpreis(1685) | Gesamt(1400) = 10035
  function headerCell(width, text) {
    return tc(
      width,
      p(run(text, { bold: true, sz: "17" }), { after: 60, before: 60 }),
      { borders: "dark", bgColor: "E8E8E8", mar: 60 }
    );
  }

  const svcHeaderRow = tr(
    headerCell(SVC_COLS[0], "Pos.") +
      headerCell(SVC_COLS[1], "Beschreibung") +
      headerCell(SVC_COLS[2], "Menge") +
      headerCell(SVC_COLS[3], "Einzelpreis") +
      headerCell(SVC_COLS[4], "Gesamtpreis"),
    {}
  );

  // Row 1: Anfahrtspauschale (static)
  const anfahrtRow = tr(
    tc(SVC_COLS[0], p(run("1.", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      tc(
        SVC_COLS[1],
        p(run("Anfahrtspauschale Alltagshilfe", { bold: true, sz: "17" }), { after: 20 }) +
          p(
            run(
              "Die Anfahrtspauschale enthält die Kosten für das Rüsten vor der Anfahrt, sowie die KFZ-Kosten.",
              { sz: "16", color: "444444" }
            ),
            { after: 40 }
          ),
        { borders: "dark", mar: 60 }
      ) +
      tc(SVC_COLS[2], p(run("{AhAnfahrtMenge}", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      tc(SVC_COLS[3], p(run("{AhAnfahrtEinzelpreis}", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      tc(SVC_COLS[4], p(run("{AhAnfahrtGesamt}", { bold: true, sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }),
    {}
  );

  // ── AhServices LOOP ROW ─────────────────────────────────────────────
  // Open tag {#AhServices} in first cell, close tag {/AhServices} in last cell
  // Sub-loop {#AhServiceTasks}...{/AhServiceTasks} inside Beschreibung cell
  const svcLoopRow = tr(
    // Pos cell — opening loop tag
    tc(
      SVC_COLS[0],
      p(run("{#AhServices}{AhServicePos}", { sz: "17" }), { after: 40 }),
      { borders: "dark", mar: 60 }
    ) +
      // Beschreibung cell — title + task sub-loop
      tc(
        SVC_COLS[1],
        p(run("{AhServiceTitle}", { bold: true, sz: "17" }), { after: 10 }) +
          p(run("{AhServiceSubtitle}", { sz: "16", color: "444444", italic: true }), { after: 8 }) +
          // task sub-loop: open+close on same paragraph so paragraphLoop duplicates it once per task
          p(run("{#AhServiceTasks}• {AhTaskLabel}{/AhServiceTasks}", { sz: "16", color: "333333" }), { after: 40 }),
        { borders: "dark", mar: 60 }
      ) +
      // Menge
      tc(SVC_COLS[2], p(run("{AhServiceMenge}", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      // Einzelpreis
      tc(SVC_COLS[3], p(run("{AhServiceEinzelpreis}", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      // Gesamtpreis cell — closing loop tag
      tc(
        SVC_COLS[4],
        p(run("{AhServiceGesamt}{/AhServices}", { bold: true, sz: "17" }), { after: 40 }),
        { borders: "dark", mar: 60 }
      ),
    {}
  );

  // ── Servicepauschale section (conditional) ───────────────────────────
  // {#AhHasServicepauschale} opens in first cell of separator row
  // {/AhHasServicepauschale} closes in last cell of the pauschale row
  const pauschaleNoticeRow = tr(
    // Merged notice — we span by giving all width to one cell and making others 1px
    tc(
      10035,
      p(
        run(
          "{#AhHasServicepauschale}Folgende Pauschale wird nicht von der Krankenkasse übernommen und versteht sich inkl. MwSt. Diese rechnen wir, wenn benötigt / wie mit Ihnen vereinbart direkt mit Ihnen ab:",
          { bold: true, sz: "16" }
        ),
        { after: 40, before: 40 }
      ),
      { borders: "dark", mar: 60, bgColor: "F5F5F5" }
    ),
    {}
  );

  const pauschaleRow = tr(
    tc(SVC_COLS[0], p(run("*", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      tc(
        SVC_COLS[1],
        p(run("Servicepauschale Reinigungsutensilien für HnD", { bold: true, sz: "17" }), { after: 20 }) +
          p(
            run(
              "1,20 € / Monat für Bereitstellung der Reinigungsutensilien – jährliche Abrechnung nach tatsächlichen Monaten, in denen Sie unsere Haushaltsnahen Dienstleistungen (HnD) in Anspruch genommen haben.",
              { sz: "16", color: "444444" }
            ),
            { after: 40 }
          ),
        { borders: "dark", mar: 60 }
      ) +
      tc(SVC_COLS[2], p(run("Pro Monat", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      tc(SVC_COLS[3], p(run("{AhServicepausEinzelpreis}", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }) +
      // closing tag
      tc(SVC_COLS[4], p(run("{/AhHasServicepauschale}", { sz: "17" }), { after: 40 }), { borders: "dark", mar: 60 }),
    {}
  );

  // ── Gesamtbetrag row ─────────────────────────────────────────────────
  const gesamtRow = tr(
    tc(SVC_COLS[0] + SVC_COLS[1] + SVC_COLS[2] + SVC_COLS[3], p("", { after: 60 }), {
      borders: "dark",
      mar: 60,
    }) +
      tc(
        SVC_COLS[4],
        p(run("{AhGesamtbetrag}", { bold: true, sz: "18" }), { after: 60 }),
        { borders: "dark", mar: 60 }
      ),
    {}
  );

  // Gesamtbetrag label — merge cols 1-4 in its own row
  const gesamtLabelRow = tr(
    tc(
      SVC_COLS[0] + SVC_COLS[1] + SVC_COLS[2] + SVC_COLS[3],
      p(run("Gesamtbetrag", { bold: true, sz: "18" }), { after: 60, jc: "right" }),
      { borders: "dark", bgColor: "EEEEEE", mar: 60 }
    ) +
      tc(
        SVC_COLS[4],
        p(run("{AhGesamtbetrag}", { bold: true, sz: "18" }), { after: 60 }),
        { borders: "dark", bgColor: "EEEEEE", mar: 60 }
      ),
    {}
  );

  parts.push(
    tbl(
      SVC_COLS,
      svcHeaderRow + anfahrtRow + svcLoopRow + pauschaleNoticeRow + pauschaleRow + gesamtLabelRow,
      10035
    )
  );

  // ── Note / Anmerkungen ─────────────────────────────────────────────────
  parts.push(p("", { after: 60 }));
  parts.push(p(run("{AhNote}", { sz: "16", color: "444444", italic: true }), { after: 40 }));

  // ── PAGE 2: Konditionen + Signature ────────────────────────────────────
  // Page break paragraph
  parts.push(
    `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>` +
      `<w:r><w:rPr></w:rPr><w:br w:type="page"/></w:r></w:p>`
  );

  // ── Konditionen header ─────────────────────────────────────────────────
  parts.push(p(run("Konditionen:", { bold: true, sz: "19" }), { after: 80 }));

  // ── Konditionen table (loop over rows) ────────────────────────────────
  // {#AhKondRows} opens in first cell, {/AhKondRows} closes in last cell
  const kondLoopRow = tr(
    tc(
      KOND_COLS[0],
      p(run("{#AhKondRows}{AhKondLabel}", { sz: "17" }), { after: 60, before: 60 }),
      { borders: "dark", mar: 80 }
    ) +
      tc(
        KOND_COLS[1],
        p(run("{AhKondValue}{/AhKondRows}", { sz: "17" }), { after: 60, before: 60 }),
        { borders: "dark", mar: 80 }
      ),
    {}
  );

  parts.push(tbl(KOND_COLS, kondLoopRow, 10035));
  parts.push(p("", { after: 160 }));

  // ── Signature request text ─────────────────────────────────────────────
  parts.push(
    p(
      run(
        "Bitte unterschreiben Sie bei Annahme dieses Angebots und schicken Sie es uns zurück – gerne auch per E-Mail an service@e-m-c-2.de. Die Unterschrift gilt für uns als Auftragsbestätigung.",
        { sz: "17" }
      ),
      { after: 80 }
    )
  );

  parts.push(p(run("Angebot akzeptiert / Auftrag bestätigt:", { sz: "17" }), { after: 240 }));

  // ── Signature line table ───────────────────────────────────────────────
  const sigLineRow = tr(
    tc(
      SIG_COLS[0],
      `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/><w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="333333"/></w:pBdr></w:pPr>` +
        run("Unterschrift Ort / Datum", { sz: "15", color: "666666" }) +
        `</w:p>`,
      { borders: "white", mar: 10 }
    ) +
      tc(SIG_COLS[1], p("", { after: 60 }), { borders: "white", mar: 10 }),
    {}
  );
  parts.push(tbl(SIG_COLS, sigLineRow, 10035));
  parts.push(p("", { after: 160 }));

  // ── Closing text ───────────────────────────────────────────────────────
  parts.push(
    p(run("Bei Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.", { sz: "17" }), { after: 40 })
  );
  parts.push(
    p(run("Wir bedanken uns für Ihr Vertrauen und freuen uns von Ihnen zu hören!", { sz: "17" }), {
      after: 120,
    })
  );
  parts.push(p(run("Mit freundlichen Grüßen,", { sz: "17" }), { after: 20 }));
  parts.push(p(run("Ihr Team von der EmC2", { sz: "17" }), { after: 20 }));

  // ── Our signature (image placeholder) ─────────────────────────────────
  parts.push(
    `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>` +
      `<w:r>${rPr({ sz: "17" })}<w:t>{%OurSignatureImage}</w:t></w:r>` +
      `</w:p>`
  );

  // ── Section properties ─────────────────────────────────────────────────
  parts.push(`<w:p><w:pPr>${SECT_PR}</w:pPr></w:p>`);

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${NS}>` +
    `<w:background w:color="FFFFFF"/>` +
    `<w:body>` +
    parts.join("") +
    `</w:body></w:document>`
  );
}

// ── AH-specific header XML ─────────────────────────────────────────────────
// Two-row table with vertical merge on the logo cell:
//   Row 1 (725 dxa): title text (bottom-aligned) | top half of logo (vMerge start)
//   Row 2 (725 dxa): blue line as TOP border     | bottom half of logo (vMerge cont.)
// → blue line crosses exactly through the middle of the logo image.
function buildAhHeader(logoRid = "rId1") {
  // Logo: 1585595 × 920750 EMU → 2496 × 1450 dxa. Half-height = 725 dxa.
  const LOGO_HALF = 725; // dxa — splits logo into two equal rows
  const LOGO_CX   = 1585595;
  const LOGO_CY   = 920750;
  const COL_TITLE = 7200; // dxa left column
  const COL_LOGO  = 2160; // dxa right column

  const none = (s) => `<${s} w:val="none" w:sz="0" w:space="0" w:color="auto"/>`;
  const allNone = `<w:tcBorders>${none("w:top")}${none("w:left")}${none("w:bottom")}${none("w:right")}</w:tcBorders>`;
  const noMar   = `<w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>`;
  const emptyP  = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>`;

  // ── Logo drawing (inline, full logo height spans both merged rows) ────────
  const logoDrawing =
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0" ` +
    `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">` +
    `<wp:extent cx="${LOGO_CX}" cy="${LOGO_CY}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="2" name="emc2-logo.jpg"/>` +
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name=""/>` +
    `<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${logoRid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr bwMode="auto">` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO_CX}" cy="${LOGO_CY}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>` +
    `</wp:inline></w:drawing>`;

  // ── Title run (bold, letter-spaced) ──────────────────────────────────────
  const titleRPrContent =
    `<w:rFonts w:ascii="${OS}" w:eastAsia="${OS}" w:hAnsi="${OS}" w:cs="${OS}"/>` +
    `<w:b/><w:bCs/>` +
    `<w:color w:val="1F2D3D"/>` +
    `<w:sz w:val="28"/><w:szCs w:val="28"/>` +
    `<w:spacing w:val="100"/>`;
  const titleRPr = `<w:rPr>${titleRPrContent}</w:rPr>`;

  // ── ROW 1: title (left, vAlign bottom) | logo top-half (right, vMerge start) ──
  const row1TitleCell =
    `<w:tc><w:tcPr>` +
    `<w:tcW w:w="${COL_TITLE}" w:type="dxa"/>` +
    allNone + noMar +
    `<w:vAlign w:val="bottom"/>` +
    `</w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/><w:rPr>${titleRPrContent}</w:rPr></w:pPr>` +
    `<w:r>${titleRPr}<w:t xml:space="preserve">EmC2  Alltagshilfe</w:t></w:r>` +
    `</w:p></w:tc>`;

  const row1LogoCell =
    `<w:tc><w:tcPr>` +
    `<w:tcW w:w="${COL_LOGO}" w:type="dxa"/>` +
    `<w:vMerge w:val="restart"/>` +
    allNone + noMar +
    `<w:vAlign w:val="top"/>` +
    `</w:tcPr>` +
    `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr>` +
    `<w:r><w:rPr><w:noProof/></w:rPr>${logoDrawing}</w:r>` +
    `</w:p></w:tc>`;

  // ── ROW 2: blue line as TOP border of left cell | logo bottom-half (vMerge cont.) ──
  const blueLine =
    `<w:top w:val="single" w:sz="18" w:space="0" w:color="2E74B5"/>`;

  const row2LineCell =
    `<w:tc><w:tcPr>` +
    `<w:tcW w:w="${COL_TITLE}" w:type="dxa"/>` +
    `<w:tcBorders>${blueLine}${none("w:left")}${none("w:bottom")}${none("w:right")}</w:tcBorders>` +
    noMar +
    `</w:tcPr>` +
    emptyP +
    `</w:tc>`;

  const row2LogoCell =
    `<w:tc><w:tcPr>` +
    `<w:tcW w:w="${COL_LOGO}" w:type="dxa"/>` +
    `<w:vMerge/>` +
    `<w:tcBorders>${blueLine}${none("w:left")}${none("w:bottom")}${none("w:right")}</w:tcBorders>` +
    noMar +
    `</w:tcPr>` +
    emptyP +
    `</w:tc>`;

  // Header table: 2 rows, logo spans both via vMerge → blue line crosses logo middle
  const trPr1 = `<w:trPr><w:trHeight w:val="${LOGO_HALF}" w:hRule="exact"/></w:trPr>`;
  const trPr2 = `<w:trPr><w:trHeight w:val="${LOGO_HALF}" w:hRule="exact"/></w:trPr>`;

  const headerTable =
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblStyle w:val="NormalTable0"/>` +
    `<w:tblW w:w="9360" w:type="dxa"/>` +
    `<w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${COL_TITLE}"/><w:gridCol w:w="${COL_LOGO}"/></w:tblGrid>` +
    `<w:tr>${trPr1}${row1TitleCell}${row1LogoCell}</w:tr>` +
    `<w:tr>${trPr2}${row2LineCell}${row2LogoCell}</w:tr>` +
    `</w:tbl>`;

  // Namespace declarations for the hdr element
  const hdrNS =
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" ' +
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" ' +
    'xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" ' +
    'xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" ' +
    'xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" ' +
    'xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du" ' +
    'xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash" ' +
    'xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex" ' +
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" ' +
    'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" ' +
    'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" ' +
    'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
    'mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh w16du"';

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr ${hdrNS}>` +
    `<w:p><w:pPr><w:pStyle w:val="normal1"/></w:pPr></w:p>` +
    headerTable +
    `</w:hdr>`
  );
}

// ── Pack and write ─────────────────────────────────────────────────────────

const hlBytes = readFileSync(join(tplDir, "Angebot-HL.docx"));
const zip = new PizZip(hlBytes);

const docXml = buildDocument();
zip.file("word/document.xml", docXml);

// Replace header2 (all pages) and header3 (first page) with AH-specific header
// Both reference the same logo via rId1 in the header's relationship file
const ahHeader = buildAhHeader("rId1");
zip.file("word/header2.xml", ahHeader);
zip.file("word/header3.xml", ahHeader);

const output = zip.generate({
  type: "nodebuffer",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  compression: "DEFLATE",
});

writeFileSync(join(tplDir, "Angebot-AH.docx"), output);
console.log("[generate-ah] Angebot-AH.docx written ✓");
