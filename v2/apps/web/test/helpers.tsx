import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { newQueryClient, Providers } from "../src/app/providers.js";
import { routes } from "../src/app/router.js";

export type Reply = { status?: number; body: unknown };
/** A fake server: `handlers["POST /api/price"]` answers that call; every call is recorded. */
export function fakeServer(handlers: Record<string, Reply | ((body: unknown) => Reply)>) {
  const calls: { key: string; body: unknown; signal: AbortSignal | undefined }[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ key, body, signal: init.signal ?? undefined });
    // "*" in a handler key stands for one path segment (e.g. a generated draft key)
    const pattern = key in handlers ? key : Object.keys(handlers).find((k) => (k.includes("*") && new RegExp("^" + k.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+") + "$").test(key)));
    const h = pattern ? handlers[pattern] : undefined;
    if (!h) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `kein Handler: ${key}`, requestId: "t" } }), { status: 404 });
    const r = typeof h === "function" ? h(body) : h;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", impl);
  return { calls, count: (key: string) => calls.filter((c) => c.key === key).length };
}

export const USER = { email: "ap@example.test", name: "AP", role: "user" };
export const NO_DRAFT: Reply = { status: 404, body: { error: { code: "NO_DRAFT", message: "Für diesen Auftrag gibt es noch keinen Entwurf", requestId: "t" }, revision: 0 } };
/** logged in, no draft anywhere, a fixed price, saving works */
export const BASE = {
  "GET /api/auth/me": { body: { user: USER } },
  "GET /api/deals/*/draft": NO_DRAFT,
  "POST /api/price": { body: { total: 10, selfPayAmount: 0 } },
} satisfies Record<string, Reply>;

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<Providers client={newQueryClient()}><RouterProvider router={router} /></Providers>);
  return router;
}
