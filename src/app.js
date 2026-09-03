import "dotenv/config";
import { execSync } from "child_process";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import mongoose from "mongoose";
import offersRouter from "./routes/offers.js";
import draftsRouter from "./routes/drafts.js";
import Service from "./models/Service.js"; // <‑‑ NEU
import traysRouter from "./routes/trays.js";
import vorhangRouter from "./routes/vorhang.js";
import daConfigRouter from "./routes/da-config.js";
import magicRouter from "./routes/magic.js";
import customersRouter from "./routes/customers.js";
import bitrixRouter from "./routes/bitrix.js";
import routingRouter from "./routes/routing.js";
import postRouter from "./routes/post.js";
//import pdfPreviewRouter from "./routes/pdf-preview.js";
import pdfPreviewRouter from "./routes/pdf-preview.js";
// PDF/DOCX routes
import { router as pdfRouter } from "./routes/pdf.js";
import pdfTemplateRouter from "./routes/pdf-template.js";
import docxTemplateRouter from "./routes/docx-template.js";
import { router as materialOverviewRouter } from "./routes/material-overview.js";
import adobePdfRouter from "./routes/adobe-pdf.js";
import arbeitsberichtRouter from "./routes/arbeitsbericht.js";
import kalkulationRouter from "./routes/kalkulation.js";
import bathtubsRouter from "./routes/bathtubs.js";
import planningRouter from "./routes/planning.js";
import { router as hlParseRouter } from "./routes/hl-parse.js";

// Models (ESM default exports)
import Product from "./models/Product.js";
import Submission from "./models/Submission.js";
import Offer from "./models/Offer.js"; // (ESM import)
import emailRouter from "./routes/email.js";
import todaysCustomersRouter from "./routes/todayscustomers.js"; // <‑‑ NEW
import signingRouter, { signingPageHandler } from "./routes/signing.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import { authGate } from "./middleware/authGate.js";

// Pricing logic (factory(Product))
import pricingFactory from "./logic/pricing.js";

// app.txt (top imports)
import latexTemplateRouter from "./routes/latex-template.js";
import adminRouter from "./routes/admin.js";
import configService, { CONFIG_SCHEMA } from "./services/configService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "KonfiguratorDB";

process.env.PDFJS_DISABLE_WORKER = "true";

let APP_BUILD_ID;
if (process.env.FLY_IMAGE_REF) {
  // Fly.io: same value across all instances of a deploy, changes on new deploy
  APP_BUILD_ID = process.env.FLY_IMAGE_REF;
} else {
  try {
    // Local dev: git hash is stable across nodemon restarts, changes on commit
    APP_BUILD_ID = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    APP_BUILD_ID = Date.now().toString();
  }
}

// ---------------- Helmet / CSP ----------------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],

        // Allow embedding external pages in iframes on *your* site
        frameSrc: [
          "'self'",
          "blob:",
          "https://gconlineplus.de",
          "https://*.gconlineplus.de",
          "https://emczwei.bitrix24.de"
        ],

        // IMPORTANT:
        // Allow *your site* to be embedded by gconlineplus (otherwise it can’t frame you).
        // If you do NOT want your site embedded there, keep only "'self'".
        frameAncestors: [
          "'self'",
          "https://gconlineplus.de",
          "https://*.gconlineplus.de",
          "https://emczwei.bitrix24.de",
          "https://bau-formular.fly.dev",
        ],

        // Allow PDF.js from unpkg + allow the inline <script> in your srcdoc (hash-based).
        // Also add scriptSrcElem explicitly to match browser error "script-src-elem".
        scriptSrc: [
          "'self'",
          "https://unpkg.com",
          "https://emczwei.bitrix24.de",

          // your existing allowed inline hashes
          "'sha256-/N6XS1N1HWcS1jcxJkTULItDFffd/I1mw8tPD5FTS3o='",
          "'sha256-5RmoD/+nJXNc4AM8oTu6YJEmH8lgRnYL9t8PcLUZxcY='",
          "'sha256-pmi68vLyMeGurqDvTzm+MD6lhDeARWXCNqv7x536RmA='",

          // hash suggested by the browser for the srcdoc inline script
          "'sha256-bVEWo/cK6LT6bDOoke6lkc5oHnahn1AxmUQubJ3s0eA='",
        ],

        // Some browsers treat <script> tags under script-src-elem specifically.
        scriptSrcElem: [
          "'self'",
          "https://unpkg.com",
          "https://emczwei.bitrix24.de",

          "'sha256-/N6XS1N1HWcS1jcxJkTULItDFffd/I1mw8tPD5FTS3o='",
          "'sha256-5RmoD/+nJXNc4AM8oTu6YJEmH8lgRnYL9t8PcLUZxcY='",
          "'sha256-pmi68vLyMeGurqDvTzm+MD6lhDeARWXCNqv7x536RmA='",
          "'sha256-bVEWo/cK6LT6bDOoke6lkc5oHnahn1AxmUQubJ3s0eA='",
        ],

        // PDF.js may create a Worker. If you use pdf.worker.min.js from unpkg,
        // allow it here; otherwise worker creation can fail.
        workerSrc: ["'self'", "blob:", "https://unpkg.com"],

        styleSrc: ["'self'", "'unsafe-inline'"],

        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://media.onlineplus.store",
          // "https://*.onlineplus.store",
        ],

        fontSrc: ["'self'", "data:"],

        connectSrc: [
          "'self'",
          "https://emczwei.bitrix24.de",
          "https://route-plannung.fly.dev",
          "https://bau-formular.fly.dev",
          // if your viewer fetches PDFs or assets from unpkg via fetch/XHR:
          "https://unpkg.com",
        ],

        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
);

