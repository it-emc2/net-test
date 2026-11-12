// Admin views of the logs: Bitrix failures, PDF conversions, user actions (legacy src/routes/admin.js).
import type { FastifyInstance } from "fastify";
import { BitrixLog, PDF_LOG_APP, PdfLog, UserActionLog } from "../../platform/models.js";

export async function registerAdminLogs(app: FastifyInstance) {
  app.get("/admin/api/bitrix-logs", { config: { admin: true } }, async () => {
    const docs = await BitrixLog.find({}).sort({ createdAt: -1 }).limit(500).lean();
    return { items: docs, total: docs.length };
  });

  // Local soffice/Puppeteer warm medians from main's 2026-11 benchmark: the "before" baseline
  // until enough local/fallback rows exist in the window.
  const PDF_BASELINE_MS: Record<string, number> = { docx: 5100, html: 2400 };
  // per kind/engine counts + average ms, time saved, last 200 failures (main PR #322)
  app.get("/admin/api/pdf-stats", { config: { admin: true } }, async (req) => {
    const days = Math.min(180, Math.max(1, Number((req.query as Record<string, string | undefined>).days) || 30));
    const since = new Date(Date.now() - days * 864e5);
    const [groups, failures] = await Promise.all([
      PdfLog.aggregate([
        { $match: { app: PDF_LOG_APP, createdAt: { $gte: since } } },
        { $group: {
          _id: { kind: "$kind", engine: "$engine" },
          total: { $sum: 1 },
          ok: { $sum: { $cond: ["$ok", 1, 0] } },
          okMs: { $sum: { $cond: ["$ok", "$ms", 0] } },
          maxMs: { $max: "$ms" },
          last: { $max: "$createdAt" },
        } },
      ]),
      PdfLog.find({ app: PDF_LOG_APP, createdAt: { $gte: since }, ok: false }).sort({ createdAt: -1 }).limit(200).lean(),
    ]);
    const rows: any[] = groups.map((g: any) => ({ ...g._id, total: g.total, ok: g.ok, failed: g.total - g.ok, avgMs: g.ok ? Math.round(g.okMs / g.ok) : null, maxMs: g.maxMs, last: g.last }));
    const saved: Record<string, { baselineMs: number; measured: boolean; ms: number }> = {};
    for (const kind of ["docx", "html"]) {
      const got = rows.find((r) => r.kind === kind && r.engine === "gotenberg");
      const loc = rows.filter((r) => r.kind === kind && r.engine !== "gotenberg" && r.ok);
      const locN = loc.reduce((n, r) => n + r.ok, 0);
      const baselineMs = locN >= 5 ? Math.round(loc.reduce((n, r) => n + r.avgMs * r.ok, 0) / locN) : PDF_BASELINE_MS[kind]!;
      saved[kind] = { baselineMs, measured: locN >= 5, ms: got?.ok ? Math.max(0, Math.round(got.ok * (baselineMs - got.avgMs))) : 0 };
    }
    return { app: PDF_LOG_APP, days, rows, saved, failures };
  });

  app.get("/admin/api/user-action-logs", { config: { admin: true } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const filter: Record<string, string> = {};
    for (const k of ["event", "dealId", "offerNumber"] as const) { const v = String(q[k] || "").trim(); if (v) filter[k] = v; }
    const docs = await UserActionLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return { items: docs, total: docs.length };
  });
}
