// routes/vorhang.js
// Live API for the "Duschvorhang" configurator tab. Reads curtain + rail-system
// products from the SEPARATE "vigor" MongoDB (collection "products"), classified
// by configContext.category ∈ { duschvorhang, vorhangstange }.
//
// The main app connection points at KonfiguratorDB, so we open a dedicated
// connection to the vigor DB. Prefer VIGOR_MONGODB_URI; fall back to MONGODB_URI
// with dbName "vigor" (works when both DBs live on the same cluster/credentials).
import { Router } from "express";
import mongoose from "mongoose";

const r = Router();

let vigorConnPromise = null;
function getVigorDb() {
  if (!vigorConnPromise) {
    const uri = process.env.VIGOR_MONGODB_URI || process.env.MONGODB_URI;
    if (!uri) throw new Error("VIGOR_MONGODB_URI / MONGODB_URI missing");
    const conn = mongoose.createConnection(uri, { dbName: "vigor" });
    vigorConnPromise = conn.asPromise().then((c) => c.db);
  }
  return vigorConnPromise;
}

// Parse the width/length (in mm) a product covers, from its article code + name.
// Curtains: HEWIDV<width_cm>200W → width in cm (e.g. HEWIDV140200W = 140 cm).
// Rails:    DEPVS<len_cm>        → length in cm (e.g. DEPVS150 = 1500 mm = 150 cm).
// Ceiling braces: DEPDS<len_cm>  → brace length (30/50/80 cm), NOT a coverage width.
function parseSizeCm(article, name) {
  const a = String(article || "").toUpperCase();
  let m = a.match(/^HEWIDV(\d{2,3})200W$/); // curtain
  if (m) return Number(m[1]);
  m = a.match(/^DEPVS(\d{2,3})$/); // rod length code (90 = 90cm, 180 = 180cm)
  if (m) return Number(m[1]);
  // fallback: first mm value in the name (e.g. "... 1500mm")
  const mm = String(name || "").match(/(\d{3,4})\s*mm/i);
  if (mm) return Math.round(Number(mm[1]) / 10);
  return null;
}

// Classify a vorhangstange product into rod / mandatory / optional accessory.
function classifyRail(article) {
  const a = String(article || "").toUpperCase();
  if (/^DEPVS\d{2,3}$/.test(a)) return "rod";
  if (a === "DEPVSROS") return "mandatory"; // Befestigungsrosettenpaar — always needed
  return "optional"; // Verbindungsbogen, Kupplung, Deckenstütze …
}

function toItem(d) {
  return {
    articleNumber: d.articleNumber,
    name: d.name || d.articleNumber,
    net: Number(d.netPrice) || 0,
    gross: Number(d.grosPrice) || 0,
    unit: d.unit || "Stück",
    finish: d.finish || null,
    image: Array.isArray(d.images) && d.images.length ? d.images[0] : null,
    sizeCm: parseSizeCm(d.articleNumber, d.name),
  };
}

// Simple in-memory cache — the catalog changes rarely (scraper-refreshed).
let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function loadProducts() {
  const db = await getVigorDb();
  const docs = await db
    .collection("products")
    .find({ "configContext.category": { $in: ["duschvorhang", "vorhangstange"] } })
    .toArray();

  // Dedup by articleNumber (same article can be scraped via multiple paths).
  const seen = new Map();
  for (const d of docs) {
    if (!d.articleNumber || seen.has(d.articleNumber)) continue;
    seen.set(d.articleNumber, d);
  }

  const curtains = [];
  const rods = [];
  const mandatory = [];
  const optional = [];
  for (const d of seen.values()) {
    const item = toItem(d);
    const cat = d.configContext?.category;
    if (cat === "duschvorhang") {
      curtains.push(item);
    } else {
      const role = classifyRail(d.articleNumber);
      if (role === "rod") rods.push(item);
      else if (role === "mandatory") mandatory.push(item);
      else optional.push(item);
    }
  }

  const bySize = (a, b) => (a.sizeCm ?? 1e9) - (b.sizeCm ?? 1e9);
  curtains.sort(bySize);
  rods.sort(bySize);
  optional.sort((a, b) => a.name.localeCompare(b.name, "de"));

  return { curtains, rods, mandatory, optional };
}

r.get("/products", async (_req, res) => {
  try {
    const now = Date.now();
    if (!cache || now - cacheAt > CACHE_TTL_MS) {
      cache = await loadProducts();
      cacheAt = now;
    }
    res.json(cache);
  } catch (e) {
    console.error("[vorhang] products failed:", e?.message || e);
    res.status(502).json({ error: "vigor_products_unavailable" });
  }
});

export default r;
