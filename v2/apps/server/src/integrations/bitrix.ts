// Bitrix24 REST client — port of the legacy client in src/routes/bitrix.js (bxGet/bxPost).
// Same wire format (nested params as a[b][c] form/query encoding, `<base>/<method>.json`),
// same global throttle (≥ minGapMs between calls), same retry on "too many requests"
// (4×, 700 ms × attempt), every failure written to `bitrixlogs`. The retry also recognises the
// rate limit by its code QUERY_LIMIT_EXCEEDED or HTTP 503 (documented answer of Bitrix), and
// inside a batch. `batch()` sends several methods in one request.
// Differences (security, ADR 015): no hard-coded fallback webhook — the base URL is required;
// `fetch`/`sleep`/`now` are injectable so tests never reach Bitrix.

export type HttpMethod = "GET" | "POST";
export const BX_TIMEOUT_MS = 15_000;
export const BX_UPLOAD_TIMEOUT_MS = 60_000;
const BX_LARGE_BODY_BYTES = 256 * 1024;

export interface BitrixFailureLog { method: string; message: string; params: unknown; httpMethod: HttpMethod }

/** What kind of failure a Bitrix call ended with (the error log reads it; the message is unchanged). */
export type BitrixFailureKind = "rate-limit" | "timeout" | "unreachable" | "refused" | "malformed" | "not-configured";
/**
 * A failed Bitrix call. `message` is exactly what callers saw before (legacy texts); the fields
 * say more for the error log: HTTP status, Bitrix's error code, how many attempts were made.
 */
export class BitrixError extends Error {
  override name = "BitrixError";
  status: number | null;
  bitrixCode: string | null;
  kind: BitrixFailureKind;
  attempts = 1;
  constructor(message: string, o: { kind: BitrixFailureKind; status?: number | null; bitrixCode?: string | null; cause?: unknown }) {
    super(message, o.cause === undefined ? undefined : { cause: o.cause });
    this.kind = o.kind;
    this.status = o.status ?? null;
    this.bitrixCode = o.bitrixCode ?? null;
  }
}
/** Bitrix's rate limit: "QUERY_LIMIT_EXCEEDED" / "Too many requests", answered with HTTP 503
 *  (apidocs.bitrix24.com/settings/performance/limits.html). Retried with back-off. */
export function isRateLimited(err: unknown): boolean {
  const e = err as Partial<BitrixError> | undefined;
  return /too many requests/i.test((err as Error)?.message || "") || e?.bitrixCode === "QUERY_LIMIT_EXCEEDED" || e?.status === 503;
}

/** One Bitrix batch answer (apidocs.bitrix24.com/settings/how-to-call-rest-api/batch.html):
 *  `result` per command key, `result_error` per failed command key ({ error, error_description });
 *  both come as an empty ARRAY when there is nothing in them. */
