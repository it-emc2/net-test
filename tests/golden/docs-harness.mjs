// Shared harness for the document golden master (used by the builder script AND the test).
// Runs the REAL docx-template router in-process against an in-memory MongoDB seeded with
// the catalog snapshot from fixtures/docs — no replica, no prod, no network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import PizZip from "pizzip";
import { MongoMemoryServer } from "mongodb-memory-server";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DOCS_DIR = join(HERE, "fixtures/docs");
export const PRICING_DIR = join(HERE, "fixtures/pricing");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export const ENDPOINTS = [
  { key: "offer", path: "/docx-template" },
  { key: "material", path: "/docx-template/material-overview" },
];

let mongod;
let app;

export async function startHarness() {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;           // vigorDb falls back to this (dbName "vigor")
  process.env.VIGOR_MONGODB_URI = uri;
  await mongoose.connect(uri, { dbName: "KonfiguratorDB" });

  const products = readJson(join(DOCS_DIR, "products.json"));
  const vigorProducts = readJson(join(DOCS_DIR, "vigor-products.json"));
  const config = readJson(join(PRICING_DIR, "config.json"));
  const client = mongoose.connection.getClient();
  if (products.length) await client.db("KonfiguratorDB").collection("Products").insertMany(products);
  if (vigorProducts.length) await client.db("vigor").collection("products").insertMany(vigorProducts);

  const { default: cfg } = await import("../../src/services/configService.js");
  cfg._cache = new Map(Object.entries(config));

  const { default: docxRouter } = await import("../../src/routes/docx-template.js");
  app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use("/docx-template", docxRouter);
}

export async function stopHarness() {
  await mongoose.disconnect().catch(() => {});
  const { getVigorDb } = await import("../../src/external/vigorDb.js");
  try { (await getVigorDb())?.close?.(); } catch { /* not opened */ }
  await mongod?.stop();
}

export async function renderDocx(path, payload) {
  const res = await request(app).post(path).send(payload).buffer(true)
    .parse((r, cb) => { const chunks = []; r.on("data", (c) => chunks.push(c)); r.on("end", () => cb(null, Buffer.concat(chunks))); });
  return { status: res.status, body: res.body };
}

const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENT[m]);

/** DOCX buffer → stable, diff-friendly snapshot (text per paragraph + structure counts). */
export function normaliseDocx(buf, { today = new Date() } = {}) {
  const zip = new PizZip(buf);
  const parts = Object.keys(zip.files)
    .filter((n) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(n))
    .sort();
  const d = String(today.getDate()).padStart(2, "0");
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const y = String(today.getFullYear());
  const todayRe = new RegExp(`\\b(${d}\\.${m}\\.${y}|${y}-${m}-${d}|${Number(d)}\\.${Number(m)}\\.${y})\\b`, "g");
  const out = {};
  for (const name of parts) {
    const xml = zip.file(name).asText();
    const paragraphs = xml.split(/<\/w:p>/).map((p) =>
      decode([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]).join(""))
        .replace(todayRe, "<TODAY>")
        .replace(/ANG-\d{13}/g, "ANG-<ts>")
        // letterhead: personal names never land in fixtures (org rule: initials only)
        .replace(/\b(EmC2|emc2)\s+[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+/g, "$1 <OWNER>")
        .replace(/((?:Inhaber|Geschäftsführer|Geschaeftsfuehrer):\s*).+/g, "$1<OWNER>")
        .trim(),
    ).filter(Boolean);
    out[name] = {
      tables: (xml.match(/<w:tbl>/g) || []).length,
      images: (xml.match(/<w:drawing>/g) || []).length,
      paragraphs,
    };
  }
  return out;
}

/** Deterministic subset of the pricing cases used for documents. */
export function selectDocCases(pricingCases, perGroup = 2) {
  const seen = new Map();
  return pricingCases.filter((c) => {
    const g = `${c.offerType}|${c.payer}`;
    const n = seen.get(g) || 0;
    if (n >= perGroup) return false;
    seen.set(g, n + 1);
    return true;
  });
}
