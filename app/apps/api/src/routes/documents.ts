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

const router = Router();
router.use(requireAuth);

const MARGIN = { top: "28mm", bottom: "26mm", left: "20mm", right: "20mm" };

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

export default router;
