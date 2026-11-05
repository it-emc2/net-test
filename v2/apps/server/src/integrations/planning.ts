// Route-planning service client (legacy src/routes/planning.js notifyTerminNotHeld).
// Difference: no hard-coded production default URL — unset means "not configured" (ADR 017).
export interface PlanningClientOptions { baseUrl: string | undefined; apiKey?: string | undefined; fetchImpl?: typeof fetch }

export class PlanningClient {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: PlanningClientOptions) { this.fetchImpl = opts.fetchImpl ?? fetch; }

  private url(path: string) { return `${(this.opts.baseUrl ?? "").replace(/\/+$/, "")}${path}`; }
  private headers(): Record<string, string> { return this.opts.apiKey ? { "X-Api-Key": this.opts.apiKey } : {}; }

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
