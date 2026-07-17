// Document generation (Angebot). HTML → PDF via Puppeteer with a repeating
// logo header + impressum/page-number footer and per-page margins.
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/authGate.js";
import { htmlToPdf } from "../services/pdf.js";
import {
  renderAngebotHtml,
  headerTemplate,
  footerTemplate,
  sampleAngebotData,
} from "../logic/angebotTemplate.js";
import { buildAngebotData } from "../logic/angebotData.js";
import { createPricing } from "../logic/pricing.js";
import { resolvePrices } from "../services/catalog.js";

const router = Router();
router.use(requireAuth);

const pricing = createPricing(resolvePrices);

// Render the Angebot HTML for a live payload (payload = the configurator body).
async function angebotHtmlFromPayload(payload: unknown): Promise<string> {
  const computed = await pricing.computePrices((payload || {}) as Record<string, unknown>);
  return renderAngebotHtml(buildAngebotData(payload as Record<string, unknown>, computed));
}

function safeName(offerNumber: unknown): string {
  const s = String(offerNumber || "Angebot").replace(/[^a-zA-Z0-9_-]/g, "_");
  return s || "Angebot";
}

const MARGIN = { top: "31mm", bottom: "30mm", left: "20mm", right: "20mm" };

async function renderPdf(html: string): Promise<Buffer> {
  return htmlToPdf(html, { margin: MARGIN, headerTemplate: headerTemplate(), footerTemplate: footerTemplate() });
}

// --- sample endpoints (verify layout/pagination before live data is wired) ---

// GET /api/documents/angebot.sample.html — the body HTML (browser preview).
router.get("/angebot.sample.html", (_req: Request, res: Response) => {
  res.type("html").send(renderAngebotHtml(sampleAngebotData()));
});

// GET /api/documents/angebot.sample.pdf — full paged PDF with header/footer.
router.get("/angebot.sample.pdf", async (_req: Request, res: Response) => {
  try {
    const pdf = await renderPdf(renderAngebotHtml(sampleAngebotData()));
    res.type("application/pdf").set("Content-Disposition", 'inline; filename="angebot-sample.pdf"').send(pdf);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[documents] sample pdf error:", err);
    res.status(500).json({ error: "PDF-Erstellung fehlgeschlagen" });
  }
});

// --- live endpoints (body = configurator payload) ---

// POST /api/documents/angebot.html — body HTML for a real payload (preview).
router.post("/angebot.html", async (req: Request, res: Response) => {
  try {
    res.type("html").send(await angebotHtmlFromPayload(req.body));
  } catch (err) {
    console.error("[documents] angebot.html error:", err);
    res.status(500).json({ error: "Vorschau fehlgeschlagen" });
  }
});

// POST /api/documents/angebot.pdf — paged PDF for a real payload.
router.post("/angebot.pdf", async (req: Request, res: Response) => {
  try {
    const pdf = await renderPdf(await angebotHtmlFromPayload(req.body));
    const fname = `${safeName((req.body || {}).offerNumber)}.pdf`;
    res
      .type("application/pdf")
      .set("Content-Disposition", `inline; filename="${fname}"`)
      .send(pdf);
  } catch (err) {
    console.error("[documents] angebot.pdf error:", err);
    res.status(500).json({ error: "PDF-Erstellung fehlgeschlagen" });
  }
});

export default router;
