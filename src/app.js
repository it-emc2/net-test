// src/app.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// --- Resolve paths (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = process.cwd();
const PUBLIC_DIR = path.resolve(ROOT, "src", "public");

// --- App + middleware
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors()); // tighten later to your Back4App URL if desired
app.use(compression());
app.use(morgan("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Models & logic
import Product from "./models/Product.js";
import Submission from "./models/Submission.js";
import computePrice from "./logic/pricing.js"; // adjust if it's a named export

// --- API: Products
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

// --- API: Pricing
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

// --- API: Submissions
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

// --- Export routes (PDF/DOCX)
import docxRouter from "./routes/docx-template.js";
import pdfTemplateRouter from "./routes/pdf-template.js";
import pdfRouter from "./routes/pdf.js"; // if your project has this

app.use("/docx-template", docxRouter);
app.use("/pdf-template", pdfTemplateRouter);
app.use("/pdf", pdfRouter);

// --- Static SPA & health
app.use(express.static(PUBLIC_DIR));

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.get("*", (req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --- Start server AFTER DB connects (no top-level await)
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "KonfiguratorDB";

async function start() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set");
    }

    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    console.log(`MongoDB connected -> ${MONGODB_DB}`);

    app.listen(PORT, HOST, () => {
      console.log(`Server listening on http://${HOST}:${PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    // Exit so the platform restarts the container
    process.exit(1);
  }
}

start();

export default app;
