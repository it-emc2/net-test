// Differential test: v2 signing rules (src/signing/fields.ts) vs the legacy functions in
// src/templates/signing-docs.js, over every golden-fixture payload and edit variants.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EJSON } from "bson";
import * as v2 from "../src/modules/signing/fields.js";

const ROOT = new URL("../../../../", import.meta.url).pathname;
const legacy = await import(ROOT + "src/templates/signing-docs.js");
const offers = (EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[]).map((o) => o.payload);
const ah = (JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8")) as any[]).map((x) => x.payload);
const payloads = [...offers, ...ah];
const KEYS = ["angebot", "vollmacht", "abtretung", "vollmacht_p2", "abtretung_p2", "zusatzblatt", "abtretung_ah", "", undefined];
const EDITS = [undefined, {}, { firstName: "X", kk_versichertennr: "" }, { pflegegrad: 3, phone: null }];

describe("signing rules identical to legacy", () => {
  it("constants", () => {
    expect(v2.VOLLMACHT_REQUIRED_FIELDS).toEqual(legacy.VOLLMACHT_REQUIRED_FIELDS);
    expect(v2.ABTRETUNG_REQUIRED_FIELDS).toEqual(legacy.ABTRETUNG_REQUIRED_FIELDS);
  });

  it(`resolveFields / isPartnerKey / baseDocKey over ${payloads.length} payloads`, () => {
    let n = 0;
    for (const p of payloads) {
      const sr = { prefill: v2.extractPrefill(p), payloadSnapshot: p };
      for (const key of KEYS) for (const editedFields of EDITS) {
        expect(v2.resolveFields(sr, { key: key as string, editedFields })).toEqual(legacy.resolveFields(sr, { key, editedFields }));
        n++;
      }
    }
    for (const k of KEYS) { expect(v2.isPartnerKey(k)).toBe(legacy.isPartnerKey(k)); expect(v2.baseDocKey(k)).toBe(legacy.baseDocKey(k)); }
    expect(n).toBeGreaterThan(1000);
  });

  it("hasPaymentChoice", () => {
    const cases: unknown[] = [
      undefined, null, [], "x",
      [{ Text: "Zahlungsbedingungen", IsTitle: true }, { Text: "O 100 % nach Fertigstellung oder" }, { Text: "O Flexibel:" }, { Text: "• 50 % Anzahlung" }, { Text: "Fußnote" }],
      [{ Text: "☒ Eigenanteil fällig nach Fertigstellung" }],
      [{ Text: "Eigenanteil 120 € nach Fertigstellung" }],
      [{ Text: "• nur ein Punkt", IsBullet: true }],
    ];
    for (const c of cases) expect(v2.hasPaymentChoice(c)).toBe(legacy.hasPaymentChoice(c));
  });
});
