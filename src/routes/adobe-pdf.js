// src/routes/adobe-pdf.js
import express from "express";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { Readable } from "stream";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import ProductModel from "../models/Product.js";
import pricingFactory from "../logic/pricing.js";
import { mapData, getAngebotTemplatePath } from "./docx-template.js";

// Adobe PDF Services SDK imports
import {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  DocumentMergeParams,
  OutputFormat,
  DocumentMergeJob,
  DocumentMergeResult,
  CreatePDFJob,
  CreatePDFResult,
  SDKError,
  ServiceUsageError,
  ServiceApiError,
} from "@adobe/pdfservices-node-sdk";

export const router = express.Router();

const pricing = pricingFactory(ProductModel);

// -------- Helpers --------

function safeFileNameFromOffer(offerNumber = "", fallbackBase = "Angebot") {
  const raw = typeof offerNumber === "string" ? offerNumber : "";
  const base = raw || fallbackBase;
  const cleaned = base.replace(/[^a-zA-Z0-9_\-]/g, "_");
  return cleaned || fallbackBase;
}

/**
 * Initialize Adobe PDF Services credentials
 */
function getAdobeCredentials() {
  const clientId = process.env.PDF_SERVICES_CLIENT_ID;
  const clientSecret = process.env.PDF_SERVICES_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Adobe PDF Services credentials not configured. " +
        "Please set PDF_SERVICES_CLIENT_ID and PDF_SERVICES_CLIENT_SECRET environment variables."
    );
  }

  return new ServicePrincipalCredentials({
    clientId,
    clientSecret,
  });
}

/**
 * Render DOCX using docxtemplater (same as existing logic)
 */
async function renderDocxBuffer(body) {
  const templatePath = getAngebotTemplatePath(body);
  const content = await fs.readFile(templatePath);
  const computed = await pricing.computePrices(body || {});

  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  const data = mapData(body || {}, computed);

  try {
    doc.render(data);
  } catch (e) {
    const msg = e?.message || String(e);
    console.error("[adobe-pdf] Docxtemplater render error:", msg);
    if (e?.properties?.errors) {
      for (const er of e.properties.errors) {
        console.error("- Docx error:", {
          id: er.id,
          explanation: er.explanation,
          file: er.file,
          xtag: er.xtag,
        });
      }
    }
    throw new Error(`DOCX render failed: ${msg}`);
  }

  const docxBuffer = doc.getZip().generate({ type: "nodebuffer" });
  return { docxBuffer, data, computed };
}

/**
 * Convert a Node.js Buffer to a Readable stream
 */
function bufferToStream(buffer) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

/**
 * Convert DOCX buffer to PDF using Adobe PDF Services (CreatePDF)
 */
