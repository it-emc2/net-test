// routes/da-config.js
// Model source for "Duschabtrennung (neu)". Reads the Vigour model live from
// the "vigor" MongoDB (collection "models", doc _id "vigour"), scraper-refreshed
// daily. Badolux is not in the vigor DB, so it's served from the static file.
//
// The main app connection points at KonfiguratorDB, so the dedicated vigor
// connection comes from external/vigorDb.js.
import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getVigorDb } from "../external/vigorDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const r = Router();


// In-memory cache — the model changes rarely (scraper-refreshed).
let cache = null;
let cacheAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function loadVigourModel() {
  const db = await getVigorDb();
  const doc = await db.collection("models").findOne({ _id: "vigour" });
  if (!doc?.model) throw new Error("vigor.models/_id=vigour not seeded");
  return doc.model;
}

r.get("/model/:supplier", async (req, res) => {
  const { supplier } = req.params;

  // Badolux is not in the vigor DB — serve the existing static file unchanged.
  if (supplier === "badolux") {
    return res.sendFile(
      path.join(__dirname, "..", "public", "configurator", "badolux-model.json"),
    );
  }

  if (supplier !== "vigour") {
    return res.status(404).json({ error: "unknown_supplier" });
  }

  try {
    const now = Date.now();
    if (!cache || now - cacheAt > CACHE_TTL_MS) {
      cache = await loadVigourModel();
      cacheAt = now;
    }
    res.json(cache);
  } catch (e) {
    console.error("[da-config] model refresh failed:", e?.message || e);
    if (cache) return res.json(cache); // serve stale rather than fail a live offer
    res.status(502).json({ error: "vigor_model_unavailable" });
  }
});

export default r;
