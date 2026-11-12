// Documents (phase 5). Legacy routers are ported mechanically (documents/ported, ADR 019) and
// their own Express handlers run here unchanged (express-adapter):
//   /docx-template (offer DOCX, Materialübersicht, PDF) · /kalkulation/* · /arbeitsbericht/* +
//   /api/arbeitsbericht/* · /api/docx/pdf-preview · /material-overview/* (carts, online orders,
//   PDF) · /api/hl/parse-flexofit-offer (upload) · /pdf (request summary) · product images.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { configureDocuments, type DocumentsContext } from "./context.js";
import { runLegacy } from "./express-adapter.js";
import type { OfferDocuments } from "../email/index.js";
import type { CapturingRouter } from "./shims/express.js";
import type { SigningRenderer } from "../signing/index.js";
import { productImages } from "./product-images.js";
import { externalKeyGuard } from "../../platform/external-key.js";

export interface DocumentsDeps extends DocumentsContext { externalApiKey?: string | undefined }

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, message: string) =>
  reply.status(status).send({ error: { code: "DOCUMENT_ERROR", message, requestId: req.id } });

export async function registerDocuments(app: FastifyInstance, ctx: DocumentsDeps): Promise<{ offerDocuments: OfferDocuments; signingRenderer: SigningRenderer }> {
  configureDocuments(ctx);
  const docx: any = await import("./ported/docx-template.js");
  const kalk: any = await import("./ported/kalkulation.js");
  const arb: any = await import("./ported/arbeitsbericht.js");
  const preview: any = await import("./ported/pdf-preview.js");
  const img: any = await import("./ported/product-image-pdf.js");
  const material: any = await import("./ported/material-overview.js");
  const hl: any = await import("./ported/hl-parse.js");
  const summary: any = await import("./ported/pdf-summary.js");

  const mount = (router: CapturingRouter, prefix: string, opts: (sub: string) => Record<string, unknown> = () => ({})) => {
    for (const [key, handler] of router.routes) {
      const [method, sub] = key.split(" ") as [string, string];
      const url = `${prefix}${sub === "/" ? "" : sub}`;
      app.route({ method: method as "POST", url, ...opts(sub), handler: (req, reply) => runLegacy(handler, req, reply) });
    }
  };
  mount(docx.router ?? docx.default, "/docx-template");
  mount(kalk.default, "/kalkulation");
  mount(preview.default, "/api/docx");
  mount(material.router, "/material-overview");
  mount(hl.router, "/api/hl");
  mount(summary.router, "/pdf");
  // legacy mounts the Arbeitsbericht twice; only /api/arbeitsbericht/external/* is for machine callers (API key)
  mount(arb.default, "/arbeitsbericht");
  mount(arb.default, "/api/arbeitsbericht", (sub) => (sub.startsWith("/external") ? { config: { public: true }, onRequest: externalKeyGuard(ctx.externalApiKey) } : {}));

  // ---- product images (legacy email.js helpers) ----
  const images = productImages({
    root: ctx.root, getOfferRenderData: (p) => docx.getOfferRenderData(p), aggregateMaterialsForOverview: (p, c) => docx.aggregateMaterialsForOverview(p, c),
    pdf: img, adminSkipIds: () => ctx.businessConfig.get("PRODUCT_IMAGE_SKIP_IDS", []) || [],
  });
  app.post("/api/email/product-image-list", async (req, reply) => {
    try {
      const b = (req.body ?? {}) as any;
      return await images.list(b.payload || b || {});
    } catch (e) {
      req.log.error({ err: e }, "product-image-list failed");
      return fail(req, reply, 500, (e as Error).message);
    }
  });
  app.post("/api/email/preview-product-image-pdf", async (req, reply) => {
    try {
      const { payload = {}, excludeProductImageIds = [], productCustomImageData = {} } = (req.body ?? {}) as any;
      const buf = await images.preview(payload, excludeProductImageIds, productCustomImageData);
      if (!buf) return reply.status(204).send();
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", "inline").send(buf);
    } catch (e) {
      req.log.error({ err: e }, "preview-product-image-pdf failed");
      return fail(req, reply, 500, (e as Error).message);
    }
  });

  // ---- signing documents (5c) ----
  const tpl: any = await import("./ported/signing-docs.js");
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
      productImagePdf: (p, c, o) => images.forSend(p, c, o),
    },
    signingRenderer,
  };
}
