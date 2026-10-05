// syncVigourNames.js
// Enriches vigor.models/_id="vigour" (served live by src/routes/da-config.js) with
// real supplier data from the "vigor" MongoDB, collection "products" (keyed by
// articleNumber). Adds NEW, optional fields per article — displayName / finishText /
// stockText / stockQuantity / sourceUrl / einbaumass — and leaves the upstream `label`
// (auto-generated) alone, which src/public/configurator/engine.js relies on for display.
//
// article.finish.profilfarbe is the one exception: the scraper's own text decoder
// mislabels every abbreviated "hochglanz" spelling ("sil.hochg.", "silb.hochgl.", …)
// as "matt" whenever "PflegeCare" (mit Beschichtung) is also present in the text —
// glasart/beschichtung/einzugsautomatik are unaffected. Since finishText (info.finish)
// spells the color out in full and is right here, re-derive profilfarbe from it instead
// of trusting the upstream value — see decodeProfilfarbe() below.
//
// Run: node scripts/syncVigourNames.js
// Re-run whenever the "vigor" DB is refreshed by the scraper. Stock/Einbaumaß are a
// sync-time snapshot — do NOT treat them as live inventory in saved offers.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mongoose from "mongoose";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

// "hochg" catches every abbreviation the scraper's finishText uses for hochglanz
// (hochg., hochgl., hochgla., hochglan., hochglanz); must be checked before "matt"
// since the buggy upstream decoder defaults those abbreviations to "matt".
export function decodeProfilfarbe(finishText) {
  if (!finishText) return null;
  if (/hochg/i.test(finishText)) return "hochglanz";
  if (/schwarz/i.test(finishText)) return "schwarz";
  if (/matt/i.test(finishText)) return "matt";
  return null;
}

async function main() {
  const uri = process.env.VIGOR_MONGODB_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("VIGOR_MONGODB_URI (or MONGODB_URI) missing from .env");

  const conn = await mongoose.createConnection(uri, { dbName: "vigor" }).asPromise();
  const db = conn.db;

  const docs = await db
    .collection("products")
    .find(
      {},
      {
        projection: {
          articleNumber: 1,
          name: 1,
          finish: 1,
          stockText: 1,
          stockQuantity: 1,
          sourceUrl: 1,
          einbaumass: 1,
          lastSeenAt: 1,
        },
      },
    )
    .toArray();

  // The scraper's natural key is {materialNumber, configHash}, not articleNumber —
  // the same articleNumber can be reached via multiple config paths, each saved as
  // its own document. Enrichment is only as good as whichever path's scrape captured
  // it, so merge duplicates per articleNumber with a per-field rule:
  //   - name / finish / sourceUrl: keep the FIRST populated value (roughly constant
  //     per article; don't let a later blank duplicate overwrite a good one).
  //   - stockText / stockQuantity: keep the value from the FRESHEST doc (latest
  //     lastSeenAt), since stock changes over time. A missing quantity stays absent
  //     ("unknown"), never coerced to 0.
  //   - einbaumass: prefer the freshest NON-EMPTY array.
  const toMs = (v) => (v ? new Date(v).getTime() || 0 : 0);
  const byArticle = new Map();
  for (const d of docs) {
    if (!d.articleNumber) continue;
    const seen = toMs(d.lastSeenAt);
    const existing = byArticle.get(d.articleNumber);
    if (!existing) {
      byArticle.set(d.articleNumber, {
        name: d.name || "",
        finish: d.finish || "",
        sourceUrl: d.sourceUrl || "",
        stockText: d.stockText ?? null,
        stockQuantity: d.stockQuantity ?? null,
        stockSeen: d.stockText != null || d.stockQuantity != null ? seen : -1,
        einbaumass: Array.isArray(d.einbaumass) && d.einbaumass.length ? d.einbaumass : null,
        einbauSeen: Array.isArray(d.einbaumass) && d.einbaumass.length ? seen : -1,
      });
      continue;
    }
    // first-populated fields
    existing.name = existing.name || d.name || "";
    existing.finish = existing.finish || d.finish || "";
    existing.sourceUrl = existing.sourceUrl || d.sourceUrl || "";
    // freshest-wins stock (only from docs that actually carry stock data)
    if ((d.stockText != null || d.stockQuantity != null) && seen >= existing.stockSeen) {
      existing.stockText = d.stockText ?? existing.stockText;
      existing.stockQuantity = d.stockQuantity ?? existing.stockQuantity;
      existing.stockSeen = seen;
    }
    // freshest non-empty einbaumass
    if (Array.isArray(d.einbaumass) && d.einbaumass.length && seen >= existing.einbauSeen) {
      existing.einbaumass = d.einbaumass;
      existing.einbauSeen = seen;
    }
  }
  console.log(`[syncVigourNames] loaded ${byArticle.size} products from vigor.products`);

  const modelDoc = await db.collection("models").findOne({ _id: "vigour" });
  if (!modelDoc?.model) throw new Error("vigor.models/_id=vigour not seeded");
  const model = modelDoc.model;

  let matched = 0;
  let total = 0;
  const cov = { name: 0, finish: 0, stock: 0, sourceUrl: 0, einbaumass: 0, profilfarbeFixed: 0 };

  for (const leaf of model.leaves || []) {
    for (const comp of leaf.components || []) {
      for (const article of comp.articles || []) {
        total++;
        const info = byArticle.get(article.articleNumber);
        if (!info) continue;
        matched++;
        // Additive, display-only fields — written only when data exists, so absent
        // data stays absent. `label` and `finish` are intentionally left untouched.
        if (info.name) {
          article.displayName = info.name;
          cov.name++;
        }
        if (info.finish) {
          article.finishText = info.finish;
          cov.finish++;
          const profilfarbe = decodeProfilfarbe(info.finish);
          if (profilfarbe && article.finish && article.finish.profilfarbe !== profilfarbe) {
            article.finish.profilfarbe = profilfarbe;
            cov.profilfarbeFixed++;
          }
        }
        if (info.sourceUrl) {
          article.sourceUrl = info.sourceUrl;
          cov.sourceUrl++;
        }
        if (info.stockText != null || info.stockQuantity != null) {
          if (info.stockText != null) article.stockText = info.stockText;
          if (info.stockQuantity != null) article.stockQuantity = info.stockQuantity;
          cov.stock++;
        }
        if (info.einbaumass?.length) {
          article.einbaumass = info.einbaumass;
          cov.einbaumass++;
        }
      }
    }
  }

  model.meta = {
    ...model.meta,
    namesSyncedAt: new Date().toISOString(),
    enrichedAt: new Date().toISOString(),
  };

  await db.collection("models").updateOne({ _id: "vigour" }, { $set: { model } });
  await conn.close();

  console.log(
    `[syncVigourNames] matched ${matched}/${total} articles ` +
      `(name ${cov.name}, finish ${cov.finish}, stock ${cov.stock}, ` +
      `sourceUrl ${cov.sourceUrl}, einbaumass ${cov.einbaumass}, ` +
      `profilfarbe corrected ${cov.profilfarbeFixed}); ` +
      `wrote vigor.models/_id=vigour`,
  );
}

main().catch((e) => {
  console.error("[syncVigourNames] failed:", e.message);
  process.exit(1);
});
