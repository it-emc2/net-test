// Runs a legacy Express handler chain (captured from a ported router) under Fastify, so the
// ported document routes behave exactly like legacy. The response object is a real Writable,
// so handlers that stream (pdfkit's doc.pipe(res)) work too. Legacy error bodies { error: "…" }
// become the v2 envelope { error: { code, message, requestId }, ...rest } (ADR 015).
import { Writable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { LegacyHandler } from "./shims/express.js";

export function runLegacy(chain: LegacyHandler | LegacyHandler[], req: FastifyRequest, reply: FastifyReply): Promise<unknown> {
  const handlers = Array.isArray(chain) ? chain : [chain];
  return new Promise((resolve, reject) => {
    let status = 200, done = false, started = false;
    const headers: Record<string, string> = {};
    const chunks: Buffer[] = [];
    const finish = (payload: unknown) => {
      if (done) return;
      done = true;
      reply.status(status);
      for (const [k, v] of Object.entries(headers)) reply.header(k, v);
      resolve(reply.send(payload));
    };
    // streamed writes (res.write / res.end(buf) / pipe) are collected and sent on end
    const res: any = new Writable({
      write(chunk, _enc, cb) { started = true; chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); cb(); },
      final(cb) { finish(Buffer.concat(chunks)); cb(); },
    });
    Object.defineProperty(res, "headersSent", { get: () => done || started });
    Object.defineProperty(res, "statusCode", { get: () => status, set: (v: number) => { status = v; } });
    Object.assign(res, {
      status(code: number) { status = code; return res; },
      setHeader(k: string, v: string) { headers[k] = v; return res; },
      getHeader(k: string) { return headers[k]; },
      set(k: string | Record<string, string>, v?: string) {
        if (typeof k === "object") Object.assign(headers, k); else headers[k] = v as string;
        return res;
      },
      type(t: string) { headers["Content-Type"] = t; return res; },
      json(body: any) {
        headers["Content-Type"] = "application/json; charset=utf-8";
        if (status >= 400 && body && typeof body.error === "string") {
          const { error, ...rest } = body;
          finish({ error: { code: "DOCUMENT_ERROR", message: error, requestId: req.id }, ...rest });
        } else finish(body);
        return res;
      },
      send(body: unknown) { finish(body); return res; },
    });
    const legacyReq: any = {
      body: req.body ?? {}, query: req.query ?? {}, params: req.params ?? {}, headers: req.headers, user: req.user,
      get: (h: string) => req.headers[h.toLowerCase()], _fastify: req,
    };
    // Express-style chain: middleware calls next(), the last handler answers
    const step = (i: number) => (err?: unknown) => {
      if (err) return reject(err);
      const h = handlers[i];
      if (!h) return reject(new Error("legacy handler chain ended without a response"));
      Promise.resolve(h(legacyReq, res, step(i + 1))).catch(reject);
    };
    step(0)();
  });
}
