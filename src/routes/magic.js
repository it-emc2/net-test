// src/routes/magic.js
import express from "express";
import { callExternal } from "../external/magicApi.js";

const router = express.Router();

// -------- Mapping Shower Type -> externer Search-Pfad --------
const KIND_TO_PATH = {
  corner: "/api/eckeinstieg-best-all/search",
  niche: "/api/niche-best-all/search",
  uform: "/api/uform-gleitur-all/search",
  walkin: "/api/walkin-best-all/search",
};

// -------- Health-Forwarding --------
router.get("/health", async (req, res) => {
  try {
    const data = await callExternal("get", "/api/health");
    res.json(data);
  } catch (err) {
    console.error("magic /health failed", err.response?.data || err);
    res.status(500).json({
      error: "External API error",
      detail: err.response?.data || String(err),
    });
  }
});

// -------- Produkte aus externer API holen --------
router.get("/products", async (req, res) => {
  try {
    const data = await callExternal("get", "/api/products", {
      params: req.query,
    });

    // Optional: hier Daten mappen oder in deine eigene Product‑Collection schreiben
    res.json(data);
  } catch (err) {
    console.error("magic /products failed", err.response?.data || err);
    res.status(500).json({
      error: "External API error",
      detail: err.response?.data || String(err),
    });
  }
});

// -------- Best Product Finder: Hassmann-Search-Proxy --------
// POST /api/magic/search
// Body: { kind: "corner"|"niche"|"uform"|"walkin", payload: { ... } }
router.post("/search", async (req, res) => {
  try {
    const { kind, payload } = req.body || {};

    if (!kind || typeof kind !== "string") {
      return res.status(400).json({ error: 'Missing or invalid "kind".' });
    }
    const path = KIND_TO_PATH[kind];
    if (!path) {
      return res.status(400).json({ error: `Unknown shower type: "${kind}".` });
    }
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: 'Missing "payload" object.' });
    }

    // Beispiel-Body (aus deinem Screenshot):
    // {
    //   width: 1200,
    //   depth: 900,
    //   priceRange: { min: 500, max: 2000 },
    //   orientation: "LEFT",
    //   openingTypes: ["GLEITUR", "PANDELTUER"],
    //   isShortSidewall: false
    // }

    const data = await callExternal("post", path, { data: payload });

    // Konsistente Antwortstruktur für das Frontend
    // Falls die externe API direkt ein Array schickt, wrappen wir es in { results: [...] }
    const results = Array.isArray(data) ? data : (data?.results ?? data);

    res.json({ ok: true, kind, path, results });
  } catch (err) {
    console.error("magic /search failed", err.response?.data || err);
    res.status(500).json({
      error: "External API error",
      detail: err.response?.data || String(err),
    });
  }
});

export default router;
