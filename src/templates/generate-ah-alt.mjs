/**
 * Generator script for Angebot-AH-alt.docx  (DIN 5008 / A4 variant)
 * Run once: node src/templates/generate-ah-alt.mjs
 *
 * Exact-copy variant of ah-offer-alt.pdf. Same fillable template as
 * generate-ah.mjs (placeholders, loops, 4-row info block, inherited
 * header/footer + logo), but laid out for a German DIN 5008 window-envelope
 * letter:
 *   - Page size A4 (210×297 mm) instead of US Letter
 *   - DIN 5008 margins: left 25 mm, right 20 mm
 *   - Recipient address block positioned so its first line sits ~45 mm from
 *     the top edge (address-zone start for a DIN lang window envelope), with
 *     the small sender/return line just below the letterhead (~32 mm) and the
 *     reserved Zusatz-/Vermerkzone gap between them.
 *
 * NOTE ON LOGO: the header reuses the logo already embedded in the base
 * template (word/media/image1.jpeg — the "emc² · Dienstleister fürs Leben"
 * lightbulb mark) via buildAhHeader(). The scanned ah-offer-alt.pdf shows the
 * spray-bottle "EmC2 · Anerkannter Dienstleister nach §45a SGB XI" mark, which
 * does not exist as an asset in the repo. Drop that file into word/media and
 * point rId1 at it to reproduce the exact logo from the scan.
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
function tbl(gridCols, rows, totalWidth = CONTENT_W) {
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
  // A4: 210×297 mm → 11906×16838 twips.  DIN 5008 margins: left 25 mm (1418),
  // right 20 mm (1134). Small header/footer offsets so the letterhead + footer
  // band clear the text. Content width = 11906 − 1418 − 1134 = 9354 twips.
  `<w:pgSz w:w="11906" w:h="16838"/>` +
  `<w:pgMar w:top="1418" w:right="1134" w:bottom="1134" w:left="1418" w:header="340" w:footer="340" w:gutter="0"/>` +
  `<w:pgNumType w:start="1"/>` +
  `<w:cols w:space="708"/>` +
  `</w:sectPr>`;

// ── Column widths ──────────────────────────────────────────────────────────
// A4/DIN content width (twips). All tables sum to this instead of the
// Letter-era 10035. Widths below are the generate-ah.mjs proportions × 0.93214.
const CONTENT_W = 9354;

// Address table: 3 columns (customer | spacer | offer-info)
const ADDR_COLS = [4483, 559, 4312]; // total 9354

// Services table: 5 columns (Pos | Beschreibung | Menge | Einzelpreis | Gesamt)
const SVC_COLS = [466, 5033, 979, 1571, 1305]; // total 9354

// Konditionen table: 2 columns (label | value)
const KOND_COLS = [6059, 3295]; // total 9354

// Signature table: 2 columns
const SIG_COLS = [5127, 4227]; // total 9354

// ── Build document body ────────────────────────────────────────────────────

function buildDocument() {
  const parts = [];

  // ── Sender line (DIN 5008 Rücksendeangabe) ─────────────────────────────
  // Small return line, sits just below the letterhead blue line at ~32 mm.
  parts.push(
    p(
      run("EmC2 Soziale Dienste UG (haftungsbeschränkt) • Waldstraße 5 • 95032 Hof", { sz: "17", color: "555555" }),
      { before: 171, after: 40 }
    )
  );

  // ── Zusatz-/Vermerkzone spacer ─────────────────────────────────────────
  // DIN 5008 reserves a blank zone between the return line and the recipient
  // address so the address falls at ~45 mm from the top edge and lands in the
  // window of a DIN lang envelope.
  parts.push(p("", { before: 0, after: 265 }));

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
        1678,
        p(run(label, { sz: "16", color: "555555" }), { after: 30 }),
        { borders: "white", mar: 30 }
      ) +
      tc(
        2634,
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
    `<w:tblGrid><w:gridCol w:w="1678"/><w:gridCol w:w="2634"/></w:tblGrid>` +
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
      CONTENT_W
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
      svcHeaderRow + anfahrtRow + svcLoopRow + gesamtLabelRow,
      CONTENT_W
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

  parts.push(tbl(KOND_COLS, kondLoopRow, CONTENT_W));
  parts.push(p("", { after: 160 }));

  // ── Signature request text ─────────────────────────────────────────────
  parts.push(
    p(
      run(
        "Bitte unterschreiben Sie bei Annahme dieses Angebots und schicken Sie es uns zurück – gerne auch per E-Mail an service@e-m-c-2.de. Die Unterschrift gilt für uns als Auftragsbestätigung.",
        { sz: "17" }
      ) + `<w:r>${rPr({ sz: "17" })}<w:br/><w:br/></w:r>`,
      { after: 80 }
    )
  );

  parts.push(
    p(
      run("Angebot akzeptiert / Auftrag bestätigt:", { sz: "17" }) +
        `<w:r>${rPr({ sz: "17" })}<w:br/><w:br/></w:r>`,
      { after: 240 }
    )
  );

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
  parts.push(tbl(SIG_COLS, sigLineRow, CONTENT_W));
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
  parts.push(
    p(
      run("Mit freundlichen Grüßen,", { sz: "17" }) +
        `<w:r>${rPr({ sz: "17" })}<w:br/></w:r>`,
      { after: 20 }
    )
  );
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

// ── AH-specific header XML ───────────────────────────────────────────
// Layout:
//   Para 1 — "EmC2  Alltagshilfe" bold text (no logo, no border)
//   Para 2 — full-width blue inline rect + floating logo anchor
//
// The logo floats right-aligned at the line's vertical level. The blue line is
// an INLINE rect that deliberately stops short of the logo, leaving a gap — so
// the line never overlaps the logo. This avoids relying on inline-vs-floating
// z-order (which LibreOffice renders inconsistently: the inline line can draw
// on top of floating shapes, so a "mask" behind the logo is not reliable).
//
// Result: ─────────────────────────      [ logo ]
function buildAhHeader(logoRid = "rId1") {
  // ~65% of the original artwork — a bit larger than before, still inside the
  // ~1-inch header band.
  const LOGO_CX = 1030636; // ≈ 1.13 inch wide
  const LOGO_CY = 598488;  // ≈ 0.65 inch tall

  // A4 DIN content width = 11906 − 1418 − 1134 = 9354 twips. The blue line
  // spans from the left margin to a gap before the right-aligned logo:
  //   line width = content − logo width − gap
  const CONTENT_W_TW = 9354;
  const LOGO_W_TW    = Math.round(LOGO_CX / 635); // ≈ 1623 twips
  const LOGO_GAP_TW  = 160;                        // ≈ 2.8 mm clear gap
  const LINE_W       = CONTENT_W_TW - LOGO_W_TW - LOGO_GAP_TW; // ≈ 7571
  const LINE_W_EMU   = LINE_W * 635;
  const LINE_H_EMU   = 28575;         // 2.25 pt (sz=18 eighth-points)

  // ── Shared graphic XML ────────────────────────────────────────────
  const graphicXml =
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr>` +
    `<pic:cNvPr id="0" name=""/>` +
    `<pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr>` +
    `</pic:nvPicPr>` +
    `<pic:blipFill>` +
    `<a:blip r:embed="${logoRid}"/>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</pic:blipFill>` +
    `<pic:spPr bwMode="auto">` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO_CX}" cy="${LOGO_CY}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>`;

  // Vertical offset so the logo is centered on the blue line.
  const LOGO_POS_OFFSET = Math.round(LINE_H_EMU / 2 - LOGO_CY / 2); // -284957

  // ── Floating logo anchor: right-aligned at the margin, centered vertically
  // on the blue line. The line stops before it (see LINE_W), so no overlap. ──
  const logoAnchor =
    `<w:drawing>` +
    `<wp:anchor distT="0" distB="0" distL="114300" distR="114300" ` +
    `simplePos="0" relativeHeight="251658240" behindDoc="0" ` +
    `locked="0" layoutInCell="0" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="margin"><wp:align>right</wp:align></wp:positionH>` +
    `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${LOGO_POS_OFFSET}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${LOGO_CX}" cy="${LOGO_CY}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapNone/>` +
    `<wp:docPr id="2" name="emc2-logo"/>` +
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>` +
    `</wp:cNvGraphicFramePr>` +
    graphicXml +
    `</wp:anchor></w:drawing>`;

  // ── Title paragraph (text only) ───────────────────────────────────────────────
  const titleRPrContent =
    `<w:rFonts w:ascii="${OS}" w:eastAsia="${OS}" w:hAnsi="${OS}" w:cs="${OS}"/>` +
    `<w:b/><w:bCs/>` +
    `<w:color w:val="1F2D3D"/>` +
    `<w:sz w:val="28"/><w:szCs w:val="28"/>` +
    `<w:spacing w:val="100"/>`;

  const titlePara =
    `<w:p>` +
    `<w:pPr>` +
    `<w:spacing w:before="0" w:after="0"/>` +
    `<w:rPr>${titleRPrContent}</w:rPr>` +
    `</w:pPr>` +
    `<w:r><w:rPr>${titleRPrContent}</w:rPr>` +
    `<w:t xml:space="preserve">EmC2  Alltagshilfe</w:t></w:r>` +
    `</w:p>`;

  // ── Blue line paragraph: full-width rect + floating logo ────────────────────────────
  const lineRect =
    `<w:p>` +
    `<w:pPr><w:spacing w:before="0" w:after="300"/></w:pPr>` +
    `<w:r><w:rPr><w:noProof/></w:rPr>` +
    `<w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${LINE_W_EMU}" cy="${LINE_H_EMU}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="3" name="blue-line"/>` +
    
    `<wp:cNvGraphicFramePr>` +
    `<a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>` +
    `</wp:cNvGraphicFramePr>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
    `<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">` +
    `<wps:cNvSpPr><a:spLocks noChangeArrowheads="1"/></wps:cNvSpPr>` +
    `<wps:spPr>` +
    `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${LINE_W_EMU}" cy="${LINE_H_EMU}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="2E74B5"/></a:solidFill>` +
    `<a:ln><a:noFill/></a:ln>` +
    `</wps:spPr>` +
    `<wps:bodyPr lIns="0" rIns="0" tIns="0" bIns="0" anchor="t"/>` +
    `</wps:wsp>` +
    `</a:graphicData>` +
    `</a:graphic>` +
    `</wp:inline>` +
    `</w:drawing>` +
    `</w:r>` +
    `<w:r><w:rPr><w:noProof/></w:rPr>${logoAnchor}</w:r>` +
    `</w:p>`;

  // ── Namespace declarations ────────────────────────────────────────────────────────────────────────────
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
    titlePara +
    lineRect +
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

// ── Force a single font family everywhere ────────────────────────────────
// The cloned HL template's styles.xml + theme default to Calibri (plus Calibri
// Light / Georgia / Cambria), so the inherited footer (and any style-driven
// text) renders in Calibri while our body + header use Open Sans. Rewrite every
// font reference to Open Sans so the whole document is one family.
function forceOpenSans(xml) {
  return xml
    // WordprocessingML rFonts attributes (styles.xml, numbering, etc.)
    .replace(/w:(ascii|hAnsi|eastAsia|cs)="[^"]*"/g, `w:$1="${OS}"`)
    // DrawingML theme font scheme (minor/major latin/east-asian/complex faces)
    .replace(/(<a:(?:latin|ea|cs)\b[^>]*\btypeface=)"[^"]*"/g, `$1"${OS}"`);
}
for (const part of ["word/styles.xml", "word/theme/theme1.xml"]) {
  const f = zip.file(part);
  if (f) zip.file(part, forceOpenSans(f.asText()));
}

const output = zip.generate({
  type: "nodebuffer",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  compression: "DEFLATE",
});

writeFileSync(join(tplDir, "Angebot-AH-alt.docx"), output);
console.log("[generate-ah-alt] Angebot-AH-alt.docx written ✓");
