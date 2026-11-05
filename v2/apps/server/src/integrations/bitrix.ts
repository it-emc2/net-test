// Bitrix24 REST client — port of the legacy client in src/routes/bitrix.js (bxGet/bxPost).
// Same wire format (nested params as a[b][c] form/query encoding, `<base>/<method>.json`),
// same global throttle (≥ minGapMs between calls), same retry on "too many requests"
// (4×, 700 ms × attempt), every failure written to `bitrixlogs`.
// Differences (security, ADR 015): no hard-coded fallback webhook — the base URL is required;
// `fetch`/`sleep`/`now` are injectable so tests never reach Bitrix.

export type HttpMethod = "GET" | "POST";
export interface BitrixFailureLog { method: string; message: string; params: unknown; httpMethod: HttpMethod }

export interface BitrixClientOptions {
  baseUrl: string | undefined;
  logFailure: (entry: BitrixFailureLog) => Promise<unknown>;
  fetchImpl?: typeof fetch;
  minGapMs?: number;
  retries?: number;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Legacy buildQS: nested objects/arrays → key[sub][0]=value, null/undefined skipped. */
export function buildQS(params: Record<string, unknown> = {}): string {
  const sp = new URLSearchParams();
  const append = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) { value.forEach((v, i) => append(`${prefix}[${i}]`, v)); return; }
    if (typeof value === "object") { for (const [k, v] of Object.entries(value as Record<string, unknown>)) append(`${prefix}[${k}]`, v); return; }
    sp.append(prefix, String(value));
  };
  for (const [k, v] of Object.entries(params)) append(k, v);
  return sp.toString();
}

export class BitrixClient {
  private queueTail: Promise<number> = Promise.resolve(0);
  private readonly fetchImpl: typeof fetch;
  private readonly minGapMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: BitrixClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.minGapMs = opts.minGapMs ?? 1000;
    this.retries = opts.retries ?? 4;
    this.retryDelayMs = opts.retryDelayMs ?? 700;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
  }

  get configured() { return !!this.opts.baseUrl; }

  /** Serialise calls: each starts ≥ minGapMs after the previous one started (legacy throttleBxCall). */
  private throttle(): Promise<number> {
    const turn = this.queueTail.then(async (lastStart) => {
      const wait = lastStart + this.minGapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      return this.now();
    });
    this.queueTail = turn;
    return turn;
  }

  private async fetchOnce(method: string, params: Record<string, unknown>, http: HttpMethod) {
    const qs = buildQS(params);
    const base = this.opts.baseUrl!.replace(/\/+$/, "");
    const url = http === "GET" ? `${base}/${method}.json${qs ? `?${qs}` : ""}` : `${base}/${method}.json`;
    const res = await this.fetchImpl(url, {
      method: http,
      ...(http === "POST" && { headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: qs }),
    });
    const data: any = await res.json().catch(() => null);
    if (!data) throw new Error("Invalid JSON response from Bitrix");
    if (data.error) throw new Error(data.error_description || data.error);
    return data;
  }

  private async fail(method: string, params: unknown, err: unknown, http: HttpMethod): Promise<never> {
    const message = (err as Error)?.message || String(err);
    // legacy logBitrixFailure: fire-and-forget, never blocks or masks the original error
    void this.opts.logFailure({ method, message, params, httpMethod: http }).catch(() => {});
    throw err instanceof Error ? err : new Error(message);
  }

  async call(method: string, params: Record<string, unknown> = {}, http: HttpMethod = "GET"): Promise<any> {
    if (!this.opts.baseUrl) return this.fail(method, params, new Error("BITRIX_WEBHOOK_BASE is not configured (set it in env)."), http);
    for (let attempt = 0; ; attempt++) {
      try {
        await this.throttle();
        return await this.fetchOnce(method, params, http);
      } catch (err) {
        if (/too many requests/i.test((err as Error)?.message || "") && attempt < this.retries) {
          await this.sleep(this.retryDelayMs * (attempt + 1));
          continue;
        }
        return this.fail(method, params, err, http);
      }
    }
  }

  get(method: string, params: Record<string, unknown> = {}) { return this.call(method, params, "GET"); }
  post(method: string, params: Record<string, unknown> = {}) { return this.call(method, params, "POST"); }
}
