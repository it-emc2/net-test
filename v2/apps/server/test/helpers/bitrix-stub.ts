// Recording Bitrix24 stub for contract tests. Serves `/rest/<user>/<app>/<method>.json`, where
// <app> tags the caller ("legacy" | "v2"), records every call (HTTP verb, method, raw encoded
// params in order) and answers with canned data. Methods without a handler drop the connection,
// which looks to the caller exactly like the dead port used before (fetch failed).
import { createServer, type IncomingMessage, type Server } from "node:http";

export interface RecordedCall { http: string; method: string; params: string }
export type Handler = (params: URLSearchParams, app: string, rawBody?: string, headers?: Record<string, string | string[] | undefined>) => unknown;

export class BitrixStub {
  private server?: Server;
  readonly calls: Record<string, RecordedCall[]> = {};
  port = 0;

  constructor(private readonly handlers: Record<string, Handler>) {}

  base(app: string) { return `http://127.0.0.1:${this.port}/rest/1/${app}`; }
  /** Route-planning service base for <app>; calls are recorded as method "plan:<path>". */
  planningBase(app: string) { return `http://127.0.0.1:${this.port}/plan/${app}`; }
  /** onlinebrief24 API base for <app>; recorded as method "ob24:<path>", params = JSON body. */
  ob24Base(app: string) { return `http://127.0.0.1:${this.port}/ob24/${app}/v1`; }
  /** public read-only services (geocoders/routers) for <app>; recorded as "ext:<service><path>", params = query or body */
  extBase(app: string, service: string) { return `http://127.0.0.1:${this.port}/ext/${app}/${service}`; }
  take(app: string) { const c = this.calls[app] ?? []; this.calls[app] = []; return c; }

  async start() {
    this.server = createServer(async (req, res) => {
      const e = /^\/ext\/([^/]+)\/([^/]+)(\/[^?]*)(?:\?(.*))?$/.exec(req.url ?? "");
      if (e) {
        const [, app, service, path, query] = e as unknown as [string, string, string, string, string | undefined];
        const raw = req.method === "POST" ? await body(req) : (query ?? "");
        (this.calls[app] ??= []).push({ http: req.method ?? "", method: `ext:${service}${path}`, params: raw });
        const h = this.handlers[`ext:${service}${path}`];
        if (!h) { res.socket?.destroy(); return; }
        const out: any = h(new URLSearchParams(query ?? ""), app, raw, req.headers);
        res.statusCode = out?.__status ?? 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(out?.__status ? out.body : out));
        return;
      }
      const p = /^\/(plan|ob24)\/([^/]+)(?:\/v1)?(\/[^?]*)$/.exec(req.url ?? "");
      if (p) {
        const [, kind, app, path] = p as unknown as [string, string, string, string];
        const raw = await body(req);
        (this.calls[app] ??= []).push({ http: req.method ?? "", method: `${kind}:${path}`, params: raw });
        const h = this.handlers[`${kind}:${path}`];
        if (!h) { res.socket?.destroy(); return; }
        const out: any = h(new URLSearchParams(), app, raw);
        if (out?.__sse) { // server-sent events: write chunks, then end
          res.writeHead(200, { "content-type": "text/event-stream" });
          for (const chunk of out.__sse as string[]) res.write(chunk);
          res.end();
          return;
        }
        res.statusCode = out?.__status ?? 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(out?.__status ? out.body : out));
        return;
      }
      const m = /^\/rest\/\d+\/([^/]+)\/([^/?]+)\.json(?:\?(.*))?$/.exec(req.url ?? "");
      if (!m) { res.socket?.destroy(); return; }
      const [, app, method, query] = m as unknown as [string, string, string, string | undefined];
      const raw = req.method === "POST" ? await body(req) : (query ?? "");
      (this.calls[app] ??= []).push({ http: req.method ?? "", method, params: raw });
      const h = method === "batch" && !this.handlers.batch ? batchOf(this.handlers) : this.handlers[method];
      if (!h) { res.socket?.destroy(); return; }
      const out: any = h(new URLSearchParams(raw), app);
      if (out?.__drop) { res.socket?.destroy(); return; } // no answer at all (connection lost)
      res.statusCode = out?.__status ?? 200; // e.g. 503 for Bitrix's rate limit
      res.setHeader("content-type", "application/json");
      res.end(typeof out?.__raw === "string" ? out.__raw : JSON.stringify(out?.__status ? out.body : out));
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.port = (this.server!.address() as { port: number }).port;
  }

  async stop() { await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r())); }
}

const body = (req: IncomingMessage) => new Promise<string>((resolve) => {
  let s = ""; req.setEncoding("utf8"); req.on("data", (c) => (s += c)); req.on("end", () => resolve(s));
});

/**
 * Bitrix's `batch` method on top of the single-method handlers, as documented
 * (apidocs.bitrix24.com/settings/how-to-call-rest-api/batch.html): cmd[key] = "method?query",
 * commands run in order, $result[key][FIELD][0]… is replaced by an earlier answer (an unknown
 * reference by ""), halt=0 collects failures in result_error; empty parts come as [] (PHP).
 * A handler answering { __status } inside a batch counts as that command's error.
 * The whole batch is ONE recorded HTTP request.
 */
export function batchOf(handlers: Record<string, Handler>): Handler {
  return (p, app) => {
    const result: Record<string, unknown> = {}, errors: Record<string, unknown> = {};
    const halt = p.get("halt") === "1" || p.get("halt") === "true";
    const keys = [...p.keys()].map((k) => /^cmd\[([^\]]+)\]$/.exec(k)?.[1]).filter((k): k is string => !!k);
    for (const key of keys) {
      const cmd = p.get(`cmd[${key}]`) ?? "";
      const [method, query = ""] = cmd.split("?", 2) as [string, string?];
      const resolved = query.replace(/\$result((?:\[[^\]]*\])+)/g, (_m, path: string) => {
        let v: any = result;
        for (const seg of path.slice(1, -1).split("][")) v = v == null ? undefined : v[seg];
        return v == null || typeof v === "object" ? "" : encodeURIComponent(String(v));
      });
      const h = handlers[method];
      const out: any = h ? h(new URLSearchParams(resolved), app) : { error: "ERROR_METHOD_NOT_FOUND", error_description: "Method not found!" };
      const body = out?.__status ? out.body : out;
      if (body?.error) errors[key] = { error: body.error, error_description: body.error_description ?? "" };
      else result[key] = body?.result;
      if (halt && errors[key]) break;
    }
    const orEmpty = (o: Record<string, unknown>) => (Object.keys(o).length ? o : []);
    return { result: { result: orEmpty(result), result_error: orEmpty(errors), result_total: [], result_next: [], result_time: [] }, time: { start: 0 } };
  };
}