export interface BitrixBatchResult {
  result: Record<string, any>;
  result_error: Record<string, { error?: string; error_description?: string }>;
}
/** the most commands one batch may hold (more end with ERROR_BATCH_LENGTH_EXCEEDED) */
export const BX_BATCH_MAX = 50;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const emptyOrObj = (v: unknown) => isObj(v) || (Array.isArray(v) && v.length === 0);

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
    // A hung Bitrix socket must not hold the request (and the shared call queue) open forever
    // (main PR #332, audit S13). Large POSTs — timeline comments with PDFs — get more time.
    const timeoutMs = http === "POST" && qs.length > BX_LARGE_BODY_BYTES ? BX_UPLOAD_TIMEOUT_MS : BX_TIMEOUT_MS;
    const isTimeout = (e: unknown) => ["TimeoutError", "AbortError"].includes((e as Error)?.name);
    let data: any;
    let status: number | null = null;
    try {
      const res = await this.fetchImpl(url, {
        method: http,
        ...(http === "POST" && { headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: qs }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = typeof res.status === "number" ? res.status : null;
      data = await res.json().catch((e) => { if (isTimeout(e)) throw e; return null; });
    } catch (err) {
      if (isTimeout(err)) throw new BitrixError(`Bitrix antwortet nicht (Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s)`, { kind: "timeout", status, cause: err });
      throw new BitrixError((err as Error)?.message || String(err), { kind: "unreachable", status, cause: err });
    }
    if (!data) throw new BitrixError("Invalid JSON response from Bitrix", { kind: "malformed", status });
    if (data.error) throw new BitrixError(data.error_description || data.error, { kind: "refused", status, bitrixCode: String(data.error) });
    return data;
  }

  private async fail(method: string, params: unknown, err: unknown, http: HttpMethod, attempts = 1): Promise<never> {
    const message = (err as Error)?.message || String(err);
    // legacy logBitrixFailure: fire-and-forget, never blocks or masks the original error
    void this.opts.logFailure({ method, message, params, httpMethod: http }).catch(() => {});
    const e = err instanceof BitrixError ? err : err instanceof Error ? Object.assign(err, { attempts }) : new BitrixError(message, { kind: "refused" });
    if (e instanceof BitrixError) { e.attempts = attempts; if (isRateLimited(e)) e.kind = "rate-limit"; }
    throw e;
  }

  /** `check` may reject an answer that came back without a top-level error (the batch's inner rate limit). */
  private async run(method: string, params: Record<string, unknown>, http: HttpMethod, check?: (data: any) => void): Promise<any> {
    if (!this.opts.baseUrl) return this.fail(method, params, new BitrixError("BITRIX_WEBHOOK_BASE is not configured (set it in env).", { kind: "not-configured" }), http);
    for (let attempt = 0; ; attempt++) {
      try {
        await this.throttle();
        const data = await this.fetchOnce(method, params, http);
        check?.(data);
        return data;
      } catch (err) {
        if (isRateLimited(err) && attempt < this.retries) {
          await this.sleep(this.retryDelayMs * (attempt + 1));
          continue;
        }
        return this.fail(method, params, err, http, attempt + 1);
      }
    }
  }

  async call(method: string, params: Record<string, unknown> = {}, http: HttpMethod = "GET"): Promise<any> {
    return this.run(method, params, http);
  }

  /**
   * Several methods in ONE Bitrix request (method "batch", halt = 0: every command runs, failures
   * are collected per command). `cmd` maps a key to "method?param=value&…"; later commands may use
   * earlier answers with $result[key][FIELD]. Goes through the same queue, gap and retry as every
   * call; a command that hit the rate limit makes the whole batch count as rate-limited (retried).
   * Throws BitrixError (kind "malformed") when the answer does not have the documented shape.
   */
  async batch(cmd: Record<string, string>): Promise<BitrixBatchResult> {
    const keys = Object.keys(cmd);
    if (!keys.length || keys.length > BX_BATCH_MAX) throw new BitrixError(`batch needs 1–${BX_BATCH_MAX} commands`, { kind: "malformed" });
    const data = await this.run("batch", { halt: 0, cmd }, "POST", (d) => {
      const inner = d?.result;
      if (!isObj(inner) || !emptyOrObj(inner.result) || !(inner.result_error === undefined || emptyOrObj(inner.result_error))) {
        throw new BitrixError("Unexpected batch answer from Bitrix", { kind: "malformed" });
      }
      const limited = Object.values(isObj(inner.result_error) ? inner.result_error : {}).find((e: any) => isRateLimited({ bitrixCode: e?.error, message: e?.error_description }));
      if (limited) throw new BitrixError((limited as any).error_description || "Too many requests", { kind: "rate-limit", bitrixCode: "QUERY_LIMIT_EXCEEDED" });
    });
    const inner = data.result;
    return { result: isObj(inner.result) ? inner.result : {}, result_error: isObj(inner.result_error) ? (inner.result_error as BitrixBatchResult["result_error"]) : {} };
  }

  get(method: string, params: Record<string, unknown> = {}) { return this.call(method, params, "GET"); }
  post(method: string, params: Record<string, unknown> = {}) { return this.call(method, params, "POST"); }
}