// Trust proxy (Fly/ngrok)
app.set("trust proxy", 1);

// ---------------- CORS ----------------
const allowedExact = new Set([
  "https://oc.emc2.de",
  "https://angebotskonfiguratoremc2.fly.dev",
  "https://angebotskonfigurator-emc2-v2.fly.dev",
  "https://bau-formular.fly.dev",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://emczwei.bitrix24.de",
]);

// ngrok has renamed its domains over time (ngrok.io -> ngrok-free.app ->
// ngrok-free.dev), and a tunnel is how the app gets onto a real iPhone/iPad for
// testing, since iOS refuses service workers and Add-to-Home-Screen over plain
// http to a LAN address.
//
// Deliberately NOT widened in production: with credentials:true, every suffix
// here is an origin any stranger can obtain and then call this API from a
// logged-in employee's browser. Production keeps exactly the one domain it
// already trusted, so this stays a dev-only convenience.
const NGROK_SUFFIXES =
  process.env.NODE_ENV === "production"
    ? ["ngrok-free.app"]
    : ["ngrok-free.app", "ngrok-free.dev", "ngrok.app", "ngrok.dev", "ngrok.io"];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedExact.has(origin)) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    return NGROK_SUFFIXES.some(
      (suffix) => u.hostname === suffix || u.hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  }),
);

// Preflight
app.options(
  /.*/,
  cors({
    origin(origin, cb) {
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  }),
);

// ---------------- Common middleware ----------------
app.use(compression());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "25mb" }));

// ---------------- Auth ----------------
// Public login page (must be reachable without a session).
app.get("/login", (req, res) =>
  res.sendFile(path.join(__dirname, "public", "login.html"), { dotfiles: "allow" }),
);
app.use("/api/auth", authRouter);
// Gate everything else (customer signing + assets + health stay public; see
// middleware/authGate.js). Runs before the routers below.
app.use(authGate);

// ---------------- Mongo ----------------
mongoose.set("strictQuery", true);

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI. Set it in .env");
  process.exit(1);
}
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
console.log("MongoDB connected ->", MONGODB_DB);

// ---------------- Config service ----------------
await configService.init();

// ---------------- Business logic ----------------
const pricing = pricingFactory(Product);

// ---------------- Routers ----------------
app.use("/api/trays", traysRouter);
app.use("/api/vorhang", vorhangRouter);
app.use("/api/da-config", daConfigRouter);
app.use("/pdf", pdfRouter);
app.use("/pdf-template", pdfTemplateRouter);
app.use("/docx-template", docxTemplateRouter);
app.use("/material-overview", materialOverviewRouter);
app.use("/api/offers", offersRouter);
app.use("/api/magic", magicRouter);
app.use("/api/customers", customersRouter);
app.use("/api/bitrix", bitrixRouter);
app.use("/api/routing", routingRouter); // <--- NEW
app.use("/api/docx", pdfPreviewRouter);
app.use("/api/adobe-pdf", adobePdfRouter);
app.use("/api/arbeitsbericht", arbeitsberichtRouter);
app.use("/arbeitsbericht", arbeitsberichtRouter);
app.use("/kalkulation", kalkulationRouter);
app.use("/api/email", emailRouter);
app.use("/api/post", postRouter);
app.use("/api/bathtubs", bathtubsRouter);
app.use("/api", planningRouter);
app.use("/api/hl", hlParseRouter);
app.use('/api', todaysCustomersRouter);
app.use('/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/signing', signingRouter);
// Public signing page (must be before the SPA fallback so /sign/:token works).
app.get('/sign/:token', signingPageHandler);

