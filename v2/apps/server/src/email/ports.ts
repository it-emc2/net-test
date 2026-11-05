// Plug-in points of the offer email flow that belong to other phases:
//  - OfferDocuments → Phase 5 (DOCX/PDF rendering, product image PDF)
//  - SigningPort    → implemented by v2's own signing service since 4g (routes/signing.ts)
// Until phase 5 lands, production uses UNAVAILABLE_DOCUMENTS below (the send fails
// cleanly with 500 "Send failed", nothing is sent, the deal lock is released). Tests inject
// implementations (contract test: bridges to the legacy code, so only the email flow is compared).

export interface OfferRender { pdfBuffer: Buffer; computed: any; data: any }
export interface OfferDocuments {
  renderOfferPdf(payload: any): Promise<OfferRender>;
  convertDocxToPdf(docx: Buffer): Promise<Buffer>;
  getOfferRenderData(payload: any): Promise<{ computed: any; data: any }>;
  /** null when there is nothing to show */
  productImagePdf(payload: any, computed: any, opts: { excludeIds: Set<string>; customImages: Record<string, string> }): Promise<Buffer | null>;
}

export interface SigningPort {
  createRequest(a: { payload: any; offerNumber: string; offerType: string; dealId: string; contactId: string; baseUrl: string; force: boolean }): Promise<{ link: string }>;
}

const notYet = (what: string) => async (): Promise<never> => { throw new Error(`${what} ist in v2 noch nicht verfügbar`); };
export const UNAVAILABLE_DOCUMENTS: OfferDocuments = {
  renderOfferPdf: notYet("PDF-Erzeugung"), convertDocxToPdf: notYet("PDF-Erzeugung"),
  getOfferRenderData: notYet("PDF-Erzeugung"), productImagePdf: notYet("Produktbilder-PDF"),
};
export const UNAVAILABLE_SIGNING: SigningPort = { createRequest: notYet("Online-Unterschrift") };
