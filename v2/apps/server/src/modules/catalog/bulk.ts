// Catalog bulk import of products and services. Admins only (owner decision 2026-11-05,
// ADR 018; legacy: any logged-in user). Responses identical to legacy (contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Product, Service } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export async function registerCatalogBulk(app: FastifyInstance) {
  // ---- catalog bulk upserts: admins only (ADR 018) ----
  const ADMIN_ONLY = { config: { admin: true } };
  app.post("/api/products/bulk", ADMIN_ONLY, async (req, reply) => {
    try {
      const items = Array.isArray(req.body) ? (req.body as any[]) : [];
      if (!items.length) return fail(req, reply, 400, "BAD_REQUEST", "Body must be an array of products");
      const result = await Product.bulkWrite(items.map((p) => ({
        updateOne: {
          filter: { productId: p.productId },
          update: { $set: {
            name: p.name, price: Number(p.price || 0), widthCm: p.widthCm ?? null, lengthCm: p.lengthCm ?? null,
            heightCm: p.heightCm ?? null, source: p.source ?? null, manufacturer: p.manufacturer ?? null,
          } },
          upsert: true,
        },
      })));
      req.log.info({ count: items.length }, "products bulk upsert");
      return { ok: true, result };
    } catch (err) {
      req.log.error({ err }, "POST /api/products/bulk failed");
      return fail(req, reply, 500, "BULK_FAILED", String(err));
    }
  });

  app.post("/api/services/bulk", ADMIN_ONLY, async (req, reply) => {
    try {
      const items = Array.isArray(req.body) ? (req.body as any[]) : [];
      if (!items.length) return fail(req, reply, 400, "BAD_REQUEST", "Body must be an array of services");
      const result = await Service.bulkWrite(items.map((s) => ({
        updateOne: {
          filter: { serviceId: s.serviceId },
          update: { $set: {
            name: s.name, description: s.description ?? null, internal_name: s.internal_name ?? null,
            price: Number(s.price || 0), time: Number(s.time || 0), source: s.source ?? null,
          } },
          upsert: true,
        },
      })));
      req.log.info({ count: items.length }, "services bulk upsert");
      return { ok: true, result };
    } catch (err) {
      req.log.error({ err }, "POST /api/services/bulk failed");
      return fail(req, reply, 500, "BULK_FAILED", String(err));
    }
  });
}