//app.use("/pdf-preview", pdfPreviewRouter);
//app.use('/api/docx/pdf-preview', pdfPreviewRouter); // ADD THIS
// (you had this twice; once is enough)
// app.use('/api/offers', offersRouter);
app.use("/latex-template", latexTemplateRouter);

// ---------------- Health ----------------
app.get("/api/health", (req, res) =>
  res.json({ ok: true, db: MONGODB_DB, time: new Date().toISOString() }),
);

// ---------------- Products APIs ----------------

// Bulk upsert products: [{ productId, name, price }]
app.post("/api/products/bulk", async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length) {
      return res
        .status(400)
        .json({ error: "Body must be an array of products" });
    }
    const ops = items.map((p) => ({
      updateOne: {
        filter: { productId: p.productId },
        update: {
          $set: {
            name: p.name,
            price: Number(p.price || 0),
            widthCm: p.widthCm ?? null,
            lengthCm: p.lengthCm ?? null,
            heightCm: p.heightCm ?? null,
            source: p.source ?? null, // <‑‑ allow setting source
            manufacturer: p.manufacturer ?? null, // <‑‑ allow setting manufacturer
          },
        },
        upsert: true,
      },
    }));
    const result = await Product.bulkWrite(ops);
    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- Services APIs ----------------

// Bulk upsert services: [{ serviceId, name, price, time, description, internal_name, source }]
app.post("/api/services/bulk", async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : [];
    if (!items.length) {
      return res
        .status(400)
        .json({ error: "Body must be an array of services" });
    }

    const ops = items.map((s) => ({
      updateOne: {
        filter: { serviceId: s.serviceId },
        update: {
          $set: {
            name: s.name,
            description: s.description ?? null,
            internal_name: s.internal_name ?? null,
            price: Number(s.price || 0),
            time: Number(s.time || 0),
            source: s.source ?? null,
          },
        },
        upsert: true,
      },
    }));

    const result = await Service.bulkWrite(ops);
    res.json({ ok: true, result });
  } catch (err) {
    console.error("POST /api/services/bulk failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

// Alle Services auflisten (Admin/Debug)
app.get("/api/services", async (req, res) => {
  try {
    const { q } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { serviceId: new RegExp(q, "i") },
        { name: new RegExp(q, "i") },
        { internal_name: new RegExp(q, "i") },
      ];
    }

    const docs = await Service.find(filter).sort({ serviceId: 1 }).lean();

    res.json(docs);
  } catch (err) {
    console.error("GET /api/services failed:", err);
    res.status(500).json({ error: "Serverfehler beim Laden der Services" });
  }
});

