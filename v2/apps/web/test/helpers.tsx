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
    const h = handlers[key];
    if (!h) return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: `kein Handler: ${key}`, requestId: "t" } }), { status: 404 });
    const r = typeof h === "function" ? h(body) : h;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", impl);
  return { calls, count: (key: string) => calls.filter((c) => c.key === key).length };
}

export const USER = { email: "ap@example.test", name: "AP", role: "user" };

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<Providers client={newQueryClient()}><RouterProvider router={router} /></Providers>);
  return router;
}
