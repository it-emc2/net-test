// Runs a legacy Express handler (captured from a ported router) under Fastify, so the
// ported document routes behave exactly like legacy. Legacy error bodies { error: "…" }
// become the v2 envelope { error: { code, message, requestId }, ...rest } (ADR 015).
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LegacyHandler } from "./shims/express.js";

export function runLegacy(handler: LegacyHandler, req: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let status = 200;
    const headers: Record<string, string> = {};
    const finish = (payload: unknown) => {
      reply.status(status);
      for (const [k, v] of Object.entries(headers)) reply.header(k, v);
      resolve(reply.send(payload));
    };
    const res = {
      status(code: number) { status = code; return res; },
      setHeader(k: string, v: string) { headers[k] = v; return res; },
      set(k: string, v: string) { headers[k] = v; return res; },
      type(t: string) { headers["Content-Type"] = t; return res; },
      json(body: any) {
        headers["Content-Type"] = "application/json; charset=utf-8";
        if (status >= 400 && body && typeof body.error === "string") {
          const { error, ...rest } = body;
          return finish({ error: { code: "DOCUMENT_ERROR", message: error, requestId: req.id }, ...rest });
        }
        return finish(body);
      },
      send(body: unknown) { return finish(body); },
      end(body?: unknown) { return finish(body ?? ""); },
    };
    const legacyReq = {
      body: req.body ?? {}, query: req.query ?? {}, params: req.params ?? {}, headers: req.headers, user: req.user,
      get: (h: string) => req.headers[h.toLowerCase()],
    };
    Promise.resolve(handler(legacyReq, res)).catch(reject);
  });
}