// Single service by serviceId
app.get("/api/services/:id", async (req, res) => {
  try {
    const s = await Service.findOne({ serviceId: req.params.id }).lean();
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json(s);
  } catch (err) {
    console.error("GET /api/services/:id failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

// SLA list (debug/helper)
app.get("/api/products/sla", async (req, res) => {
  try {
    const docs = await Product.find(
      { productId: /^SLA/i },
      { productId: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, price: 1 },
    )
      .sort({ lengthCm: 1, widthCm: 1, heightCm: 1 })
      .lean();

    return res.json(docs);
  } catch (e) {
    console.error("GET /api/products/sla failed:", e);
    res.status(500).json({ error: "server error" });
  }
});

// Alle Produkte auflisten (Admin/Debug)
app.get("/api/products", async (req, res) => {
  try {
    const { q, prefix, source, limit } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { productId: new RegExp(q, "i") },
        { name: new RegExp(q, "i") },
      ];
    }

    // Additive: prefix filter (e.g. BP)
    if (prefix) {
      const safe = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.productId = new RegExp("^" + safe, "i");
    }

    // Additive: source filter (e.g. badolux)
    if (source) {
      filter.source = new RegExp("^" + String(source) + "$", "i");
    }

    let query = Product.find(filter).sort({ productId: 1 });
    if (limit) {
      const n = Math.max(1, Math.min(500, Number(limit) || 200));
      query = query.limit(n);
    }

    const docs = await query.lean();
    res.json(docs);
  } catch (err) {
    console.error("GET /api/products failed:", err);
    res.status(500).json({ error: "Serverfehler beim Laden der Produkte" });
  }
});


// Single product by productId
app.get("/api/products/:id", async (req, res) => {
  try {
    const p = await Product.findOne({ productId: req.params.id }).lean();
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- Pricing (stateless) ----------------
app.post("/api/price", async (req, res) => {
  try {
    const payload = req.body;
    const result = await pricing.computePrices(payload);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// The pricing rules run in the browser too, for offline totals (see
// public/pricing-client.js). Only this one file from src/logic is exposed, and
// authGate keeps it behind the session — it is business logic, not an asset.
const PRICING_CORE_SRC = await readFile(
  path.join(__dirname, "logic", "pricing-core.js"),
  "utf8",
);
app.get("/logic/pricing-core.js", (req, res) => {
  res.type("application/javascript").send(PRICING_CORE_SRC);
});

// Same reasoning, for the Duschwanne suggestion boxes (see
// public/tray-search-client.js): the offline fallback runs the identical
// scoring/filter rules routes/trays.js uses, not a reimplementation.
const TRAY_SEARCH_CORE_SRC = await readFile(
  path.join(__dirname, "logic", "tray-search-core.js"),
  "utf8",
);
app.get("/logic/tray-search-core.js", (req, res) => {
  res.type("application/javascript").send(TRAY_SEARCH_CORE_SRC);
});

// GET /api/price/inputs
// Everything the browser needs to compute a total without us: the product
// prices and the admin-tunable numbers. Cached client-side so a technician who
// loses signal still sees live totals (see public/pricing-client.js).
// ponytail: ships the whole product table in one response. Fine at the current
// size; switch to a delta keyed on buildId if it ever gets heavy.
app.get("/api/price/inputs", async (req, res) => {
  try {
    const config = {};
    // Every schema key, so this never drifts from what pricing-core reads.
    for (const def of CONFIG_SCHEMA) config[def.key] = configService.get(def.key);

    // widthCm/lengthCm/heightCm/source are only set on tray products (see
    // routes/trays.js) — undefined on everything else, harmless extra fields.
    // Shipped here rather than a second snapshot so tray-search-client.js can
    // reuse this same cached response instead of a parallel cache store.
    const products = await Product.find(
      {},
      { _id: 0, productId: 1, price: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, source: 1 },
    ).lean();

    res.json({ buildId: APP_BUILD_ID, config, products });
  } catch (err) {
    console.error("GET /api/price/inputs failed:", err);
    res.status(500).json({ error: "Serverfehler beim Laden der Preis-Basisdaten" });
  }
});

// ---------------- Drafts (Entwürfe) ----------------
app.use("/api/drafts", draftsRouter);

// ---------------- Submissions (legacy) ----------------
app.post("/api/submissions", async (req, res) => {
  try {
    const payload = req.body;
    const computed = await pricing.computePrices(payload);
    const doc = await Submission.create({ payload, computed });
    res.status(201).json({ id: doc._id, computed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------- Health (legacy) ----------------
app.get("/health", (req, res) =>
  res.json({ ok: true, time: new Date().toISOString() }),
);

// ---------------- Static: PDF.js (MUST be before SPA fallback) ----------------
app.use(
  "/pdfjs",
  express.static(path.join(__dirname, "public", "pdfjs"), {
    fallthrough: false, // IMPORTANT: prevents SPA fallback HTML for missing files
    setHeaders(res, filePath) {
      // Ensure correct JS MIME type (nosniff otherwise blocks)
      if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      }
    },
  }),
);

// ---------------- Static: Font Awesome from npm ----------------
app.use(
  "/vendor/fontawesome",
  express.static(path.join(__dirname, "..", "node_modules", "@fortawesome", "fontawesome-free"), {
    fallthrough: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
      }
      if (filePath.endsWith(".woff2")) {
        res.setHeader("Content-Type", "font/woff2");
      }
      if (filePath.endsWith(".woff")) {
        res.setHeader("Content-Type", "font/woff");
      }
      if (filePath.endsWith(".ttf")) {
        res.setHeader("Content-Type", "font/ttf");
      }
    },
  }),
);

// ---------------- Version endpoint (used by frontend update-checker) ----------------
app.get("/api/version", (req, res) => {
  res.json({ buildId: APP_BUILD_ID });
});

// ---------------- Static ----------------
app.use(express.static(path.join(__dirname, "public")));




// ---------------- SPA fallback (keep LAST) ----------------
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------------- Listen ----------------
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log("Mounted: POST /pdf-template");
  console.log("Mounted: POST /docx-template");
  console.log("Mounted: POST /api/products/bulk");
  console.log("Mounted: GET  /api/products");
  console.log("Mounted: GET  /api/products/:id");
  console.log("Mounted: POST /api/price");
  console.log("Mounted: POST /api/submissions");
  console.log("Mounted: POST /api/offers/save");
  console.log("Mounted: GET  /api/offers/:offerNumber");
    console.log("Mounted: GET  /pdf-preview/viewer");
  console.log("Mounted: POST /pdf-preview/generate");
});
