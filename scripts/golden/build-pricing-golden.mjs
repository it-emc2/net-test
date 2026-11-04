#!/usr/bin/env node
// Builds the pricing golden master from the LOCAL replica (never prod).
// For a stratified sample of real offers + drafts it records:
//   - the anonymised payload,
//   - every Product / vigor price the engine looked up,
//   - the effective config,
//   - the CURRENT engine output (= expected value for the rewrite).
// Output: tests/golden/fixtures/pricing/*.json   Run: node scripts/golden/build-pricing-golden.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const LOCAL = "mongodb://127.0.0.1:27018";
// Hard guard: the engine's vigor lookup must resolve to the local replica too.
process.env.MONGODB_URI = LOCAL;
process.env.VIGOR_MONGODB_URI = LOCAL;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "tests/golden/fixtures/pricing");
const PER_GROUP = { offers: 10, drafts: 6 };

const { default: pricingCore } = await import(join(ROOT, "src/logic/pricing-core.js"));
const { CONFIG_SCHEMA } = await import(join(ROOT, "src/services/configService.js"));
const { fetchVigourNetPrices } = await import(join(ROOT, "src/external/vigorDb.js"));

const client = new MongoClient(LOCAL, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db("KonfiguratorDB");

// ---------- config: schema defaults overridden by appconfigs (as configService does)
const config = Object.fromEntries(CONFIG_SCHEMA.map((c) => [c.key, c.value]));
for (const row of await db.collection("appconfigs").find().toArray()) config[row.key] = row.value;
const cfg = { get: (k, fb) => (k in config ? config[k] : fb) };

// ---------- anonymisation (applied BEFORE computing, so expected matches the stored payload)
const PII_SECTIONS = ["Kundendaten", "mail", "postal", "signature", "zusammenfassung"];
const PII_TOP = ["ourSignatureUser", "auftragId", "customerNumber", "dealId"];
let anonCounter = 0;
function anonValue(v, key) {
  if (typeof v !== "string" || v === "") return v;
  // keep enum-like values the engine branches on
  if (/^(payer|anrede|salutation|pflegegrad|bundesland|state|kunde(n)?typ|wohnsituation|zugang)$/i.test(key)) return v;
  if (/phone|tel|mobil|fax|handy/i.test(key)) return "0000000000";
  if (/mail/i.test(key)) return `anon${++anonCounter}@example.invalid`;
  if (/plz|postal|zip/i.test(key)) return "95028";
  if (/datum|date|geburt|birth|seit/i.test(key)) return "2000-01-01";
  if (/versich|kvnr|insur|nummer|number|nr$/i.test(key) && /\d{5,}/.test(v)) return "X000000000";
  if (/^(Kassenkunde|Selbstzahler|KK|SZ|ja|nein|on|off|true|false|Frau|Herr|\d{1,6}([.,]\d+)?)$/i.test(v)) return v;
  return `ANON_${key}`;
}
function anonDeep(o, key = "") {
  if (Array.isArray(o)) return o.map((x) => anonDeep(x, key));
  if (o && typeof o === "object") {
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, anonDeep(v, k)]));
  }
  return anonValue(o, key);
}
function stripBlobs(o) {
  if (Array.isArray(o)) return o.map(stripBlobs);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, stripBlobs(v)]));
  if (typeof o === "string" && o.startsWith("data:") && o.length > 256) return "data:removed";
  return o;
}
const FREE_TEXT_KEY = /(note|notiz|bemerk|comment|kommentar|hinweis|freitext|text)$/i;
const isGeneric = (v) => v.length < 4 || /^(Kassenkunde|Selbstzahler|ja|nein|true|false|Frau|Herr|Divers|\d{1,6}([.,]\d+)?)$/i.test(v);
function scrubFreeText(o, key = "") {
  if (Array.isArray(o)) return o.map((x) => scrubFreeText(x, key));
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, scrubFreeText(v, k)]));
  if (typeof o === "string" && o.trim() && FREE_TEXT_KEY.test(key)) return "ANON_text";
  return o;
}
function replaceTokens(o, tokens) {
  if (Array.isArray(o)) return o.map((x) => replaceTokens(x, tokens));
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, replaceTokens(v, tokens)]));
  if (typeof o === "string") { let s = o; for (const t of tokens) if (s.includes(t)) s = s.split(t).join("ANON"); return s; }
  return o;
}
function collectTokens(o, out = new Set()) {
  if (Array.isArray(o)) o.forEach((x) => collectTokens(x, out));
  else if (o && typeof o === "object") Object.values(o).forEach((v) => collectTokens(v, out));
  else if (typeof o === "string" && !isGeneric(o.trim()) && !o.startsWith("data:")) out.add(o.trim());
  return out;
}
function anonymise(payload) {
  let p = stripBlobs(structuredClone(payload));
  // every non-generic string from the customer sections is scrubbed wherever it appears
  const tokens = new Set();
  for (const s of PII_SECTIONS) if (p[s]) collectTokens(p[s], tokens);
  for (const k of PII_TOP) if (typeof p[k] === "string" && !isGeneric(p[k])) tokens.add(p[k]);
  for (const s of PII_SECTIONS) if (p[s]) p[s] = anonDeep(p[s], s);
  for (const k of PII_TOP) if (k in p && p[k]) p[k] = anonValue(String(p[k]), k);
  p = scrubFreeText(p);
  return replaceTokens(p, [...tokens].sort((a, b) => b.length - a.length));
}

