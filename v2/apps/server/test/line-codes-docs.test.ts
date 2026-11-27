// Kürzel je Produkt (owner 2026-11-27) — the customer documents. The section headings carry no
// supplier Kürzel any more („WANDVERKLEIDUNG“, not „WANDVERKLEIDUNG · WV-HM“); each line of
// Fußboden, Wandverkleidung, Duschwanne and Duschabtrennung ends with the Kürzel of ITS supplier,
// only for that supplier's own products (@oc/pricing lineSupplierCode); „Qualität und Normen“ once
// per Kürzel present in the section that has a sentence, after its rows. BU offers only. The
// Materialübersicht (Bestellliste) and the Arbeitsbericht are not customer offers: unchanged.
// Real fixture: the recorded case offers-bu-KK-d43bbe (VIGOUR wall, VIGOUR leftover floor, Slate tray,
// VIGOUR shower screen) and variants of it.
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
const B2 = "Qualität und Normen: Brandklasse B2 nach DIN 4102-1";
const SLATE = "Qualität und Normen: Rutschfestigkeit Klasse C nach DIN 51097";
const SEALING = "- 1 Stk Wandabdichtung BASIS-Set 5 qm DW bis 100 x 100 / BW bis 180 x 80 cm";
/** the same customer, the floor in winwall plates bought (2 × 100 × 250 cm, WS 229) */
const winwallFloor = () => {
  const p = structuredClone(CASE.payload);
  Object.assign(p.duschwanne, { wallCladdingSupplier: "ww", wallCladdingWwDecor: "WS229", wallCladdingWwQty: '{"13":0,"15":2,"16":0,"17":0}', wallCladdingUseLeftover: undefined });
  return p;
};
/** the same customer, the wall in Badolux Standard rows (Keramico) with winwall's profiles and sealing */
const badoluxWall = () => {
  const p = structuredClone(CASE.payload);
  p.wandverkleidung = { wvEnabled: true, wvBudgetMode: "1", wvKRows: JSON.stringify([{ pid: "WP001", name: "Standard-Dekor Marmor weiß", qty: 3 }]), wvWw_WS80113: true, wvWwQty_WS80113: "2", wvWwSealing: true, wvArea: "6" };
  return p;
};

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
/** the paragraphs of one section: from its heading to the next heading (or the totals) */
const section = (p: string[], heading: string) => {
  const at = p.indexOf(heading);
  expect(at, `${heading} in ${JSON.stringify(p)}`).toBeGreaterThanOrEqual(0);
  const end = p.findIndex((x, i) => i > at && (/^[A-ZÄÖÜ]{4,}$/.test(x) || x === "Nettobetrag"));
  return p.slice(at, end < 0 ? undefined : end);
};

describe("offer document: the Kürzel per product line", () => {
  it("headings without Kürzel; VIGOUR, Slate lines coded; Qualität per Kürzel after the section's rows", async () => {
    const p = await docx("/docx-template", CASE.payload);
    expect(p.filter((x) => / · [A-Z]{2}-[A-Z]{2}$/.test(x) && /^[A-ZÄÖÜ]+ · /.test(x))).toEqual([]); // no heading with a Kürzel
    expect(section(p, "FUSSBODEN")).toEqual([
      "FUSSBODEN", "- 1 Stk Aluverbundplatte (Marmor weiß) · WV-HM", "- 7 Pkg Flächenkleber (1 Pkg je 0.6 m²)", B2,
    ]);
    expect(section(p, "WANDVERKLEIDUNG")).toEqual([
      "WANDVERKLEIDUNG",
      "- 2 Stk Wandverkleidung 3.0 Alu 997×2550 mm — Farbe: Marmor weiß · WV-HM",
      `${SEALING} · WV-HM`,
      "- 4 Pkg Flächenkleber (Wandverkleidung)", // Ramsauer: no supplier of ours
      "- 1 Stk Abschlussprofil 3.0 255 cm silber eloxiert · WV-HM",
      B2,
    ]);
    expect(section(p, "DUSCHWANNE")).toEqual(["DUSCHWANNE", "- 1 Stk Duschwanne 120 x 90 x 3 cm — Farbe: Weiß · DW-SL", SLATE]);
    // VIGOUR shower screen: no Kürzel defined for the Duschabtrennung
    expect(section(p, "DUSCHABTRENNUNG").slice(1).every((x) => !/ · [A-Z]{2}-[A-Z]{2}$/.test(x))).toBe(true);
    // Kleinmaterial / Zubehör never carry one
    expect(section(p, "KLEINMATERIAL").concat(section(p, "ZUBEHÖR")).some((x) => / · [A-Z]{2}-[A-Z]{2}$/.test(x))).toBe(false);
  }, 60000);

  it("winwall floor + VIGOUR wall: each section its own supplier's Kürzel, no B2 sentence under the winwall floor", async () => {
    const p = await docx("/docx-template", winwallFloor());
    expect(section(p, "FUSSBODEN")).toEqual([
      "FUSSBODEN", "- 2 Stk Aluverbundplatte 1000×2500 mm — Dekor: Struktur steingrau (WS 229) · WV-WW", "- 7 Pkg Flächenkleber (1 Pkg je 0.6 m²)",
    ]);
    expect(section(p, "WANDVERKLEIDUNG").filter((x) => x.endsWith("· WV-HM"))).toHaveLength(3);
    expect(section(p, "WANDVERKLEIDUNG").at(-1)).toBe(B2);
  }, 60000);

  it("Badolux panels with winwall's profiles and sealing in one section: per product, not per section", async () => {
    const p = await docx("/docx-template", badoluxWall());
    const wv = section(p, "WANDVERKLEIDUNG");
    expect(wv[0]).toBe("WANDVERKLEIDUNG");
    expect(wv.filter((x) => x.endsWith(" · WV-BX"))).toEqual([expect.stringMatching(/^- 3 Stk Wandpaneel 950×2550 mm/)]);
    expect(wv.filter((x) => x.endsWith(" · WV-WW"))).toHaveLength(2); // Verbindungsprofil, Abdichtungsset
    expect(wv.some((x) => x.startsWith("Qualität und Normen"))).toBe(false); // neither Kürzel has a sentence
  }, 60000);

  it("signing page: the same lines as the offer", async () => {
    const { data } = (await signing.renderData(structuredClone(CASE.payload))) as any;
    const lines = (data.MaterialsLines as any[]).map((r) => r.MaterialLine);
    expect(lines).toContain("WANDVERKLEIDUNG");
    expect(lines).toContain("- 1 Stk Duschwanne 120 x 90 x 3 cm — Farbe: Weiß · DW-SL");
    expect(lines).not.toContain("WANDVERKLEIDUNG · WV-HM");
  }, 60000);

  it("not customer offers: Arbeitsbericht lists the plain lines, Materialübersicht as before", async () => {
    const ab = await docx("/arbeitsbericht/docx", CASE.payload);
    expect(ab.filter((x) => x.includes("Wandabdichtung BASIS-Set 5 qm"))).toHaveLength(1);
    expect(ab.some((x) => / · (WV|DW)-[A-Z]{2}$/.test(x))).toBe(false);
    const mo = await docx("/docx-template/material-overview", CASE.payload);
    expect(mo.some((x) => / · (WV|DW)-[A-Z]{2}$/.test(x) && x.startsWith("- "))).toBe(false);
  }, 60000);
});
