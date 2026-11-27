// Deliberate differences of the rewrite branch from the golden masters. The fixtures stay what
// they are — the old app's recorded output — and are never regenerated for these. A case listed
// here must differ from its recording by EXACTLY the change written down below, nothing else:
// the golden tests compare against `recording + this change`. Every entry names its ADR.
//
// ADR 031 (owner 2026-11-26) — floor covered only by leftovers of the Wandverkleidung: the offer
// document lists „- 1 Stk Aluverbundplatte (…)“ without a price before the floor's Flächenkleber.
// Only the document copy (materialsDisplayDocx) gets the line; materials.lines, every sum and
// total stay as recorded. The three recorded cases are VIGOUR floors in „Marmor weiß“.

const LEFTOVER_FLOOR_LINE_MARMOR_WEISS = {
  productId: null, name: "Aluverbundplatte (Marmor weiß)", color: "Marmor weiß", qty: 1, unit: null, unitPrice: 0, lineTotal: 0,
  label: "- 1 Stk Aluverbundplatte (Marmor weiß)", labelLines: ["- 1 Stk Aluverbundplatte (Marmor weiß)"],
  source: null, finish: null, currentNet: null, hassmannArticle: null, hassmannQty: null, docxHide: false,
  category: "Fußboden", displayOnly: true, note: "aus Resten der Wandverkleidung",
};

/** pricing golden (tests/golden/fixtures/pricing/cases.json): case id → ADR */
export const PRICING_DIFFERENCES = {
  "offers-bu-KK-d43bbe": "ADR 031",
  "drafts-bu-KK-aeba4d": "ADR 031",
  "drafts-bu-KK-aeb927": "ADR 031",
};

/** DOCX golden (tests/golden/fixtures/docs/snapshots.json): snapshot id → ADR. The case's
 *  Materialübersicht (`…__material`) is NOT listed: it must stay as recorded. */
export const DOCX_DIFFERENCES = {
  "offers-bu-KK-d43bbe__offer": "ADR 031 + Kürzel je Produkt",
  "offers-bu-KK-d46198__offer": "Kürzel je Produkt",
  "offers-bu-SZ-d3dcb1__offer": "Kürzel je Produkt",
  "drafts-bu-?-b9ccfc__offer": "Kürzel je Produkt",
  "drafts-bu-?-b9cb9a__offer": "Kürzel je Produkt",
};

// Kürzel je Produkt (owner 2026-11-27) — the supplier Kürzel moves from the section heading
// („WANDVERKLEIDUNG · WV-HM“) to the end of each line of that supplier's own products
// („… · WV-HM“); „Qualität und Normen“ once per Kürzel present in the section, after its rows.
// Per snapshot: the recorded lines that get a Kürzel, and the Qualität rows that are new.
// Every other paragraph (and every Materialübersicht) stays as recorded.
const VIGOUR_SEALING = "- 1 Stk Wandabdichtung BASIS-Set 5 qm DW bis 100 x 100 / BW bis 180 x 80 cm";
const B2 = "Qualität und Normen: Brandklasse B2 nach DIN 4102-1";
const LINE_CODES = {
  "offers-bu-KK-d46198__offer": {
    coded: {
      "- 1 Stk Wandverkleidung 3.0 Alu 997×2550 mm — Farbe: Aragon grau": "WV-HM",
      [VIGOUR_SEALING]: "WV-HM",
      "- 1 Stk Abschlussprofil 3.0 255 cm silber eloxiert": "WV-HM",
      "- 1 Stk Duschwanne 80 x 170 x 2.6 cm": "DW-BX",
    },
  },
  "offers-bu-KK-d43bbe__offer": {
    coded: {
      "- 1 Stk Aluverbundplatte (Marmor weiß)": "WV-HM", // the ADR 031 line: a VIGOUR plate
      "- 2 Stk Wandverkleidung 3.0 Alu 997×2550 mm — Farbe: Marmor weiß": "WV-HM",
      [VIGOUR_SEALING]: "WV-HM",
      "- 1 Stk Abschlussprofil 3.0 255 cm silber eloxiert": "WV-HM",
      "- 1 Stk Duschwanne 120 x 90 x 3 cm — Farbe: Weiß": "DW-SL",
    },
    // FUSSBODEN now holds a VIGOUR line → its Qualität row, before the next heading
    qualityBefore: [["WANDVERKLEIDUNG", B2]],
  },
  "offers-bu-SZ-d3dcb1__offer": {
    coded: {
      "- 1 Stk Wandverkleidung 3.0 Alu 997×2550 mm — Farbe: Weiß": "WV-HM",
      [VIGOUR_SEALING]: "WV-HM",
      "- 1 Stk Abschlussprofil 3.0 255 cm silber eloxiert": "WV-HM",
      "- 1 Stk Duschwanne 110 x 90 x 3 cm — Farbe: Weiß": "DW-SL",
    },
  },
  "drafts-bu-?-b9ccfc__offer": {
    coded: {
      "- 2 Stk Wandverkleidung 3.0 Alu 997×2550 mm — Farbe: Struktur weiß": "WV-HM",
      "- 1 Stk Wandverkleidung 3.0 Alu 1497×2550 mm — Farbe: Struktur weiß": "WV-HM",
      [VIGOUR_SEALING]: "WV-HM",
      "- 2 Stk Abschlussprofil 3.0 255 cm silber eloxiert": "WV-HM",
      "- 1 Stk Duschwanne 150 x 75 x 3 cm — Farbe: Weiß": "DW-SL",
    },
  },
  "drafts-bu-?-b9cb9a__offer": {
    coded: {
      [VIGOUR_SEALING]: "WV-HM",
      "- 1 Stk Abschlussprofil 3.0 255 cm silber eloxiert": "WV-HM",
      "- 1 Stk Duschwanne 150 x 75 x 3 cm — Farbe: Weiß": "DW-SL",
    },
  },
};

