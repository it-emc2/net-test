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
  "offers-bu-KK-d43bbe__offer": "ADR 031",
};

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

/** the recorded DOCX snapshot + the listed change: one paragraph after the FUSSBODEN heading */
export function expectedDocx(snapshotId, docx) {
  if (!DOCX_DIFFERENCES[snapshotId]) return docx;
  const out = structuredClone(docx);
  const paragraphs = out["word/document.xml"].paragraphs;
  const at = paragraphs.findIndex((p) => /^FUSSBODEN\b/.test(p));
  if (at < 0) throw new Error(`${snapshotId}: no FUSSBODEN heading in the recording — the listed difference no longer fits`);
  paragraphs.splice(at + 1, 0, "- 1 Stk Aluverbundplatte (Marmor weiß)");
  return out;
}
