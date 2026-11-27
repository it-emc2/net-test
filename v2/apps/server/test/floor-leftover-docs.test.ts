// Floor covered only by leftovers of the Wandverkleidung (owner 2026-11-26, ADR 031) — the documents.
// Customer documents (offer DOCX/PDF, signing page) list „- 1 Stk Aluverbundplatte …“ under FUSSBODEN,
// before the Flächenkleber, without a price and without a word about leftovers. Order / cost documents
// (Materialübersicht = Bestellliste + Hassmann/winwall basis, product images, Kalkulation) do not see it.
// Real fixture: the recorded VIGOUR case offers-bu-KK-d43bbe (Marmor weiß, 4 m², „Reste anrechnen“).
import { readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BusinessConfig } from "../src/platform/business-config.js";
import { registerDocuments } from "../src/modules/documents/routes.js";
import { vigorPriceFetcher } from "../src/integrations/vigor.js";
// @ts-expect-error plain .mjs harness from the legacy golden suite
import { normaliseDocx } from "../../../../tests/golden/docs-harness.mjs";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const G = ROOT + "tests/golden/fixtures/";
const json = (p: string) => JSON.parse(readFileSync(G + p, "utf8"));
const CASE = (json("pricing/cases.json") as any[]).find((c) => c.id === "offers-bu-KK-d43bbe");
const LINE = "- 1 Stk Aluverbundplatte (Marmor weiß)";
/** in the customer offer the line ends with its supplier's Kürzel (owner 2026-11-27): a VIGOUR plate */
const OFFER_LINE = `${LINE} · WV-HM`;
/** the same customer with the floor bought (2 panels) — no display line */
const bought = () => { const p = structuredClone(CASE.payload); Object.assign(p.duschwanne, { wallCladdingQty: "2", wallCladdingPanelSize: "997", wallCladdingUseLeftover: undefined }); return p; };

let mongod: MongoMemoryServer;
let app: FastifyInstance;
let signing: Awaited<ReturnType<typeof registerDocuments>>["signingRenderer"];

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
  ({ signingRenderer: signing } = await registerDocuments(app, {
    businessConfig, fetchVigourNetPrices: vigorPriceFetcher(uri), vigorUri: uri, root: ROOT,
    log: { debug: quiet, warn: quiet, error: quiet },
    pdf: { docxToPdf: async () => Buffer.from("%PDF-test"), htmlToPdf: async () => Buffer.from("%PDF-test") },
  }));
  await app.ready();
}, 120000);

afterAll(async () => {
  await app?.close();
  await mongoose.disconnect();
  await mongod?.stop();
  rmSync(ROOT + "out-Materialuebersicht.docx", { force: true });
  rmSync(ROOT + "out-Angebot.docx", { force: true });
});

const docx = async (url: string, payload: unknown) => {
  const res = await app.inject({ method: "POST", url, payload: structuredClone(payload) as any });
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200);
  return normaliseDocx(res.rawPayload)["word/document.xml"].paragraphs as string[];
};

describe("leftover-only floor in the documents (ADR 031)", () => {
  it("offer DOCX: the plate under FUSSBODEN before the Flächenkleber, no price, no leftover word; total as recorded", async () => {
    const p = await docx("/docx-template", CASE.payload);
    const at = p.indexOf("FUSSBODEN");
    expect(p.slice(at, at + 3)).toEqual(["FUSSBODEN", OFFER_LINE, "- 7 Pkg Flächenkleber (1 Pkg je 0.6 m²)"]);
    expect(p.filter((x) => x.includes("Aluverbundplatte"))).toEqual([OFFER_LINE]);
    expect(p.join("\n")).not.toMatch(/aus Resten|Reste aus|Resten der Wandverkleidung/i);
    // the recorded total of the case, to the cent
    const total = String(CASE.expected.total.toFixed(2)).replace(".", ",");
    expect(p.join("\n")).toContain(total.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
  }, 60000);

  it("winwall: the floor's Dekor in the plates' wording, with winwall's Kürzel", async () => {
    const payload = structuredClone(CASE.payload);
    Object.assign(payload.duschwanne, { wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS229", wallCladdingWwQty: "", wallCladdingQty: "0" });
    const p = await docx("/docx-template", payload);
    const at = p.indexOf("FUSSBODEN");
    expect(p.slice(at, at + 3)).toEqual(["FUSSBODEN", "- 1 Stk Aluverbundplatte — Dekor: Struktur steingrau (WS 229) · WV-WW", "- 7 Pkg Flächenkleber (1 Pkg je 0.6 m²)"]);
    expect(p.join("\n")).not.toMatch(/aus Resten|Resten der Wandverkleidung/i);
  }, 60000);

  it("with plates bought there is no extra line: the floor lists the panels as before", async () => {
    const p = await docx("/docx-template", bought());
    const at = p.indexOf("FUSSBODEN");
    expect(p[at + 1]).toBe("- 2 Stk Aluverbundplatte (Marmor weiß) · WV-HM");
    expect(p.filter((x) => x.includes("Aluverbundplatte"))).toEqual(["- 2 Stk Aluverbundplatte (Marmor weiß) · WV-HM"]);
  }, 60000);

  it("signing page: the same position list as the offer", async () => {
    const { data } = (await signing.renderData(structuredClone(CASE.payload))) as any;
    expect((data.MaterialsLines as any[]).map((r) => r.MaterialLine)).toContain(OFFER_LINE);
    const html = String(await signing.angebotHtml(data, {}));
    expect(html).toContain("1 Stk Aluverbundplatte (Marmor weiß)");
    expect(html).not.toMatch(/aus Resten|Resten der Wandverkleidung/i);
  }, 60000);

  it("Materialübersicht (Bestellliste, Hassmann/winwall basis) and product images: no plate", async () => {
    const p = await docx("/docx-template/material-overview", CASE.payload);
    expect(p.join("\n")).not.toContain("Aluverbundplatte");
    expect(p).toContain("R_4260602"); // the adhesive is there, by its article
    const list = await app.inject({ method: "POST", url: "/api/email/product-image-list", payload: { payload: structuredClone(CASE.payload) } });
    expect(list.statusCode).toBe(200);
    for (const prod of (list.json() as any).products ?? []) expect(prod.productId).toBeTruthy();
    expect(JSON.stringify(list.json())).not.toContain("Aluverbundplatte");
  }, 60000);

  it("Kalkulation (internal costs): no cost row for the plate; sums from the priced lines", async () => {
    const p = await docx("/kalkulation/docx", CASE.payload);
    expect(p.join("\n")).not.toContain("Aluverbundplatte");
    expect(p).toContain("Material"); // the material cost rows are there (Kostenart)
  }, 60000);

  it("Arbeitsbericht: shows the offer's line (the customer's wording), no leftover word", async () => {
    const p = await docx("/arbeitsbericht/docx", CASE.payload);
    expect(p).toContain(LINE);
    expect(p.join("\n")).not.toMatch(/aus Resten|Resten der Wandverkleidung/i);
  }, 60000);
});
