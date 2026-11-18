import { describe, expect, it } from "vitest";
import { loadConfig } from "@oc/config";
import { BitrixClient, buildQS, type BitrixFailureLog } from "../src/integrations/bitrix.js";

const json = (body: unknown) => ({ json: async () => body }) as Response;

function client(responses: unknown[], extra: Partial<ConstructorParameters<typeof BitrixClient>[0]> = {}) {
  let t = 1_000_000;
  const sleeps: number[] = [], urls: string[] = [], inits: RequestInit[] = [], logs: BitrixFailureLog[] = [];
  const bx = new BitrixClient({
    baseUrl: "http://127.0.0.1:1/rest/1/tok/",
    logFailure: async (e) => { logs.push(e); },
    fetchImpl: (async (url: string, init: RequestInit) => { urls.push(url); inits.push(init); return json(responses.shift()); }) as any,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    now: () => t,
    ...extra,
  });
  return { bx, sleeps, urls, inits, logs, tick: (ms: number) => (t += ms) };
}

describe("buildQS (legacy wire format)", () => {
  it("nests objects/arrays as a[b][0], skips null/undefined, keeps order", () => {
    expect(decodeURIComponent(buildQS({ filter: { ">=START_TIME": "x", TYPE_ID: 3 }, select: ["ID", "TITLE"], skip: null, u: undefined, f: false })))
      .toBe("filter[>=START_TIME]=x&filter[TYPE_ID]=3&select[0]=ID&select[1]=TITLE&f=false");
  });
});

