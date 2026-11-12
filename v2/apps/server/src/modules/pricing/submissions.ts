// Legacy submissions: compute a price and store payload + result (legacy /api/submissions).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Submission } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  reply.status(status).send({ error: { code, message, requestId: req.id }, ...extra });

export async function registerSubmissions(app: FastifyInstance, d: { computePrices: (payload: any) => Promise<any> }) {
  // ---- legacy submissions (price + store) ----
  app.post("/api/submissions", async (req, reply) => {
    try {
      const payload = req.body;
      const computed = await d.computePrices(payload);
      const doc = await Submission.create({ payload, computed });
      return reply.status(201).send({ id: doc._id, computed });
    } catch (err) {
      req.log.error({ err }, "POST /api/submissions failed");
      return fail(req, reply, 500, "SUBMISSION_FAILED", String(err));
    }
  });
}
