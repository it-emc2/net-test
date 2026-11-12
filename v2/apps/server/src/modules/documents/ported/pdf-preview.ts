// @ts-nocheck
// GENERATED copy of src/routes/pdf-preview.js with 5 import/runtime rewrites (see v2/scripts/port-verbatim.mjs) — do not edit. Re-port: node v2/scripts/port-verbatim.mjs
// Drift guard: apps/server/test/verbatim-ports.test.ts
import express from "../shims/express.js";
import { docsRoot, docsLog } from "../shims/runtime.js";

import pricingFactory from "../shims/pricing.js";
import Product from "../shims/product-model.js";

// import helpers from docx-template
import {
  getAngebotTemplatePath,
  mapData,
  renderDocx,
  convertDocxToPdf,
  sanitizeRenderData,
  offerWordingRules,
} from "./docx-template.js";

const router = express.Router();
const pricing = pricingFactory(Product);

router.post("/pdf-preview", async (req, res) => {
  try {
    const templatePath = getAngebotTemplatePath(req.body);
    const computed = await pricing.computePrices(req.body || {});
    const dataRaw = await mapData(req.body || {}, computed);
    const data = sanitizeRenderData(dataRaw);

    const docxBuffer = await renderDocx(templatePath, data, offerWordingRules(req.body?.offerOverrides));
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="preview.pdf"');
    res.send(pdfBuffer);
  } catch (e) {
    docsLog.error("[pdf-preview] failed:", e);
    res.status(500).json({
      error: "PDF preview failed",
      detail: e.message || String(e),
    });
  }
});

export default router;
