// Bitrix24 integration. The offer begins from a deal id (opened from Bitrix),
// so this exposes the deal→contact prefill. Timeline comment + stage move +
// signing comments are added in later phases.
import { Router, type Request, type Response } from "express";
import type { DealPrefillResponse } from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import { bitrixConfigured, getDealPrefill } from "../services/bitrix.js";

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

export default router;
