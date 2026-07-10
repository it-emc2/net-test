// routes/da-config.js
// DB-backed model source for the "Duschabtrennung (DB-Test)" developer clone
// (Task C, Part 1). Serves the SAME model JSON shape the static file provides,
// but reads the Vigour model live from the "vigor" MongoDB (collection "models",
// doc _id "vigour"). Badolux is not in the vigor DB, so it falls through to the
// existing static file. The live "Duschabtrennung (neu)" section is untouched.
//
// The main app connection points at KonfiguratorDB, so we open a dedicated
// connection to the vigor DB (prefer VIGOR_MONGODB_URI; fall back to MONGODB_URI
// with dbName "vigor"). Mirrors the pattern in routes/vorhang.js.
import { Router } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
    console.error("[da-config] model failed:", e?.message || e);
    res.status(502).json({ error: "vigor_model_unavailable" });
  }
});

export default r;
