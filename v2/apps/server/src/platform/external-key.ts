// Guard for machine callers that use the shared API key instead of a session.
import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

/** Route guard for machine callers (bau-formular): `X-API-Key` / `?apiKey` = EXTERNAL_API_KEY,
 *  constant-time compare; closed (503) when the key is not configured (legacy: open). */
export function externalKeyGuard(externalApiKey: string | undefined) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!externalApiKey) return fail(req, reply, 503, "NOT_CONFIGURED", "EXTERNAL_API_KEY not configured");
    const given = String(req.headers["x-api-key"] || (req.query as Record<string, unknown>).apiKey || "");
    const a = Buffer.from(given), b = Buffer.from(externalApiKey);
    if (!(a.length === b.length && timingSafeEqual(a, b))) return fail(req, reply, 401, "UNAUTHORIZED", "Invalid or missing API key");
  };
}
