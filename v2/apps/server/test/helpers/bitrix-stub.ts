// Recording Bitrix24 stub for contract tests. Serves `/rest/<user>/<app>/<method>.json`, where
// <app> tags the caller ("legacy" | "v2"), records every call (HTTP verb, method, raw encoded
// params in order) and answers with canned data. Methods without a handler drop the connection,
// which looks to the caller exactly like the dead port used before (fetch failed).
import { createServer, type IncomingMessage, type Server } from "node:http";

export interface RecordedCall { http: string; method: string; params: string }
export type Handler = (params: URLSearchParams, app: string) => unknown;

export class BitrixStub {
  private server?: Server;
  readonly calls: Record<string, RecordedCall[]> = {};
  port = 0;

  constructor(private readonly handlers: Record<string, Handler>) {}

  base(app: string) { return `http://127.0.0.1:${this.port}/rest/1/${app}`; }
  take(app: string) { const c = this.calls[app] ?? []; this.calls[app] = []; return c; }

  async start() {
    this.server = createServer(async (req, res) => {
      const m = /^\/rest\/\d+\/([^/]+)\/([^/?]+)\.json(?:\?(.*))?$/.exec(req.url ?? "");
      if (!m) { res.socket?.destroy(); return; }
      const [, app, method, query] = m as unknown as [string, string, string, string | undefined];
      const raw = req.method === "POST" ? await body(req) : (query ?? "");
      (this.calls[app] ??= []).push({ http: req.method ?? "", method, params: raw });
      const h = this.handlers[method];
      if (!h) { res.socket?.destroy(); return; }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(h(new URLSearchParams(raw), app)));
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.port = (this.server!.address() as { port: number }).port;
  }

  async stop() { await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r())); }
}

const body = (req: IncomingMessage) => new Promise<string>((resolve) => {
  let s = ""; req.setEncoding("utf8"); req.on("data", (c) => (s += c)); req.on("end", () => resolve(s));
});
