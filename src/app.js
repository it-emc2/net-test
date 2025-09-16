// src/app.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// ---------- Paths ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT, "src", "public");

// ---------- App & middleware ----------
const app = express();

// Security headers (looser CSP for inline assets if you have any)
app.use(helmet({ contentSecurityPolicy: false }));

// Optional CORS tightening:
// - Set ALLOWED_ORIGINS="https://your-app.containers.back4app.com,https://example.com"
// - If not set, allow all (safe for same-origin SPA)
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowed.length === 0 || allowed.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error("CORS: origin not allowed"));
    },
    credentials: false,
  })
);

app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------- DB ----------
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "KonfiguratorDB";

// ---------- Models & logic ----------
import Product from "./models/Product.js";
import Submission from "./models/Submission.js";
import computePrice from "./logic/pricing.js"; // keep as-is if your current file works

// ---------- API: Products ----------
app.post("/api/products/bulk", async (req, res) => {
  try {
    const docs = Array.isArray(req.body) ? req.body : [];
    if (!docs.length) return res.status(400).json({ error: "Empty payload" });

    const ops = docs.map(d => ({
      updateOne: {
        filter: { productId: d.productId },
        update: { $set: d },
        upsert: true,
      },
    }));
    const result = await Product.bulkWrite(ops, { ordered: false });
    res.json({ ok: true, result });
  } catch (err) {
    console.error("bulk products error:", err);
    res.status(500).json({ error: "Bulk upsert failed" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const doc = await Product.findOne({ productId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error("get product error:", err);
    res.status(500).json({ error: "Error fetching product" });
  }
});

// ---------- API: Pricing ----------
app.post("/api/price", async (req, res) => {
  try {
    const payload = req.body || {};
    const computed = await computePrice(payload);
    res.json(computed);
  } catch (err) {
    console.error("pricing error:", err);
    res.status(500).json({ error: "Pricing failed" });
  }
});

// ---------- API: Submissions ----------
app.post("/api/submissions", async (req, res) => {
  try {
    const { payload, computed } = req.body || {};
    const sub = await Submission.create({
      payload: payload || {},
      computed: computed || null,
      createdAt: new Date(),
    });
    res.status(201).json({ ok: true, id: sub._id });
  } catch (err) {
    console.error("submission error:", err);
    res.status(500).json({ error: "Submission failed" });
  }
});

// ---------- Export routes (PDF/DOCX) ----------
import { router as docxRouter } from "./routes/docx-template.js";
import { router as pdfTemplateRouter } from "./routes/pdf-template.js";
// If you also have a generic /pdf router, keep this; otherwise you can remove:
// import { router as pdfRouter } from "./routes/pdf.js";

app.use("/docx-template", docxRouter);
console.log("Mounted: POST /docx-template");

app.use("/pdf-template", pdfTemplateRouter);
console.log("Mounted: POST /pdf-template");

// If you have ./routes/pdf.js:
// app.use("/pdf", pdfRouter);
// console.log("Mounted:   /pdf");

// ---------- Static SPA with caching ----------
app.use(
  express.static(PUBLIC_DIR, {
    maxAge: "1d",
    etag: true,
    lastModified: true,
  })
);

// Health / readiness (useful for probes & debugging)
app.get("/healthz", (_req, res) => res.status(200).send("ok"));
app.get("/readyz", (_req, res) => {
  const up = mongoose.connection.readyState === 1; // 1 = connected
  res.status(up ? 200 : 503).json({ db: up ? "up" : "down" });
});

// SPA fallback
app.get("*", (req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ---------- Start / Shutdown ----------
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
let server;

async function start() {
  try {
    if (!MONGODB_URI) throw new Error("MONGODB_URI is not set");
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log(`MongoDB connected -> ${MONGODB_DB}`);

    server = app.listen(PORT, HOST, () => {
      const bound = `http://${HOST}:${PORT}`;
      const localHint = `http://localhost:${PORT}`;
      console.log(`Server listening on ${bound} (local hint: ${localHint})`);

      [
        "POST /pdf-template",
        "POST /docx-template",
        "POST /api/products/bulk",
        "GET  /api/products/:id",
        "POST /api/price",
        "POST /api/submissions",
      ].forEach(r => console.log(`Mounted: ${r}`));
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}
start();

// Graceful shutdown (for rolling deploys)
async function shutdown() {
  console.log("Shutting down...");
  try {
    if (server) {
      await new Promise(resolve => server.close(resolve));
      console.log("HTTP server closed");
    }
  } catch {}
  try {
    await mongoose.connection.close();
    console.log("Mongo connection closed");
  } catch {}
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
