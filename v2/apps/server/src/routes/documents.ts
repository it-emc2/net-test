// Offer documents (phase 5a/5b): POST /docx-template (offer DOCX), /docx-template/material-overview,
// /docx-template/pdf (PDF via the PDF engine). The legacy module is ported mechanically
// (documents/ported/docx-template.ts, drift guard) and its own handlers run here unchanged.
import type { FastifyInstance } from "fastify";
import { configureDocuments, type DocumentsContext } from "../documents/context.js";
import { runLegacy } from "../documents/express-adapter.js";
import type { OfferDocuments } from "../email/ports.js";
import type { CapturingRouter } from "../documents/shims/express.js";
import type { SigningRenderer } from "../signing/documents.js";

export async function registerDocuments(app: FastifyInstance, ctx: DocumentsContext): Promise<{ offerDocuments: Omit<OfferDocuments, "productImagePdf">; signingRenderer: SigningRenderer }> {
  configureDocuments(ctx);
  const docx: any = await import("../documents/ported/docx-template.js");
  const router = docx.router as CapturingRouter;
  for (const [key, handler] of router.routes) {
    const [method, sub] = key.split(" ") as [string, string];
    const url = `/docx-template${sub === "/" ? "" : sub}`;
    app.route({ method: method as "POST", url, handler: (req, reply) => runLegacy(handler, req, reply) });
  }
  // signing documents (5c): ported legacy HTML templates, PDFs via the PDF engine
  const tpl: any = await import("../documents/ported/signing-docs.js");
  const signingRenderer: SigningRenderer = {
    renderData: (p) => docx.getOfferRenderData(p),
    offerPdf: async (p) => (await docx.generateOfferPdfBuffer(p)).pdfBuffer,
    angebotHtml: (data, o) => tpl.buildAngebotHtml(data, o), ahAngebotHtml: (data, o) => tpl.buildAhAngebotHtml(data, o),
    vollmachtHtml: (sr, doc, m) => tpl.buildVollmachtHtml(sr, doc, m), abtretungHtml: (sr, doc, m) => tpl.buildAbtretungHtml(sr, doc, m),
    zusatzblattHtml: (sr, doc, m) => tpl.buildZusatzblattHtml(sr, doc, m), abtretungAhHtml: (sr, doc, m) => tpl.buildAbtretungAhHtml(sr, doc, m),
    htmlToPdf: (html) => ctx.pdf.htmlToPdf(html),
  };
  return {
    offerDocuments: {
      renderOfferPdf: (p) => docx.generateOfferPdfBuffer(p),
      convertDocxToPdf: (b) => docx.convertDocxToPdf(b),
      getOfferRenderData: (p) => docx.getOfferRenderData(p),
    },
    signingRenderer,
  };
}
