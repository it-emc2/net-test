// Duschabtrennung (neu) configurator: serves the prebuilt parametric product
// models (Vigour ~11 MB / Badolux) lazily, plus the product images.
// The models are self-priced ("component-model" schemaVersion 2); the React
// wizard reads them client-side and emits lines into payload.duschabtrennung.quickAdd.
import { Router, type Request, type Response } from "express";
import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { requireAuth } from "../middleware/authGate.js";

const router = Router();
router.use(requireAuth);

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dir, "../../data/duschabtrennung");

const SUPPLIERS: Record<string, string> = {
  vigour: "vigour.json",
  badolux: "badolux.json",
};

// In-memory cache — the model is large and immutable at runtime.
const cache = new Map<string, unknown>();

// GET /api/duschabtrennung/model/:supplier  (vigour | badolux)
router.get("/model/:supplier", async (req: Request, res: Response) => {
  const supplier = String(req.params.supplier || "").toLowerCase();
  const file = SUPPLIERS[supplier];
  if (!file) return res.status(404).json({ error: "Unbekannter Lieferant" });
  try {
    if (!cache.has(supplier)) {
      const raw = await readFile(resolve(DATA_DIR, file), "utf-8");
      cache.set(supplier, JSON.parse(raw));
    }
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.json(cache.get(supplier)); // compression middleware gzips this
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[duschabtrennung] model load error:", err);
    return res.status(500).json({ error: "Modell konnte nicht geladen werden" });
  }
});

// Product images. Served from a directory (env DA_ASSETS_DIR) so the 167 MB
// asset set is NOT duplicated in the repo; defaults to the legacy configurator
// assets for local dev.
// Dev default points at the legacy configurator assets (repo root is 8 levels up
// from this file inside the worktree). Override in any real deploy via DA_ASSETS_DIR.
const ASSETS_DIR =
  process.env.DA_ASSETS_DIR ||
  resolve(__dir, "../../../../../../../../src/public/configurator/assets");
router.use("/assets", express.static(ASSETS_DIR, { fallthrough: true, maxAge: "7d" }));

export default router;
