// Product pickers — ports of legacy src/routes/trays.js, da-config.js, vorhang.js, bathtubs.js.
// Read-only (catalog + vigor DB). Same responses (contract test against seeded vigor data).
// Difference: the curtain image cache directory is configurable (default: legacy assets).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildTrayDimFilter, scoreAndRank } from "@oc/pricing";
import { Product } from "../platform/models.js";
import { fetchVigourStock, getVigorDb, pickFreshestNetPrices } from "../integrations/vigor.js";
import { parseWanneDoc, productLink } from "../catalog/bathtubs.js";
import { WANNE_SETS } from "../catalog/ported/wanne-sets.js";
import { describeWanne } from "../catalog/ported/wanne-describe.js";

export interface CatalogDeps {
  vigorUri: string;
  badoluxDiscount: () => number;
  badoluxModelFile: string;
  vorhangAssetsDir: string;
  fetchImpl?: typeof fetch;
}

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });
const CACHE_TTL_MS = 10 * 60 * 1000;
const STOCK_LOOKUP_TIMEOUT_MS = 1500;

/** "101", "101.0", "1.200,5" → number (legacy parseDim) */
function parseDim(v: unknown) {
  if (v == null) return null;
  const n = Number(String(v).trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function registerCatalog(app: FastifyInstance, d: CatalogDeps) {
  const f = d.fetchImpl ?? fetch;

  // ---------------- shower trays ----------------
  app.get("/api/trays/suggest", async (req, reply) => {
    try {
      const q = req.query as Record<string, any>;
      const w = parseDim(q.w ?? q.b ?? q.width ?? q.widthCm), l = parseDim(q.l ?? q.length ?? q.lengthCm), h = parseDim(q.h ?? q.height ?? q.heightCm);
      const wantBudget = String(q.budget || "").trim() === "1";
      const series = String(q.series || "").trim().toUpperCase();
      const wantSource = String(q.source || "").trim().toLowerCase();
      if (w === null && l === null && h === null) return fail(req, reply, 400, "BAD_REQUEST", "Provide at least one of w, l, h");
      const filter: Record<string, unknown> = {};
      filter.productId = series === "SLA" ? /^SLA/i : series === "DW" ? /^DW/i : /^(SLA|DW)/i;
      if (wantSource) filter.source = wantSource;
      Object.assign(filter, buildTrayDimFilter({ w, l, h }));
      const docs = await Product.find(filter, { productId: 1, name: 1, price: 1, widthCm: 1, lengthCm: 1, heightCm: 1, source: 1, articleNumber: 1 }).lean();
      const results: any[] = scoreAndRank(docs as any, { w, l, h, budget: wantBudget }, d.badoluxDiscount());
      // live stock badges: display only, fail-open and fail-fast
      if (results.length) {
        try {
          const stock: Map<string, any> = await Promise.race([
            fetchVigourStock(d.vigorUri, results.map((p) => p.productId)),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`stock lookup timed out after ${STOCK_LOOKUP_TIMEOUT_MS}ms`)), STOCK_LOOKUP_TIMEOUT_MS).unref?.()),
          ]);
          for (const p of results) {
            const s = stock.get(p.productId);
            if (!s) continue;
            p.stockQuantity = s.stockQuantity; p.stockText = s.stockText; p.stockSymbol = s.stockSymbol;
          }
        } catch (e) {
          req.log.warn({ err: (e as Error)?.message }, "trays/suggest stock lookup skipped");
        }
      }
      return { input: { w, l, h }, results };
    } catch (err) {
      req.log.error({ err }, "trays/suggest failed");
      return fail(req, reply, 500, "SERVER_ERROR", "Server error");
    }
  });

  // ---------------- Duschabtrennung model (public, like legacy) ----------------
  let daCache: any = null, daAt = 0;
  async function loadVigourModel() {
    const db = await getVigorDb(d.vigorUri);
    const doc: any = await db.collection("models").findOne({ _id: "vigour" as any });
    if (!doc?.model) throw new Error("vigor.models/_id=vigour not seeded");
    const articles = doc.model.leaves.flatMap((l: any) => l.components.flatMap((c: any) => c.articles));
    const imgs = new Map<string, string>();
    const products = await db.collection("products")
      .find({ articleNumber: { $in: [...new Set(articles.map((a: any) => a.articleNumber))] }, "images.0": { $exists: true } })
      .project({ articleNumber: 1, images: 1 }).toArray();
    for (const p of products) imgs.set(p.articleNumber, p.images[0]);
    for (const a of articles) if (imgs.has(a.articleNumber)) a.image = imgs.get(a.articleNumber);
    return doc.model;
  }
  app.get("/api/da-config/model/:supplier", { config: { public: true } }, async (req, reply) => {
    const { supplier } = req.params as { supplier: string };
    if (supplier === "badolux") return reply.type("application/json; charset=UTF-8").send(fs.readFileSync(d.badoluxModelFile));
    if (supplier !== "vigour") return fail(req, reply, 404, "NOT_FOUND", "unknown_supplier");
    try {
      const now = Date.now();
      if (!daCache || now - daAt > CACHE_TTL_MS) { daCache = await loadVigourModel(); daAt = now; }
      return daCache;
    } catch (e) {
      req.log.error({ err: (e as Error)?.message }, "da-config model refresh failed");
      if (daCache) return daCache; // stale beats failing a live offer
      return fail(req, reply, 502, "VIGOR_UNAVAILABLE", "vigor_model_unavailable");
    }
  });

  // ---------------- shower curtains ----------------
  const CURTAIN_RE = /^HEWIDV(\d{2,3})(\d{3})W$/;
  const parseSizeCm = (article: unknown, name: unknown) => {
    const a = String(article || "").toUpperCase();
    let m = a.match(CURTAIN_RE);
    if (m) return Number(m[1]);
    m = a.match(/^DEPVS(\d{2,3})$/);
    if (m) return Number(m[1]);
    const mm = String(name || "").match(/(\d{3,4})\s*mm/i);
    return mm ? Math.round(Number(mm[1]) / 10) : null;
  };
  const classifyRail = (article: unknown) => {
    const a = String(article || "").toUpperCase();
    if (/^DEPVS\d{2,3}$/.test(a)) return "rod";
    if (a === "DEPVSROS") return "mandatory";
    return "optional";
  };
  // Images are downloaded once from the supplier CDN and served same-origin (CSP).
  async function ensureLocalImage(articleNumber: string, url: string | null) {
    if (!articleNumber || !url) return null;
    const target = path.join(d.vorhangAssetsDir, `${articleNumber}.jpg`);
    try { await fsp.access(target); return `/assets/vorhang/${articleNumber}.jpg`; } catch { /* not cached yet */ }
    try {
      const res = await f(url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      await fsp.mkdir(d.vorhangAssetsDir, { recursive: true });
      await fsp.writeFile(target, Buffer.from(await res.arrayBuffer()));
      return `/assets/vorhang/${articleNumber}.jpg`;
    } catch (e) {
      app.log.error({ err: (e as Error)?.message, articleNumber }, "vorhang image download failed");
      return null;
    }
  }
  const toItem = async (x: any) => ({
    articleNumber: x.articleNumber, name: x.name || x.articleNumber, net: Number(x.netPrice) || 0, gross: Number(x.grosPrice) || 0,
    unit: x.unit || "Stück", finish: x.finish || null,
    image: await ensureLocalImage(x.articleNumber, Array.isArray(x.images) && x.images.length ? x.images[0] : null),
    sizeCm: parseSizeCm(x.articleNumber, x.name),
    heightCm: Number(String(x.articleNumber || "").toUpperCase().match(CURTAIN_RE)?.[2]) || null,
    stockQuantity: x.stockQuantity ?? null, stockText: x.stockText ?? null,
  });
  let vhCache: any = null, vhAt = 0;
  async function loadCurtains() {
    const db = await getVigorDb(d.vigorUri);
    const docs = await db.collection("products").find({ "configContext.category": { $in: ["duschvorhang", "vorhangstange", "vorhangringe"] } }).toArray();
    const seen = new Map<string, any>();
    for (const x of docs) { if (!x.articleNumber || seen.has(x.articleNumber)) continue; seen.set(x.articleNumber, x); }
    const curtains: any[] = [], rods: any[] = [], mandatory: any[] = [], optional: any[] = [];
    const list = [...seen.values()];
    const items = await Promise.all(list.map(toItem));
    for (const [i, x] of list.entries()) {
      const item: any = items[i];
      const cat = x.configContext?.category;
      if (cat === "duschvorhang") curtains.push(item);
      else if (cat === "vorhangringe") {
        const vpe = String(x.finish || "").match(/VPE\s*=\s*(\d+)/i);
        if (vpe) item.packNote = `Beutel à ${vpe[1]} Ringe`;
        optional.push(item);
      } else {
        const role = classifyRail(x.articleNumber);
        (role === "rod" ? rods : role === "mandatory" ? mandatory : optional).push(item);
      }
    }
    const bySize = (a: any, b: any) => (a.sizeCm ?? 1e9) - (b.sizeCm ?? 1e9);
    curtains.sort(bySize); rods.sort(bySize);
    optional.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return { curtains, rods, mandatory, optional };
  }
  app.get("/api/vorhang/products", async (req, reply) => {
    try {
      const now = Date.now();
      if (!vhCache || now - vhAt > CACHE_TTL_MS) { vhCache = await loadCurtains(); vhAt = now; }
      return vhCache;
    } catch (e) {
      req.log.error({ err: (e as Error)?.message }, "vorhang products failed");
      return fail(req, reply, 502, "VIGOR_UNAVAILABLE", "vigor_products_unavailable");
    }
  });

  // ---------------- bathtubs (Iris from vigor + online sets) ----------------
  app.get("/api/bathtubs/catalog", async (req, reply) => {
    try {
      const db = await getVigorDb(d.vigorUri);
      const docs = await db.collection("products").find({ category: "badewanne" }, {
        projection: { articleNumber: 1, name: 1, finish: 1, netPrice: 1, grosPrice: 1, unit: 1, brand: 1, images: 1, lastSeenAt: 1 },
      }).toArray();
      const best = new Map<string, { parsed: any; seen: number }>();
      for (const x of docs) {
        const parsed = parseWanneDoc(x);
        if (!parsed || !(parsed.netPrice > 0)) continue;
        const seen = x.lastSeenAt ? new Date(x.lastSeenAt).getTime() || 0 : 0;
        const prev = best.get(parsed.articleNumber);
        if (!prev || seen >= prev.seen) best.set(parsed.articleNumber, { parsed, seen });
      }
      const needIds = [...new Set([...best.values()].flatMap((v) => (v.parsed.requires || []).map((z: any) => z.articleNumber)))];
      const accDocs: any[] = needIds.length
        ? await db.collection("products").find({ articleNumber: { $in: needIds } }, { projection: { articleNumber: 1, name: 1, netPrice: 1, lastSeenAt: 1 } }).toArray()
        : [];
      const accNet = pickFreshestNetPrices(accDocs);
      const accName = new Map(accDocs.map((x) => [x.articleNumber, x.name]));
      for (const v of best.values()) {
        v.parsed.requires = (v.parsed.requires || []).map((z: any) => ({ ...z, name: accName.get(z.articleNumber) || z.articleNumber, netPrice: accNet.get(z.articleNumber) ?? null }));
      }
      const items = [...best.values()].map((v) => v.parsed).concat(WANNE_SETS as any[])
        .map((p: any) => ({ ...p, desc: describeWanne(p), ...productLink(p.articleNumber), requires: (p.requires || []).map((z: any) => ({ ...z, ...productLink(z.articleNumber) })) }))
        .sort((a: any, b: any) => a.type.localeCompare(b.type) || a.netPrice - b.netPrice || a.articleNumber.localeCompare(b.articleNumber));
      return { count: items.length, items };
    } catch (err) {
      req.log.error({ err }, "bathtubs/catalog failed");
      return fail(req, reply, 500, "SERVER_ERROR", "Server error");
    }
  });
}
