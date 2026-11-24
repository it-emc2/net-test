// Security headers + CORS, registered BEFORE the auth gate (legacy order: helmet → cors →
// authGate), so every response — including 401s — carries the same headers as legacy.
import type { FastifyInstance } from "fastify";
import helmet from "helmet";
import cors from "@fastify/cors";
import helmetOptions from "./ported/helmet-options.js";
import { isAllowedOrigin } from "./ported/cors-origins.js";

/** The addresses this server itself is reached under: PUBLIC_BASE_URL and, on Fly, <app>.fly.dev.
 *  The ported list knows only today's app (oc.emc2.de …); a v2 app under another address
 *  (the test app ocv2.emc2.de) must accept its own pages, or every POST from them — the login
 *  first — is refused. Nothing is widened beyond the server's own address. */
export function ownOrigins(env: { PUBLIC_BASE_URL?: string | undefined; FLY_APP_NAME?: string | undefined }): string[] {
  const out: string[] = [];
  try { if (env.PUBLIC_BASE_URL) out.push(new URL(env.PUBLIC_BASE_URL).origin); } catch { /* not an address */ }
  if (env.FLY_APP_NAME && /^[a-z0-9-]+$/.test(env.FLY_APP_NAME)) out.push(`https://${env.FLY_APP_NAME}.fly.dev`);
  return out;
}

export async function registerSecurity(app: FastifyInstance, own: readonly string[] = []) {
  // helmet 8.1.0 itself with the extracted legacy options (what @fastify/helmet does)
  const helmetMw = helmet(helmetOptions as any);
  app.addHook("onRequest", (req, reply, done) => { helmetMw(req.raw as any, reply.raw as any, done as any); });
  await app.register(cors, {
    origin: (origin, cb) => (isAllowedOrigin(origin) || (!!origin && own.includes(origin)) ? cb(null, true) : cb(new Error("Not allowed by CORS"), false)),
    credentials: true,
    exposedHeaders: ["Content-Disposition"],
  });
}