async function convertDocxToPdfAdobe(docxBuffer) {
  const credentials = getAdobeCredentials();
  const pdfServices = new PDFServices({ credentials });

  console.log("[adobe-pdf] Uploading DOCX to Adobe PDF Services...");

  // Create a readable stream from the buffer
  const readStream = bufferToStream(docxBuffer);

  // Upload the DOCX to Adobe
  const inputAsset = await pdfServices.upload({
    readStream,
    mimeType: MimeType.DOCX,
  });

  console.log("[adobe-pdf] Creating PDF conversion job...");

  // Create the PDF conversion job
  const job = new CreatePDFJob({
    inputAsset,
  });

  // Submit and wait for result
  const pollingURL = await pdfServices.submit({ job });
  console.log("[adobe-pdf] Job submitted, polling for result...");

  const pdfServicesResponse = await pdfServices.getJobResult({
    pollingURL,
    resultType: CreatePDFResult,
  });

  // Get the resulting PDF content
  const resultAsset = pdfServicesResponse.result.asset;
  const streamAsset = await pdfServices.getContent({ asset: resultAsset });

  console.log("[adobe-pdf] PDF conversion complete, collecting buffer...");

  // Collect the stream into a buffer
  const chunks = [];
  for await (const chunk of streamAsset.readStream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

/**
 * Generate PDF using Adobe Document Merge API
 * This merges JSON data directly into a template and outputs PDF
 */
async function generatePdfWithDocumentMerge(templateBuffer, jsonData) {
  const credentials = getAdobeCredentials();
  const pdfServices = new PDFServices({ credentials });

  console.log("[adobe-pdf] Uploading template for Document Merge...");

  const readStream = bufferToStream(templateBuffer);

  const inputAsset = await pdfServices.upload({
    readStream,
    mimeType: MimeType.DOCX,
  });

  console.log("[adobe-pdf] Creating Document Merge job...");

  const params = new DocumentMergeParams({
    jsonDataForMerge: jsonData,
    outputFormat: OutputFormat.PDF,
  });

  const job = new DocumentMergeJob({
    inputAsset,
    params,
  });

  const pollingURL = await pdfServices.submit({ job });
  console.log("[adobe-pdf] Document Merge job submitted, polling...");

  const pdfServicesResponse = await pdfServices.getJobResult({
    pollingURL,
    resultType: DocumentMergeResult,
  });

  const resultAsset = pdfServicesResponse.result.asset;
  const streamAsset = await pdfServices.getContent({ asset: resultAsset });

  console.log("[adobe-pdf] Document Merge complete, collecting buffer...");

  const chunks = [];
  for await (const chunk of streamAsset.readStream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

// ========================================
// Routes
// ========================================

/**
 * Health check / status endpoint
 */
router.get("/status", (req, res) => {
  const hasCredentials =
    !!process.env.PDF_SERVICES_CLIENT_ID &&
    !!process.env.PDF_SERVICES_CLIENT_SECRET;

  res.json({
    service: "Adobe PDF Services",
    configured: hasCredentials,
    endpoints: {
      docx: "POST /api/adobe-pdf/docx",
      pdf: "POST /api/adobe-pdf/pdf",
      "document-merge": "POST /api/adobe-pdf/document-merge",
    },
  });
});

/**
 * Generate DOCX using docxtemplater (same as existing, but routed here for consistency)
 */
router.post("/docx", async (req, res) => {
  try {
    const { docxBuffer, data } = await renderDocxBuffer(req.body);

    const baseName = safeFileNameFromOffer(data.Angebotsnummer, "Angebot");
    const fname = `${baseName}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(docxBuffer);
  } catch (e) {
    console.error("[adobe-pdf] DOCX generation failed:", e);
    res.status(500).json({
      error: "DOCX generation failed",
      detail: e.message || String(e),
    });
  }
});

/**
 * Generate PDF using Adobe PDF Services (CreatePDF API)
 * This first renders the DOCX with docxtemplater, then converts to PDF via Adobe
 */
router.post("/pdf", async (req, res) => {
  try {
    console.log("[adobe-pdf] Starting PDF generation...");

    // Step 1: Render DOCX with docxtemplater
    const { docxBuffer, data } = await renderDocxBuffer(req.body);
    console.log(
      `[adobe-pdf] DOCX rendered successfully (${docxBuffer.length} bytes)`
    );

    // Step 2: Convert DOCX to PDF using Adobe
    const pdfBuffer = await convertDocxToPdfAdobe(docxBuffer);
    console.log(
      `[adobe-pdf] PDF generated successfully (${pdfBuffer.length} bytes)`
    );

    const baseName = safeFileNameFromOffer(data.Angebotsnummer, "Angebot");
    const fname = `${baseName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error("[adobe-pdf] PDF generation failed:", e);

    // Provide helpful error messages
    let errorMessage = e.message || String(e);
    let statusCode = 500;

    if (e instanceof SDKError) {
      errorMessage = `Adobe SDK Error: ${e.message}`;
    } else if (e instanceof ServiceUsageError) {
      errorMessage = `Adobe Service Usage Error: ${e.message}`;
      statusCode = 429; // Rate limit or quota exceeded
    } else if (e instanceof ServiceApiError) {
      errorMessage = `Adobe API Error: ${e.message}`;
    }

    res.status(statusCode).json({
      error: "PDF generation failed",
      detail: errorMessage,
      type: e.constructor?.name || "Error",
    });
  }
});

/**
 * Generate PDF using Adobe Document Merge API
 * This is an alternative approach that uses Adobe's native template merging
 * Note: Requires Adobe-compatible template format (different from docxtemplater)
 */
router.post("/document-merge", async (req, res) => {
  try {
    console.log("[adobe-pdf] Starting Document Merge...");

    // Read the template
    const templatePath = getAngebotTemplatePath(req.body);
    const templateBuffer = await fs.readFile(templatePath);

    // Compute pricing and prepare data
    const computed = await pricing.computePrices(req.body || {});
    const data = mapData(req.body || {}, computed);

    // Use Adobe Document Merge
    const pdfBuffer = await generatePdfWithDocumentMerge(templateBuffer, data);
    console.log(
      `[adobe-pdf] Document Merge complete (${pdfBuffer.length} bytes)`
    );

    const baseName = safeFileNameFromOffer(data.Angebotsnummer, "Angebot");
    const fname = `${baseName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error("[adobe-pdf] Document Merge failed:", e);

    let errorMessage = e.message || String(e);
    let statusCode = 500;

    if (e instanceof SDKError) {
      errorMessage = `Adobe SDK Error: ${e.message}`;
    } else if (e instanceof ServiceUsageError) {
      errorMessage = `Adobe Service Usage Error: ${e.message}`;
      statusCode = 429;
    } else if (e instanceof ServiceApiError) {
      errorMessage = `Adobe API Error: ${e.message}`;
    }

    res.status(statusCode).json({
      error: "Document Merge failed",
      detail: errorMessage,
      type: e.constructor?.name || "Error",
    });
  }
});

/**
 * Batch generation: Returns both DOCX and PDF in a single request
 */
router.post("/batch", async (req, res) => {
  try {
    console.log("[adobe-pdf] Starting batch generation...");

    // Step 1: Render DOCX
    const { docxBuffer, data } = await renderDocxBuffer(req.body);

    // Step 2: Convert to PDF
    const pdfBuffer = await convertDocxToPdfAdobe(docxBuffer);

    const baseName = safeFileNameFromOffer(data.Angebotsnummer, "Angebot");

    // Return as JSON with base64-encoded files
    res.json({
      success: true,
      files: {
        docx: {
          filename: `${baseName}.docx`,
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          data: docxBuffer.toString("base64"),
          size: docxBuffer.length,
        },
        pdf: {
          filename: `${baseName}.pdf`,
          mimeType: "application/pdf",
          data: pdfBuffer.toString("base64"),
          size: pdfBuffer.length,
        },
      },
    });
  } catch (e) {
    console.error("[adobe-pdf] Batch generation failed:", e);
    res.status(500).json({
      error: "Batch generation failed",
      detail: e.message || String(e),
    });
  }
});

export default router;