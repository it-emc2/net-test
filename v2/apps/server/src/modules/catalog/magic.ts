// /api/magic — port of legacy src/routes/magic.js (Hassmann product search proxy).
// Same upstream paths, same response shapes; errors carry the same message and `detail`
// (upstream response body, else the error text).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { MagicApi } from "../../integrations/magic.js";

export const KIND_TO_PATH: Record<string, string> = {
  corner: "/api/eckeinstieg-best-all/search",
  niche: "/api/niche-best-all/search",
  uform: "/api/uform-gleitur-all/search",
  walkin: "/api/walkin-best-all/search",
};

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

const upstreamFail = (req: FastifyRequest, reply: FastifyReply, what: string, err: any) => {
  req.log.error({ err, upstream: err?.response?.data }, `magic ${what} failed`);
  return fail(req, reply, 500, "EXTERNAL_API", "External API error", { detail: err?.response?.data || String(err) });
};

export async function registerMagic(app: FastifyInstance, magic: MagicApi) {
  app.get("/api/magic/health", async (req, reply) => {
    try { return await magic.call("get", "/api/health"); } catch (err) { return upstreamFail(req, reply, "/health", err); }
  });

  app.get("/api/magic/products", async (req, reply) => {
    try { return await magic.call("get", "/api/products", { params: req.query }); } catch (err) { return upstreamFail(req, reply, "/products", err); }
  });

  app.post("/api/magic/search", async (req, reply) => {
    try {
      const { kind, payload } = (req.body ?? {}) as { kind?: unknown; payload?: unknown };
      if (!kind || typeof kind !== "string") return fail(req, reply, 400, "BAD_REQUEST", 'Missing or invalid "kind".');
      const path = Object.hasOwn(KIND_TO_PATH, kind) ? KIND_TO_PATH[kind] : undefined;
      if (!path) return fail(req, reply, 400, "BAD_REQUEST", `Unknown shower type: "${kind}".`);
      if (!payload || typeof payload !== "object") return fail(req, reply, 400, "BAD_REQUEST", 'Missing "payload" object.');
      const data: any = await magic.call("post", path, { data: payload });
      const results = Array.isArray(data) ? data : (data?.results ?? data);
      return { ok: true, kind, path, results };
    } catch (err) {
      return upstreamFail(req, reply, "/search", err);
    }
  });
}
