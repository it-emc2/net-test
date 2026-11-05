// onlinebrief24.de (letterei.de) API v1 client — port of ob24Fetch/getConfig in legacy
// src/routes/post.js. The auth object travels in the JSON body of EVERY request, GET included
// (fetch() refuses a GET body → GET goes through node:http/https).
// Differences (ADR 017): no production default URL outside production (config guard), the
// client never logs credentials or file contents, http:// allowed so tests can use a stub.
import http from "node:http";
import https from "node:https";

export interface Ob24Config {
  baseUrl: string | undefined; apiKey?: string | undefined; apiSecret?: string | undefined; mode?: string | undefined;
  /** only production may fall back to the real API when OB24_BASE_URL is unset */
  allowProductionDefault: boolean;
}
export class Ob24Error extends Error {
  constructor(message: string, readonly status: number, readonly payload: unknown, readonly apiPath: string, readonly method: string) { super(message); }
}

export const OB24_DEFAULT_BASE_URL = "https://api.onlinebrief24.de/v1";

export class Onlinebrief24 {
  constructor(private readonly c: Ob24Config) {}

  /** legacy getConfig: "test" parks the job in the Warenkorb (7 days), "live" sends immediately */
  config() {
    const baseUrl = String(this.c.baseUrl || OB24_DEFAULT_BASE_URL).replace(/\/$/, "");
    const mode = String(this.c.mode || "test").trim().toLowerCase() === "live" ? "live" : "test";
    if (!this.c.apiKey || !this.c.apiSecret) throw new Error("onlinebrief24 credentials missing. Set OB24_API_KEY and OB24_API_SECRET in .env.");
    if (!this.c.baseUrl && !this.c.allowProductionDefault) throw new Error("OB24_BASE_URL is not configured (outside production there is no default).");
    return { baseUrl, apiKey: this.c.apiKey, apiSecret: this.c.apiSecret, mode } as const;
  }

  async call(apiPath: string, { method = "POST", body }: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}) {
    const { baseUrl, apiKey, apiSecret, mode } = this.config();
    const url = `${baseUrl}${apiPath}`;
    const data = JSON.stringify({ auth: { apiKey, apiSecret, mode }, ...(body || {}) });
    const res = method === "GET" ? await jsonRequest(url, method, data) : await fetch(url, {
      method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: data,
    });
    const contentType = res.headers.get("content-type") || "";
    const payload: any = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
    if (!res.ok || (payload && typeof payload === "object" && payload.status && Number(payload.status) >= 400)) {
      const message = (typeof payload === "string" ? payload : payload?.message || payload?.error) || `onlinebrief24 error ${res.status}`;
      throw new Ob24Error(message, res.status >= 400 ? res.status : Number(payload?.status) || 500, payload, apiPath, method);
    }
    return payload;
  }
}

function jsonRequest(url: string, method: string, data: string): Promise<{ ok: boolean; status: number; headers: { get(n: string): string }; json(): Promise<any>; text(): Promise<string> }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === "http:" ? http : https;
    const req = lib.request({
      hostname: target.hostname, port: target.port || undefined, path: `${target.pathname}${target.search}`, method,
      headers: { "Content-Type": "application/json", Accept: "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve({
        ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0,
        headers: { get: (n) => String(res.headers[n.toLowerCase()] || "") },
        json: async () => JSON.parse(raw || "null"), text: async () => raw,
      }));
    });
    req.on("error", reject);
    req.end(data);
  });
}
