// Secure-by-default gate (fixes legacy SECURITY-FINDINGS #2, #3, #6, #7 by design):
// every route requires a valid session UNLESS its route options say `config: { public: true }`.
// No path patterns → no case / trailing-slash / file-extension bypasses.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { tokenFromHeaders, verifyToken } from "./auth.js";

declare module "fastify" {
  interface FastifyContextConfig { public?: boolean }
  interface FastifyRequest { user?: { email: string } }
}

export function registerAuthGate(app: FastifyInstance, secret: string) {
  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    if (req.routeOptions.config?.public === true) return;
    if (!req.routeOptions.url) return; // unknown route → 404 handler
    const t = verifyToken(tokenFromHeaders(req.headers), secret);
    if (!t) return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Bitte anmelden", requestId: req.id } });
    req.user = t;
  });
}
