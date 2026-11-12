// Security headers + CORS, registered BEFORE the auth gate (legacy order: helmet → cors →
// authGate), so every response — including 401s — carries the same headers as legacy.
import type { FastifyInstance } from "fastify";
import helmet from "helmet";
import cors from "@fastify/cors";
import helmetOptions from "./ported/helmet-options.js";
import { isAllowedOrigin } from "./ported/cors-origins.js";

export async function registerSecurity(app: FastifyInstance) {
  // helmet 8.1.0 itself with the extracted legacy options (what @fastify/helmet does)
  const helmetMw = helmet(helmetOptions as any);
  app.addHook("onRequest", (req, reply, done) => { helmetMw(req.raw as any, reply.raw as any, done as any); });
  await app.register(cors, {
    origin: (origin, cb) => (isAllowedOrigin(origin) ? cb(null, true) : cb(new Error("Not allowed by CORS"), false)),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
}
