import express from "express";

import pricingFactory from "../logic/pricing.js";
import Product from "../models/Product.js";

// import helpers from docx-template
import {
  getAngebotTemplatePath,
  mapData,
  renderDocx,
  convertDocxToPdf,
} from "./docx-template.js";

const router = express.Router();
const pricing = pricingFactory(Product);

router.post("/pdf-preview", async (req, res) => {
  try {
    const templatePath = getAngebotTemplatePath(req.body);
    const computed = await pricing.computePrices(req.body || {});
    const data = mapData(req.body || {}, computed);

    const docxBuffer = await renderDocx(templatePath, data);
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="preview.pdf"');
    res.send(pdfBuffer);
  } catch (e) {
    console.error("[pdf-preview] failed:", e);
    res.status(500).json({
      error: "PDF preview failed",
      detail: e.message || String(e),
    });
  }
});

export default router;