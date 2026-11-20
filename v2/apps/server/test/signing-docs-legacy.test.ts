// Differential test: the ported signing documents (Vollmacht BU/AH, Abtretung BU/AH) produce the same HTML
// as the legacy builders in src/templates/signing-docs.js, and the labels / required fields stay in step
// (main PR #419: forms mirror the paper forms). Same pattern as signing-fields.test.ts (legacy loaded at test time).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { EJSON } from "bson";
import { configureDocuments } from "../src/modules/documents/context.js";
import * as v2f from "../src/modules/signing/fields.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const quiet = () => {};
let tpl: any;
const legacy: any = await import(ROOT + "src/templates/signing-docs.js");
const legacyRoutes: any = await import(ROOT + "src/routes/signing.js");

beforeAll(async () => {
  configureDocuments({
    businessConfig: { get: (_k: string, f?: unknown) => f }, fetchVigourNetPrices: async () => new Map(), vigorUri: "mongodb://127.0.0.1:9/none", root: ROOT,
    log: { debug: quiet, warn: quiet, error: quiet }, pdf: { docxToPdf: async () => Buffer.alloc(0), htmlToPdf: async () => Buffer.alloc(0) },
  });
  tpl = await import("../src/modules/documents/ported/signing-docs.js");
});

const offers = EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[];
const ahPayloads = JSON.parse(readFileSync(ROOT + "tests/golden/fixtures/ah/payloads.json", "utf8")) as any[];
const kasse = offers.find((o) => o.payload?.Kundendaten?.payer === "Kassenkunde").payload;
const ahPayload = ahPayloads[0].payload;

const LONG = {
  lastName: "Muster-Musterfrau-Langenamenstein", firstName: "Erika Maria Elisabeth", street: "Sehr lange Musterstraße am Flussufer 123 a",
  postalCode: "95030", city: "Hof an der Saale (Oberfranken)", phone: "+49 9281 123456789", geburtsdatum: "01.02.1940",
  kassenkundeName: "Musterkasse Regionaldirektion Nordbayern", kk_versichertennr: "A123456789", kk_pflegegradSeit: "01.01.2024",
  kk_krankenkasseAdresse: "Musterkasse Pflegekasse, Postfach 12 34 56, Sehr lange Musterallee 99, 12345 Musterstadt am Berg",
  email: "kunde@example.test", pflegegrad: "3",
};
const SIGN = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const signed = { signatureImage: SIGN, signedAt: new Date("2026-11-06T10:00:00Z"), place: "Hof", status: "signed", signedIp: "203.0.113.5", extraFields: {} };
const open = { status: "pending", extraFields: {} };

const srFor = (type: "bu" | "ah", p: any) => ({ prefill: v2f.extractPrefill(p), payloadSnapshot: p, offerNumber: "T-1", offerType: type, documents: [] as any[] });

const BUILDERS = [
  ["vollmacht BU", "buildVollmachtHtml", "vollmacht", "bu"],
  ["vollmacht AH", "buildVollmachtHtml", "vollmacht", "ah"],
  ["abtretung BU", "buildAbtretungHtml", "abtretung", "bu"],
  ["abtretung AH", "buildAbtretungAhHtml", "abtretung_ah", "ah"],
] as const;

describe("signing documents identical to legacy (main #419)", () => {
  for (const [name, fn, key, type] of BUILDERS) {
    for (const [variant, edited] of [["payload values", {}], ["long values", LONG]] as const) {
      for (const [mode, doc] of [["pdf", signed], ["screen signed", signed], ["screen open", open]] as const) {
        it(`${name} / ${variant} / ${mode}`, () => {
          const p = type === "ah" ? ahPayload : kasse;
          const d = { key, editedFields: edited, ...doc };
          const m = mode === "pdf" ? "pdf" : "screen";
          const a = tpl[fn](srFor(type, p), d, m);
          const b = legacy[fn](srFor(type, p), d, m);
          expect(a.length).toBeGreaterThan(1000);
          expect(a).toBe(b);
        });
      }
    }
  }

  it("new form markers are present (guards against a stale port)", () => {
    const d = { key: "vollmacht", ...signed };
    const bu = tpl.buildVollmachtHtml(srFor("bu", kasse), d, "pdf");
    expect(bu).toContain("8.2.1.0_Vollmacht für Krankenkasse");
    expect(bu).toContain("Einwilligungserklärung zur Datenübermittlung:");
    expect(bu).not.toContain("entlastungCheckbox");
    expect(bu).not.toContain("budgetWuMCheckbox");
    const ah = tpl.buildVollmachtHtml(srFor("ah", ahPayload), d, "pdf");
    expect(ah).toContain("Entlastungsbudget nach §45b SGB XI");
    const ab = tpl.buildAbtretungHtml(srFor("bu", kasse), { key: "abtretung", ...signed }, "pdf");
    expect(ab).toContain("Seite 1 von 1");
    expect(ab).toContain("wohnumfeldverbessernde Maßnahmen");
  });

  it("labels equal legacy and the new wording", () => {
    expect(v2f.DOC_LABELS).toEqual(legacyRoutes.DOC_LABELS);
    expect(v2f.DOC_LABELS.vollmacht).toBe("Vollmacht für Krankenkasse");
    expect(v2f.DOC_LABELS.abtretung).toBe("Abtretungserklärung § 40 SGB XI");
    expect(v2f.DOC_LABELS.abtretung_ah).toBe("Abtretungserklärung § 45b SGB XI");
  });

  it("field keys and required fields unchanged", () => {
    expect(v2f.VOLLMACHT_REQUIRED_FIELDS.map((x) => x[0])).toEqual(["lastName", "firstName", "street", "postalCode", "city", "phone", "geburtsdatum", "kassenkundeName", "kk_versichertennr"]);
    expect(v2f.ABTRETUNG_REQUIRED_FIELDS.map((x) => x[0])).toEqual(["lastName", "firstName", "geburtsdatum", "kk_versichertennr", "street", "postalCode", "city", "phone", "pflegegrad", "kk_pflegegradSeit", "kassenkundeName", "kk_krankenkasseAdresse"]);
    expect(v2f.VOLLMACHT_REQUIRED_FIELDS).toEqual(legacy.VOLLMACHT_REQUIRED_FIELDS);
    expect(v2f.ABTRETUNG_REQUIRED_FIELDS).toEqual(legacy.ABTRETUNG_REQUIRED_FIELDS);
    // every editable key of the forms is still a data-edit-field the signing page can save
    const html = tpl.buildVollmachtHtml(srFor("bu", kasse), { key: "vollmacht", ...open }, "screen");
    const keys = [...html.matchAll(/data-edit-field="(\w+)"/g)].map((m) => m[1]);
    for (const [k] of v2f.VOLLMACHT_REQUIRED_FIELDS) expect(keys).toContain(k);
    const ab = tpl.buildAbtretungHtml(srFor("bu", kasse), { key: "abtretung", ...open }, "screen");
    const abKeys = [...ab.matchAll(/data-edit-field="(\w+)"/g)].map((m) => m[1]);
    for (const [k] of v2f.ABTRETUNG_REQUIRED_FIELDS.filter(([k]) => k !== "pflegegrad")) expect(abKeys).toContain(k);
    expect(ab).toContain('name="pflegegrad"');
  });
});
