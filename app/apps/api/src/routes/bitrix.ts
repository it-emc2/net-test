// Bitrix24 integration. The offer begins from a deal id (opened from Bitrix),
// so this exposes the deal→contact prefill. Timeline comment + stage move +
// signing comments are added in later phases.
import { Router, type Request, type Response } from "express";
import type { DealPrefillResponse } from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import { bitrixConfigured, getDealPrefill, getActivitiesToday, getContactDeals } from "../services/bitrix.js";

const router = Router();
router.use(requireAuth);

// GET /api/bitrix/deal/:id/prefill — deal + linked-contact Kundendaten prefill.
router.get("/deal/:id/prefill", async (req: Request, res: Response) => {
  const dealId = String(req.params.id || "").trim();
  if (!dealId) return res.status(400).json({ error: "Deal-ID fehlt" });
  if (!bitrixConfigured()) return res.status(503).json({ error: "Bitrix nicht konfiguriert" });
  try {
    const result = await getDealPrefill(dealId);
    const body: DealPrefillResponse = result;
    return res.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bitrix] deal prefill error:", err);
    return res.status(502).json({ error: "Bitrix-Deal konnte nicht geladen werden" });
  }
});

// GET /api/bitrix/activities/today — {byDealId} time enrichment for the planning panel.
router.get("/activities/today", async (_req: Request, res: Response) => {
  if (!bitrixConfigured()) return res.status(503).json({ error: "Bitrix nicht konfiguriert" });
  try {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const byDealId = await getActivitiesToday(from.toISOString(), to.toISOString());
    return res.json({ byDealId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bitrix] activities/today error:", err);
    return res.status(502).json({ error: "Bitrix-Aktivitäten nicht erreichbar" });
  }
});

// GET /api/bitrix/contact/:id/deals — resolve a contact's deals.
router.get("/contact/:id/deals", async (req: Request, res: Response) => {
  const contactId = String(req.params.id || "").trim();
  if (!contactId) return res.status(400).json({ error: "Kontakt-ID fehlt" });
  if (!bitrixConfigured()) return res.status(503).json({ error: "Bitrix nicht konfiguriert" });
  try {
    return res.json({ deals: await getContactDeals(contactId) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bitrix] contact deals error:", err);
    return res.status(502).json({ error: "Deals konnten nicht geladen werden" });
  }
});

export default router;
