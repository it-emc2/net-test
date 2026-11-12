// Product and service lists of the price catalog (legacy /api/products, /api/services; contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Product, Service } from "../../platform/models.js";

/** Escape user input for RegExp (fixes SECURITY-FINDINGS #11: ReDoS / regex injection). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

export async function registerProductsRead(app: FastifyInstance) {
  app.get("/api/services", async (req) => {
    const { q } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (q) {
      const re = new RegExp(esc(q), "i");
      filter.$or = [{ serviceId: re }, { name: re }, { internal_name: re }];
    }
    return Service.find(filter).sort({ serviceId: 1 }).lean();
  });

  app.get("/api/services/:id", async (req, reply) => {
    const s = await Service.findOne({ serviceId: (req.params as { id: string }).id }).lean();
    return s ?? fail(req, reply, 404, "NOT_FOUND", "Not found");
  });

  app.get("/api/products/sla", async () =>
    Product.find({ productId: /^SLA/i }, { productId: 1, name: 1, widthCm: 1, lengthCm: 1, heightCm: 1, price: 1 })
      .sort({ lengthCm: 1, widthCm: 1, heightCm: 1 }).lean());

  app.get("/api/products", async (req) => {
    const { q, prefix, source, limit } = req.query as Record<string, string | undefined>;
    const filter: Record<string, unknown> = {};
    if (q) { const re = new RegExp(esc(q), "i"); filter.$or = [{ productId: re }, { name: re }]; }
    if (prefix) filter.productId = new RegExp("^" + esc(String(prefix)), "i");
    if (source) filter.source = new RegExp("^" + esc(String(source)) + "$", "i");
    let query = Product.find(filter).sort({ productId: 1 });
    if (limit) query = query.limit(Math.max(1, Math.min(500, Number(limit) || 200)));
    return query.lean();
  });

  app.get("/api/products/:id", async (req, reply) => {
    const p = await Product.findOne({ productId: (req.params as { id: string }).id }).lean();
    return p ?? fail(req, reply, 404, "NOT_FOUND", "Not found");
  });
}
