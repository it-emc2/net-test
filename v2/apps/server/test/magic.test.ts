// MagicApi unit tests: token cache lifetime and the missing-base-URL guard.
import { describe, expect, it } from "vitest";
import type { AxiosInstance } from "axios";
import { MagicApi } from "../src/integrations/magic.js";

function fakeHttp() {
  const seen: string[] = [];
  let n = 0;
  const http = {
    post: async (url: string) => { seen.push(`login ${url}`); return { data: { token: `t${++n}` } }; },
    request: async (cfg: { url: string; headers: Record<string, string> }) => { seen.push(`${cfg.url} ${cfg.headers.Authorization}`); return { data: { ok: true } }; },
  } as unknown as AxiosInstance;
  return { http, seen };
}

describe("MagicApi", () => {
  it("reuses the token for 49 min, then logs in again", async () => {
    let now = 1_000_000;
    const { http, seen } = fakeHttp();
    const m = new MagicApi({ baseUrl: "http://m.test", user: "u", password: "p", http, now: () => now });
    await m.call("get", "/a");
    now += 48 * 60_000; await m.call("get", "/b");
    now += 2 * 60_000; await m.call("get", "/c");
    expect(seen).toEqual([
      "login http://m.test/api/auth/login", "http://m.test/a Bearer t1", "http://m.test/b Bearer t1",
      "login http://m.test/api/auth/login", "http://m.test/c Bearer t2",
    ]);
  });

  it("without EXTERNAL_API_BASE it fails clearly and calls nothing", async () => {
    const { http, seen } = fakeHttp();
    await expect(new MagicApi({ http }).call("get", "/api/health")).rejects.toThrow("EXTERNAL_API_BASE not configured");
    expect(seen).toEqual([]);
  });
});
