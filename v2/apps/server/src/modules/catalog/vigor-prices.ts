// Vigour live prices for the wall-panel cards (legacy /api/vigor-prices; contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getVigorDb, vigorPriceFetcher } from "../../integrations/vigor.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export async function registerVigorPrices(app: FastifyInstance, d: { vigorUri: string }) {
  // ---- Vigor live prices (WV panel cards) ----
  const netPrices = vigorPriceFetcher(d.vigorUri);
  app.get("/api/vigor-prices", async (req, reply) => {
    try {
      const q = req.query as Record<string, unknown>;
      const ids = String(q.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!ids.length) return {};
      if (q.full !== "1") return Object.fromEntries(await netPrices(ids));
      const db = await getVigorDb(d.vigorUri);
      const docs: any[] = await db.collection("products").find({ articleNumber: { $in: ids } }, {
        projection: { articleNumber: 1, name: 1, netPrice: 1, listPrice: 1, images: 1, stockQuantity: 1, stockText: 1, lastSeenAt: 1 },
      }).toArray();
      const best = new Map<string, any>(); // freshest-wins per article
      for (const doc of docs) {
        if (!(Number(doc?.netPrice) > 0)) continue;
        const seen = doc.lastSeenAt ? new Date(doc.lastSeenAt).getTime() || 0 : 0;
        const prev = best.get(doc.articleNumber);
        if (!prev || seen >= prev._seen) best.set(doc.articleNumber, { ...doc, _seen: seen });
      }
      const result: Record<string, unknown> = {};
      for (const [id, x] of best) {
        result[id] = {
          articleNumber: x.articleNumber, name: x.name || "", netPrice: Number(x.netPrice), listPrice: Number(x.listPrice) || null,
          image: x.images?.[0] || null, stockQuantity: x.stockQuantity ?? null, stockText: x.stockText || null,
        };
      }
      return result;
    } catch (err) {
      req.log.error({ err }, "GET /api/vigor-prices failed");
      return fail(req, reply, 500, "VIGOR_FAILED", String(err));
    }
  });
}
