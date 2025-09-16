// src/app.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// --- Resolve __dirname (ESM) and key paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT, "src", "public");

// --- App + middleware
const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // keep simple & compatible with inline scripts if any
app.use(cors()); // optionally restrict later to your Back4App URL
app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// --- MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "KonfiguratorDB";

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set");
}

await mongoose.connect(MONGODB_URI, {
  dbName: MONGODB_DB,
});
console.log(`MongoDB connected -> ${MONGODB_DB}`);

// --- Models & logic
import Product from "./models/Product.js";
import Submission from "./models/Submission.js";
import computePrice from "./logic/pricing.js"; // assumes default export = function(payload) -> { items, totals, ... }

// --- API: Products
// Bulk upsert: [{ productId, name, price }, ...]
app.post("/api/products/bulk", async (req, res) => {
  try {
    const docs = Array.isArray(req.body) ? req.body : [];
    if (!docs.length) return res.status(400).json({ error: "Empty payload" });

    const ops = docs.map((d) => ({
      updateOne: {
        filter: { productId: d.productId },
        update: { $set: d },
        upsert: true,
      },
    }));

    const result = await Product.bulkWrite(ops, { ordered: false });
    return res.json({ ok: true, result });
  } catch (err) {
    console.error("bulk products error:", err);
    return res.status(500).json({ error: "Bulk upsert failed" });
  }
});

// Get single product by productId
app.get("/api/products/:id", async (req, res) => {
  try {
    const doc = await Product.findOne({ productId: req.params.id });
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json(doc);
  } catch (err) {
    console.error("get product error:", err);
    return res.status(500).json({ error: "Error fetching product" });
  }
});

// --- API: Pricing
app.post("/api/price", async (req, res) => {
  try {
    const payload = req.body || {};
    const computed = await computePrice(payload);
    return res.json(computed);
  } catch (err) {
    console.error("pricing error:", err);
    return res.status(500).json({ error: "Pricing failed" });
  }
});

// --- API: Submissions
app.post("/api/submissions", async (req, res) => {
  try {
    const { payload, computed } = req.body || {};
    const sub = await Submission.create({
      payload: payload || {},
      computed: computed || null,
      createdAt: new Date(),
    });
    return res.status(201).json({ ok: true, id: sub._id });
  } catch (err) {
    console.error("submission error:", err);
    return res.status(500).json({ error: "Submission failed" });
  }
});

// --- Export routes (PDF/DOCX)
import docxRouter from "./routes/docx-template.js";
import pdfTemplateRouter from "./routes/pdf-template.js";
import pdfRouter from "./routes/pdf.js"; // if this exists as a router in your project

app.use("/docx-template", docxRouter);
app.use("/pdf-template", pdfTemplateRouter);
app.use("/pdf", pdfRouter);

// --- Static SPA & health
app.use(express.static(PUBLIC_DIR));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Serve index.html for the root and any client-side routes
app.get("*", (req, res, next) => {
  // only fall back for GET/HTML requests
  if (req.method !== "GET") return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --- Start server (bind to all interfaces, use platform PORT)
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

export default app;
