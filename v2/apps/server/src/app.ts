// Fastify application factory. No side effects at import time (unlike the legacy app.js,
// which connects, writes a boot log and spawns soffice on import) — everything is explicit
// so tests can build the app in-process.
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type { AppConfig } from "@oc/config";
import { dbState } from "./db.js";

/** Hook for error aggregation (GlitchTip/Sentry wiring lands with self-hosting, ADR 009). */
export type ErrorReporter = (err: unknown, ctx: { requestId: string; route?: string }) => void;

export interface BuildOptions {
  reporter?: ErrorReporter;
  /** Extra routes (feature modules) registered after the core ones. */
  register?: (app: FastifyInstance) => Promise<void> | void;
}

/** Fields that must never appear in logs. */
const REDACT = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  "*.password",
  "*.passwordHash",
  "*.token",
];

export async function buildApp(cfg: AppConfig, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: cfg.LOG_LEVEL,
      redact: { paths: REDACT, censor: "[redacted]" },
      base: { service: "oc-server", build: cfg.BUILD_ID },
    },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      return typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    },
    requestIdHeader: false,
    bodyLimit: 25 * 1024 * 1024, // parity with legacy express.json({ limit: "25mb" })
  });

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // ---- one error format everywhere; every 5xx is logged with context and reported
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err, route: req.routeOptions.url }, "request failed");
      opts.reporter?.(err, { requestId: req.id, route: req.routeOptions.url });
    } else {
      req.log.warn({ err: { message: err.message, code: err.code }, route: req.routeOptions.url }, "client error");
    }
    void reply.status(status).send({
      error: {
        code: err.code ?? (status >= 500 ? "INTERNAL" : "BAD_REQUEST"),
        // never leak internals to users; plain German for the UI, request id for support
        message: status >= 500 ? "Es ist ein interner Fehler aufgetreten. Bitte erneut versuchen." : err.message,
        requestId: req.id,
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.status(404).send({ error: { code: "NOT_FOUND", message: "Nicht gefunden", requestId: req.id } });
  });

  // ---- core endpoints (parity: legacy has /api/health and /api/version)
  app.get("/api/health", async (_req, reply) => {
    const db = dbState();
    return reply.status(db === "connected" ? 200 : 503).send({ ok: db === "connected", db, time: new Date().toISOString() });
  });
  app.get("/api/version", async () => ({ buildId: cfg.BUILD_ID }));

  if (opts.register) await opts.register(app);
  return app;
}
