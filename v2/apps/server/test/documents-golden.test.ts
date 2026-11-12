// DOCX golden master against v2: the ported offer-document module (documents/ported) must
// produce exactly the recorded legacy snapshots (offer DOCX + Materialübersicht, 25 cases).
// Same fixtures and normaliser as tests/golden/docs.golden.test.js; in-memory MongoDB.
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BusinessConfig } from "../src/business-config.js";
import { registerDocuments } from "../src/routes/documents.js";
import { vigorPriceFetcher } from "../src/vigor.js";
import { lineDescription } from "../src/documents/ported/docx-text-replace.js";
import { Gotenberg } from "../src/integrations/gotenberg.js";
// @ts-expect-error plain .mjs harness from the legacy golden suite
import { normaliseDocx, selectDocCases, ENDPOINTS } from "../../../../tests/golden/docs-harness.mjs";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const G = ROOT + "tests/golden/fixtures/";
const json = (p: string) => JSON.parse(readFileSync(G + p, "utf8"));
const snapshots = new Map((json("docs/snapshots.json") as any[]).map((s) => [s.id, s]));
const cases: any[] = selectDocCases(json("pricing/cases.json"));

let mongod: MongoMemoryServer;
let app: FastifyInstance;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { dbName: "KonfiguratorDB" });
  const client = mongoose.connection.getClient();
  await client.db("KonfiguratorDB").collection("Products").insertMany(json("docs/products.json"));
  await client.db("vigor").collection("products").insertMany(json("docs/vigor-products.json"));
  const config = json("pricing/config.json");
  const businessConfig = new BusinessConfig(async () => Object.entries(config).map(([key, value]) => ({ key, value })) as any);
  await businessConfig.init({ info() {}, warn() {}, error() {} } as any);
  app = Fastify({ bodyLimit: 25 * 1024 * 1024 });
  const quiet = () => {};
  await registerDocuments(app, {
    businessConfig, fetchVigourNetPrices: vigorPriceFetcher(uri), vigorUri: uri, root: ROOT,
    log: { debug: quiet, warn: quiet, error: quiet },
    pdf: { docxToPdf: async () => Buffer.from("%PDF-test"), htmlToPdf: async () => Buffer.from("%PDF-test") },
  });
  await app.ready();
}, 120000);

afterAll(async () => {
  await app?.close();
  await mongoose.disconnect();
  await mongod?.stop();
  rmSync(ROOT + "out-Materialuebersicht.docx", { force: true });
  rmSync(ROOT + "out-Angebot.docx", { force: true });
});

describe("DOCX golden master — v2 port", () => {
  const rows = cases.flatMap((c) => (ENDPOINTS as any[]).map((ep) => [`${c.id}__${ep.key}`, c, ep]));
  it.each(rows)("%s", async (id, c: any, ep: any) => {
    const res = await app.inject({ method: "POST", url: ep.path, payload: structuredClone(c.payload) });
    expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
    expect(res.headers["content-type"]).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(normaliseDocx(res.rawPayload)).toEqual(snapshots.get(id as string).docx);
  }, 60000);

  // U-014: description and price of single positions changed on the Kosten page.
  it("a reworded and repriced position reaches the offer document (every offer type with material lines)", async () => {
    const seen: Record<string, number> = {};
    for (const c of cases) {
      const type = String(c.offerType || "bu");
      if (!["bu", "bwt", "hl", "bl"].includes(type) || (seen[type] ?? 0) >= 3) continue;
      const before = await app.inject({ method: "POST", url: "/docx-template", payload: structuredClone(c.payload) });
      expect(before.statusCode, `${c.id}: ${before.body.slice(0, 300)}`).toBe(200);
      const textBefore = JSON.stringify(normaliseDocx(before.rawPayload));
      // a material line whose description is printed in this document
      const line = (c.expected?.materialsDisplayDocx?.lines ?? []).find((l: any) => {
        const d = lineDescription(String(l?.label ?? "").replace(/\b(Vigour|TRINNITY|winwall)\b/gi, "").replace(/\s{2,}/g, " "));
        return d.length > 8 && Number(l?.unitPrice) > 0 && textBefore.includes(d) && textBefore.split(d).length === 2;
      });
      if (!line) continue;
      const payload = structuredClone(c.payload);
      payload.offerOverrides = { ...(payload.offerOverrides ?? {}), lineEdits: [{
        block: "material", id: String(line.productId), source: line.source ?? "", origLabel: line.label,
        label: "Sonderanfertigung XYZ nach Aufmaß", unitPriceNet: Number(line.unitPrice) + 1000, origUnitPriceNet: line.unitPrice, reason: "Test",
      }] };
      const after = await app.inject({ method: "POST", url: "/docx-template", payload });
      expect(after.statusCode, c.id).toBe(200);
      const textAfter = JSON.stringify(normaliseDocx(after.rawPayload));
      expect(textAfter, c.id).toContain("Sonderanfertigung XYZ nach Aufmaß");
      expect(textAfter, c.id).not.toBe(textBefore.replace(/Sonderanfertigung XYZ nach Aufmaß/g, "")); // prices moved too
      seen[type] = (seen[type] ?? 0) + 1;
    }
    expect(seen).toEqual({ bu: 3, bwt: 3, hl: 3, bl: 3 });
  }, 120000);

  it("offer PDF goes through the PDF engine", async () => {
    const res = await app.inject({ method: "POST", url: "/docx-template/pdf", payload: structuredClone(cases[0].payload) });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.body).toBe("%PDF-test");
  }, 60000);


  // Real PDF engine (ADR 008). CI runs a Gotenberg service container; locally:
  //   docker run --rm -p 127.0.0.1:3000:3000 gotenberg/gotenberg:8.40.0  + OC_TEST_GOTENBERG_URL=http://127.0.0.1:3000
  const GOT = process.env.OC_TEST_GOTENBERG_URL;
  it.skipIf(!GOT).each(cases.slice(0, 6).map((c) => [c.id, c]))("Gotenberg PDF of %s contains every word of the offer DOCX", async (_id, c: any) => {
    const res = await app.inject({ method: "POST", url: "/docx-template", payload: structuredClone(c.payload) });
    const pdf = await new Gotenberg({ baseUrl: GOT! }).docxToPdf(res.rawPayload);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
    let text = "";
    for (let i = 1; i <= doc.numPages; i++) text += " " + (await (await doc.getPage(i)).getTextContent()).items.map((x: any) => x.str).join(" ");
    // compare letter/digit tokens: layout-only differences (tabs joining words in the DOCX
    // text, page-number fields, checkbox glyphs, direction marks) are not content
    const norm = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, "");
    const words = Object.values(normaliseDocx(res.rawPayload) as Record<string, { paragraphs: string[] }>)
      .flatMap((p) => p.paragraphs).join(" ").replace(/<[A-Z]+>/g, " ")
      .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
    const missing = [...new Set(words)].filter((w) => !norm(text).includes(norm(w)));
    expect(missing, `words missing in PDF (${doc.numPages} pages)`).toEqual([]);
  }, 120000);
});
