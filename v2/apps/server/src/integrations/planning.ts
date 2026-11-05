// Route-planning service client (legacy src/routes/planning.js notifyTerminNotHeld).
// Difference: no hard-coded production default URL — unset means "not configured" (ADR 017).
export interface PlanningClientOptions { baseUrl: string | undefined; apiKey?: string | undefined; fetchImpl?: typeof fetch }

export class PlanningClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: PlanningClientOptions) { this.fetchImpl = opts.fetchImpl ?? fetch; }

  private url(path: string) { return `${(this.opts.baseUrl ?? "").replace(/\/+$/, "")}${path}`; }
  private headers(): Record<string, string> { return this.opts.apiKey ? { "X-Api-Key": this.opts.apiKey } : {}; }

  private base() {
    if (!this.opts.baseUrl) throw new Error("PLANNING_API_BASE_URL is not configured");
    return this.url("");
  }

  /** GET /api/planning/current — status + body passed through (non-JSON → { ok, status, raw }). */
  async current(): Promise<{ status: number; body: unknown }> {
    const up = await this.fetchImpl(`${this.base()}/api/planning/current`, { headers: { Accept: "application/json", ...this.headers() } });
    const contentType = up.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return { status: up.status, body: await up.json() };
    return { status: up.status, body: { ok: up.ok, status: up.status, raw: await up.text() } };
  }

  /** GET /api/planning/stream — server-sent events, piped through by the route. */
  stream(signal: AbortSignal) {
    return this.fetchImpl(`${this.base()}/api/planning/stream`, { headers: { Accept: "text/event-stream", "Cache-Control": "no-cache", ...this.headers() }, signal });
  }

  /** Best-effort, never throws: { ok, found } or { ok:false, error }. */
  async notifyTerminNotHeld(a: { dealId: string; reason: string; by: string | null }) {
    if (!this.opts.baseUrl) return { ok: false as const, error: "PLANNING_API_BASE_URL is not configured" };
    try {
      const upstream = await this.fetchImpl(this.url("/api/planning/termin-not-held"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...this.headers() },
        body: JSON.stringify({ dealId: a.dealId, reason: a.reason, by: a.by }),
      });
      const body: any = await upstream.json().catch(() => ({}));
      return upstream.ok ? { ok: true as const, found: Boolean(body?.found) } : { ok: false as const, error: body?.message || `HTTP ${upstream.status}` };
    } catch (error) {
      return { ok: false as const, error: (error as Error)?.message || String(error) };
    }
  }
}
