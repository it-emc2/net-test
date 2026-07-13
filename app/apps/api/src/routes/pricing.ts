// Pricing endpoint — computes offer pricing from a configurator payload.
// Wires the ported engine to the PRODUCTION resolver (Vigor-first, legacy
// Products fallback), so prices/stock reflect the live Vigor catalog.
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/authGate.js";
import { createPricing } from "../logic/pricing.js";
import { resolvePrices } from "../services/catalog.js";

const router = Router();
router.use(requireAuth);

const pricing = createPricing(resolvePrices);

// POST /api/pricing — body is the offer payload (same shape the legacy engine
// consumes). Returns the computed pricing object.
router.post("/", async (req: Request, res: Response) => {
  try {
    const payload = req.body?.payload ?? req.body ?? {};
    const result = await pricing.computePrices(payload);
    res.json(result);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[pricing] compute failed:", err);
    res.status(500).json({ error: "Preisberechnung fehlgeschlagen" });
  }
});

export default router;
