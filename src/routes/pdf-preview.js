// src/routes/pdf-preview.js
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ProductModel from "../models/Product.js";
import pricingFactory from "../logic/pricing.js";

export const router = express.Router();
const pricing = pricingFactory(ProductModel);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the PDF.js viewer HTML
router.get("/viewer", async (req, res) => {
  try {
    const viewerPath = path.join(__dirname, "..", "templates", "pdf-viewer.html");
    const html = await fs.readFile(viewerPath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    console.error("[pdf-preview] viewer load failed:", e);
    res.status(500).send("PDF Viewer konnte nicht geladen werden");
  }
});

// Generate PDF for preview (returns PDF bytes)
router.post("/generate", async (req, res) => {
  try {
    const payload = req.body || {};
    
    // Reuse existing DOCX->PDF pipeline
    const { spawn } = await import("child_process");
    const os = await import("os");
    const Docxtemplater = (await import("docxtemplater")).default;
    const PizZip = (await import("pizzip")).default;
    
    const computed = await pricing.computePrices(payload);
    
    // Import your existing DOCX mapping
    const { mapOfferToDocxData } = await import("../logic/offerMapping.js");
    const data = mapOfferToDocxData(payload, computed);
    
    // Determine template based on offer type
    const offer = payload?.activeOffer || payload?.offerType || "bu";
    let templateFile = "Angebot.docx";
    if (offer === "bwt") templateFile = "Angebot-BWT.docx";
    else if (offer === "hl") templateFile = "Angebot-HL.docx";
    
    const templatePath = path.join(
      process.cwd(),
      "src",
      "templates",
      templateFile
    );
    
    const content = await fs.readFile(templatePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
    });
    
    doc.render(data);
    const docxBuffer = doc.getZip().generate({ type: "nodebuffer" });
    
    // Convert DOCX to PDF using LibreOffice
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-preview-"));
    const docxPath = path.join(tmpDir, "temp.docx");
    const pdfPath = path.join(tmpDir, "temp.pdf");
    
    try {
      await fs.writeFile(docxPath, docxBuffer);
      
      await new Promise((resolve, reject) => {
        const proc = spawn("libreoffice", [
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          tmpDir,
          docxPath,
        ]);
        
        const timeout = setTimeout(() => {
          proc.kill();
          reject(new Error("LibreOffice timeout"));
        }, 30000);
        
        proc.on("exit", (code) => {
          clearTimeout(timeout);
          code === 0 ? resolve() : reject(new Error(`LibreOffice exit ${code}`));
        });
        
        proc.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      const pdfBuffer = await fs.readFile(pdfPath);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      res.send(pdfBuffer);
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  } catch (e) {
    console.error("[pdf-preview] generation failed:", e);
    res.status(500).json({
      error: "PDF preview generation failed",
      detail: e.message || String(e),
    });
  }
});

export default router;