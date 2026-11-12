// Signing forms (ported templates, 5c) → real PDF via Gotenberg: every word of the form shows up.
// Runs when OC_TEST_GOTENBERG_URL is set (CI service container; locally docker gotenberg 8.40.0).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { EJSON } from "bson";
import { configureDocuments } from "../src/modules/documents/context.js";
import { Gotenberg } from "../src/integrations/gotenberg.js";
import { extractPrefill } from "../src/modules/signing/fields.js";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const GOT = process.env.OC_TEST_GOTENBERG_URL;
const quiet = () => {};
let tpl: any;

beforeAll(async () => {
  configureDocuments({
    businessConfig: { get: (_k: string, f?: unknown) => f }, fetchVigourNetPrices: async () => new Map(), vigorUri: "mongodb://127.0.0.1:9/none", root: ROOT,
    log: { debug: quiet, warn: quiet, error: quiet }, pdf: { docxToPdf: async () => Buffer.alloc(0), htmlToPdf: async () => Buffer.alloc(0) },
  });
  tpl = await import("../src/modules/documents/ported/signing-docs.js");
});

const offers = (EJSON.parse(readFileSync(ROOT + "tests/golden/fixtures/docs-db/offers.json", "utf8")) as any[]);
const kasse = offers.find((o) => o.payload?.Kundendaten?.payer === "Kassenkunde").payload;
const sr = { prefill: extractPrefill(kasse), payloadSnapshot: kasse, offerNumber: "T-PDF-1", offerType: "bu", documents: [] as any[] };
const signed = { signatureImage: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", signedAt: new Date("2026-11-06T10:00:00Z"), place: "Hof", status: "signed", editedFields: {}, extraFields: {} };

const tokens = (s: string) => s.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ")
  .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);

describe("signing forms → Gotenberg PDF", () => {
  it.skipIf(!GOT).each([
    ["vollmacht", (t: any) => t.buildVollmachtHtml(sr, { key: "vollmacht", ...signed }, "pdf")],
    ["abtretung", (t: any) => t.buildAbtretungHtml(sr, { key: "abtretung", ...signed }, "pdf")],
    ["zusatzblatt", (t: any) => t.buildZusatzblattHtml({ ...sr, offerType: "ah" }, { key: "zusatzblatt", ...signed }, "pdf")],
    ["abtretung_ah", (t: any) => t.buildAbtretungAhHtml({ ...sr, offerType: "ah" }, { key: "abtretung_ah", ...signed }, "pdf")],
  ])("%s", async (_k, build) => {
    const html: string = build(tpl);
    const pdf = await new Gotenberg({ baseUrl: GOT! }).htmlToPdf(html);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) text += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(" ");
    const flat = text.replace(/[^\p{L}\p{N}]+/gu, "");
    const missing = [...new Set(tokens(html))].filter((w) => !flat.includes(w));
    expect(missing, `missing in PDF (${doc.numPages} pages)`).toEqual([]);
  }, 60000);
});