function lineCodes(snapshotId, paragraphs) {
  const spec = LINE_CODES[snapshotId];
  if (!spec) return;
  const headings = paragraphs.filter((p) => / · [A-Z]{2}-[A-Z]{2}$/.test(p) && /^[A-ZÄÖÜ]+ · /.test(p));
  if (!headings.length) throw new Error(`${snapshotId}: no coded heading in the recording — the listed difference no longer fits`);
  paragraphs.forEach((p, i) => {
    if (headings.includes(p)) paragraphs[i] = p.replace(/ · [A-Z]{2}-[A-Z]{2}$/, "");
  });
  for (const [line, code] of Object.entries(spec.coded)) {
    const at = paragraphs.indexOf(line);
    if (at < 0) throw new Error(`${snapshotId}: „${line}“ not in the recording — the listed difference no longer fits`);
    paragraphs[at] = `${line} · ${code}`;
  }
  for (const [heading, text] of spec.qualityBefore || []) {
    const at = paragraphs.indexOf(heading);
    if (at < 0) throw new Error(`${snapshotId}: no ${heading} heading — the listed difference no longer fits`);
    paragraphs.splice(at, 0, text);
  }
}

/** the recorded pricing result + the listed change (a copy; unlisted cases come back unchanged) */
export function expectedPricing(caseId, expected) {
  if (!PRICING_DIFFERENCES[caseId]) return expected;
  const out = structuredClone(expected);
  const lines = out.materialsDisplayDocx.lines;
  const at = lines.findLastIndex((l) => l.category === "Fußboden" && l.productId === "R_4260602");
  if (at < 0) throw new Error(`${caseId}: no floor adhesive in the recording — the listed difference no longer fits`);
  lines.splice(at, 0, structuredClone(LEFTOVER_FLOOR_LINE_MARMOR_WEISS));
  return out;
}

/** the recorded DOCX snapshot + the listed changes: ADR 031 (one paragraph after the FUSSBODEN
 *  heading), then the Kürzel je Produkt (LINE_CODES) */
export function expectedDocx(snapshotId, docx) {
  if (!DOCX_DIFFERENCES[snapshotId]) return docx;
  const out = structuredClone(docx);
  const paragraphs = out["word/document.xml"].paragraphs;
  if (DOCX_DIFFERENCES[snapshotId].startsWith("ADR 031")) {
    const at = paragraphs.findIndex((p) => /^FUSSBODEN\b/.test(p));
    if (at < 0) throw new Error(`${snapshotId}: no FUSSBODEN heading in the recording — the listed difference no longer fits`);
    paragraphs.splice(at + 1, 0, "- 1 Stk Aluverbundplatte (Marmor weiß)");
  }
  lineCodes(snapshotId, paragraphs);
  return out;
}