// ---------- sampling
const typeOf = (p) => String(p?.activeOffer || p?.currentOfferKey || p?.offerType || "bu").toLowerCase();
const payerOf = (p) => {
  const v = String(p?.Kundendaten?.payer || p?.services?.payer || "").toLowerCase();
  return v.startsWith("kass") || v === "kk" ? "KK" : v.startsWith("selbst") || v === "sz" ? "SZ" : "?";
};
async function sample(coll, dateField, perGroup) {
  const groups = new Map();
  const cur = db.collection(coll).find({ payload: { $type: "object" } }).sort({ [dateField]: -1 });
  for await (const d of cur) {
    const g = `${typeOf(d.payload)}|${payerOf(d.payload)}`;
    const arr = groups.get(g) || [];
    const limit = ["ah", "hms", "wd"].includes(typeOf(d.payload)) ? 2 : perGroup;
    if (arr.length < limit) arr.push(d);
    groups.set(g, arr);
  }
  return [...groups.values()].flat();
}

// ---------- recording dependencies
const productsSeen = new Map();
const productColl = db.collection("Products");
const ProductModel = {
  find(q) {
    return { lean: async () => {
      const docs = await productColl.find(q).toArray();
      for (const d of docs) productsSeen.set(d.productId, d);
      for (const id of q?.productId?.$in || []) if (!productsSeen.has(id)) productsSeen.set(id, null);
      return docs;
    } };
  },
  findOne(q) {
    return { lean: async () => {
      const d = await productColl.findOne(q);
      productsSeen.set(q.productId, d);
      return d;
    } };
  },
};
const vigorSeen = new Map();
async function recordingVigor(ids) {
  const m = await fetchVigourNetPrices(ids);
  for (const id of ids) vigorSeen.set(id, m.has(id) ? m.get(id) : null);
  return m;
}
const { computePrices } = pricingCore(ProductModel, { cfg, fetchVigourNetPrices: recordingVigor });

// ---------- build
const cases = [];
const stats = { total: 0, sameTotalAsStored: 0, storedComparable: 0 };
for (const [coll, dateField] of [["offers", "createdAt"], ["drafts", "savedAt"]]) {
  for (const d of await sample(coll, dateField, PER_GROUP[coll])) {
    const payload = anonymise(d.payload);
    // No offer-number cache/snapshot lookups (no Offer/Draft model) → pure engine output.
    // NOTE: computePrices mutates its input → compute on a clone, store the pristine payload.
    const result = JSON.parse(JSON.stringify(await computePrices(structuredClone(payload))));
    const id = `${coll}-${typeOf(payload)}-${payerOf(payload)}-${String(d._id).slice(-6)}`;
    cases.push({ id, source: coll, offerType: typeOf(payload), payer: payerOf(payload), payload, expected: result });
    stats.total++;
    if (typeof d.pricing?.total === "number" && typeof result.total === "number") {
      stats.storedComparable++;
      if (Math.abs(d.pricing.total - result.total) < 0.005) stats.sameTotalAsStored++;
    }
  }
}

mkdirSync(OUT, { recursive: true });
const clean = (d) => (d ? Object.fromEntries(Object.entries(d).filter(([k]) => k !== "_id")) : null);
writeFileSync(join(OUT, "cases.json"), JSON.stringify(cases, null, 1));
writeFileSync(join(OUT, "products.json"), JSON.stringify(Object.fromEntries([...productsSeen].map(([k, v]) => [k, clean(v)])), null, 1));
writeFileSync(join(OUT, "vigor.json"), JSON.stringify(Object.fromEntries(vigorSeen), null, 1));
writeFileSync(join(OUT, "config.json"), JSON.stringify(config, null, 1));
writeFileSync(join(OUT, "meta.json"), JSON.stringify({
  builtAt: new Date().toISOString(),
  source: "local replica 127.0.0.1:27018",
  stats,
  groups: Object.fromEntries(Object.entries(cases.reduce((a, c) => ((a[`${c.source}|${c.offerType}|${c.payer}`] = (a[`${c.source}|${c.offerType}|${c.payer}`] || 0) + 1), a), {}))),
}, null, 1));
console.log(JSON.stringify({ cases: cases.length, products: productsSeen.size, vigor: vigorSeen.size, stats }, null, 1));
await client.close();
process.exit(0);