describe("BitrixClient", () => {
  it("a hanging Bitrix ends with a clear timeout message instead of holding the call open (main PR #332)", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    let signal: AbortSignal | undefined;
    const c = client([], { minGapMs: 0, fetchImpl: (async (_u: string, init: RequestInit) => { signal = init.signal as AbortSignal; throw timeout; }) as any });
    await expect(c.bx.get("crm.deal.get", { id: 1 })).rejects.toThrow("Bitrix antwortet nicht (Zeitüberschreitung nach 15 s)");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(c.logs).toHaveLength(1);
    await expect(c.bx.post("crm.timeline.comment.add", { fields: { FILES: "x".repeat(300 * 1024) } })).rejects.toThrow("nach 60 s");
  });

  it("GET puts params in the query; POST sends form body; trailing slash in base tolerated", async () => {
    const c = client([{ result: 1 }, { result: 2 }], { minGapMs: 0 });
    await c.bx.get("crm.deal.get", { id: 5 });
    await c.bx.post("crm.item.update", { fields: { A: 1 } });
    expect(c.urls).toEqual(["http://127.0.0.1:1/rest/1/tok/crm.deal.get.json?id=5", "http://127.0.0.1:1/rest/1/tok/crm.item.update.json"]);
    expect(c.inits[1]).toMatchObject({ method: "POST", body: "fields%5BA%5D=1" });
  });

  it("throttles: consecutive calls start ≥ minGapMs apart", async () => {
    const c = client([{ result: 1 }, { result: 2 }, { result: 3 }]);
    await Promise.all([c.bx.get("a"), c.bx.get("b"), c.bx.get("c")]);
    expect(c.sleeps).toEqual([1000, 1000]);
  });

  it("retries 'Too many requests' 4× with 700·n backoff, then fails and logs once", async () => {
    const limited = { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" };
    const c = client([limited, limited, limited, limited, limited], { minGapMs: 0 });
    await expect(c.bx.get("crm.deal.get", { id: 1 })).rejects.toThrow("Too many requests");
    expect(c.urls).toHaveLength(5);
    expect(c.sleeps).toEqual([700, 1400, 2100, 2800]);
    expect(c.logs).toEqual([{ method: "crm.deal.get", message: "Too many requests", params: { id: 1 }, httpMethod: "GET" }]);
  });

  it("other errors fail immediately; invalid JSON is an error; missing base never calls out", async () => {
    const c = client([{ error: "X", error_description: "" }, null], { minGapMs: 0 });
    await expect(c.bx.get("m1")).rejects.toThrow("X");
    await expect(c.bx.get("m2")).rejects.toThrow("Invalid JSON response from Bitrix");
    expect(c.urls).toHaveLength(2);
    const none = client([], { baseUrl: undefined });
    await expect(none.bx.post("m3", { a: 1 })).rejects.toThrow("BITRIX_WEBHOOK_BASE is not configured");
    expect(none.urls).toHaveLength(0);
    expect(none.logs[0]).toMatchObject({ method: "m3", httpMethod: "POST" });
  });

  it("the rate limit is also recognised by its code alone and by HTTP 503 without a readable body", async () => {
    const c = client([{ error: "QUERY_LIMIT_EXCEEDED", error_description: "" }, { result: 1 }], { minGapMs: 0 });
    await expect(c.bx.get("m")).resolves.toEqual({ result: 1 });
    expect(c.sleeps).toEqual([700]);
    let n = 0;
    const c503 = client([], { minGapMs: 0, fetchImpl: (async () => (n++ < 2 ? ({ status: 503, json: async () => { throw new SyntaxError("x"); } }) : ({ status: 200, json: async () => ({ result: 2 }) }))) as any });
    await expect(c503.bx.get("m")).resolves.toEqual({ result: 2 });
    expect(c503.sleeps).toEqual([700, 1400]);
  });

  it("a failure says what kind it was (status, Bitrix code, attempts) with the message unchanged", async () => {
    const c = client([{ error: "ACCESS_DENIED", error_description: "Access denied" }], { minGapMs: 0 });
    await expect(c.bx.get("m")).rejects.toMatchObject({ message: "Access denied", kind: "refused", bitrixCode: "ACCESS_DENIED", attempts: 1 });
    const limited = { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" };
    const l = client([limited, limited, limited, limited, limited], { minGapMs: 0 });
    await expect(l.bx.get("m")).rejects.toMatchObject({ kind: "rate-limit", attempts: 5 });
  });

  it("batch: one POST with halt=0 and cmd[key]; empty parts come as []; a rate limit inside is retried; a bad shape is an error", async () => {
    const ok = { result: { result: { a: { ID: "1" } }, result_error: [], result_total: [], result_next: [], result_time: [] }, time: {} };
    const inside = { result: { result: [], result_error: { a: { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" } } } };
    const c = client([inside, ok, { result: "x" }], { minGapMs: 0 });
    await expect(c.bx.batch({ a: "crm.deal.get?id=1" })).resolves.toEqual({ result: { a: { ID: "1" } }, result_error: {} });
    expect(c.inits[0]).toMatchObject({ method: "POST", body: "halt=0&cmd%5Ba%5D=crm.deal.get%3Fid%3D1" });
    expect(c.urls[0]).toBe("http://127.0.0.1:1/rest/1/tok/batch.json");
    expect(c.sleeps).toEqual([700]);
    await expect(c.bx.batch({ a: "x" })).rejects.toMatchObject({ kind: "malformed" });
    await expect(c.bx.batch({})).rejects.toThrow(/1–50/);
    await expect(c.bx.batch(Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, "m"])))).rejects.toThrow(/1–50/);
  });

  it("a failing failure-log never masks the Bitrix error", async () => {
    const c = client([{ error: "boom" }], { minGapMs: 0, logFailure: async () => { throw new Error("db down"); } });
    await expect(c.bx.get("m")).rejects.toThrow("boom");
  });
});

describe("config guard", () => {
  it("outside production only a local Bitrix stub is allowed; production may use the real one", () => {
    expect(() => loadConfig({ NODE_ENV: "test", BITRIX_WEBHOOK_BASE: "https://example.bitrix24.de/rest/1/x" })).toThrow(/BITRIX_WEBHOOK_BASE/);
    expect(loadConfig({ NODE_ENV: "test", BITRIX_WEBHOOK_BASE: "http://127.0.0.1:5/rest/1/x" }).BITRIX_WEBHOOK_BASE).toContain("127.0.0.1");
    expect(loadConfig({ NODE_ENV: "development" }).BITRIX_WEBHOOK_BASE).toBeUndefined();
    expect(() => loadConfig({ NODE_ENV: "test", PLANNING_API_BASE_URL: "https://route-plannung.fly.dev" })).toThrow(/PLANNING_API_BASE_URL/);
  });
});
