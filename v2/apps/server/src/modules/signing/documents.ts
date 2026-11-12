// Which document is rendered how — port of legacy buildDocumentPdf / buildSignedPdf and the
// HTML switch of GET /api/signing/:token/documents/:key/html. The rendering itself (offer
// data, HTML templates, HTML→PDF) is a plug-in point owned by phase 5 (one rendering source
// for DOCX + signing HTML, ADR 008). Until then production uses UNAVAILABLE_SIGNING_RENDERER;
// the contract test plugs in the legacy templates.
import { baseDocKey, isAhOffer, payloadWithPaymentChoice, type SrLike } from "./fields.js";

type Mode = "pdf" | "display";
export interface SigningRenderer {
  renderData(payload: any): Promise<{ data: any; computed: any }>;
  /** unsigned offer PDF (DOCX → PDF pipeline) */
  offerPdf(payload: any): Promise<Buffer>;
  angebotHtml(data: any, opts: { mode: Mode; sr: SrLike; doc: any }): string;
  ahAngebotHtml(data: any, opts: { mode: Mode; sr: SrLike; doc: any }): string;
  vollmachtHtml(sr: SrLike, doc: any, mode: Mode): string;
  abtretungHtml(sr: SrLike, doc: any, mode: Mode): string;
  zusatzblattHtml(sr: SrLike, doc: any, mode: Mode): string;
  abtretungAhHtml(sr: SrLike, doc: any, mode: Mode): string;
  htmlToPdf(html: string): Promise<Buffer>;
}

const NOT_YET = "Dokumentenerzeugung für die Online-Unterschrift ist in v2 noch nicht verfügbar";
const fail = (): never => { throw new Error(NOT_YET); };
export const UNAVAILABLE_SIGNING_RENDERER: SigningRenderer = {
  renderData: async () => fail(), offerPdf: async () => fail(), htmlToPdf: async () => fail(),
  angebotHtml: fail, ahAngebotHtml: fail, vollmachtHtml: fail, abtretungHtml: fail, zusatzblattHtml: fail, abtretungAhHtml: fail,
};

const angebotFor = (r: SigningRenderer, data: any, opts: { mode: Mode; sr: SrLike; doc: any }) =>
  isAhOffer(opts.sr) ? r.ahAngebotHtml(data, opts) : r.angebotHtml(data, opts);

/** Template HTML for the non-offer documents, or null for an unknown key. */
function formHtml(r: SigningRenderer, sr: SrLike, key: string, doc: any, mode: Mode): string | null {
  if (baseDocKey(key) === "vollmacht") return r.vollmachtHtml(sr, doc, mode);
  if (baseDocKey(key) === "abtretung") return r.abtretungHtml(sr, doc, mode);
  if (key === "zusatzblatt") return r.zusatzblattHtml(sr, doc, mode);
  if (key === "abtretung_ah") return r.abtretungAhHtml(sr, doc, mode);
  return null;
}
const unsupported = (key: string) => new Error(`Dokumenttyp "${key}" wird noch nicht unterstützt`);

/** UNSIGNED PDF for on-screen viewing. */
export async function documentPdf(r: SigningRenderer, sr: SrLike, key: string): Promise<Buffer> {
  const doc = (sr.documents || []).find((d) => d.key === key);
  if (key === "angebot") return r.offerPdf(payloadWithPaymentChoice(sr, doc));
  // legacy defaults: Vollmacht/Abtretung get { key }, the AH forms {}
  const html = formHtml(r, sr, key, doc || (baseDocKey(key) === "vollmacht" || baseDocKey(key) === "abtretung" ? { key } : {}), "pdf");
  if (html === null) throw unsupported(key);
  return r.htmlToPdf(html);
}

/** FINAL SIGNED PDF (completion, manual send, postal download). */
export async function signedPdf(r: SigningRenderer, sr: SrLike, doc: any): Promise<Buffer> {
  if (doc.key === "angebot") {
    const { data } = await r.renderData(payloadWithPaymentChoice(sr, doc));
    return r.htmlToPdf(angebotFor(r, data, { mode: "pdf", sr, doc }));
  }
  const html = formHtml(r, sr, doc.key, doc, "pdf");
  if (html === null) throw unsupported(doc.key);
  return r.htmlToPdf(html);
}

/** Read-only HTML fragment for the signing page, or null when the key has no HTML view. */
export async function documentHtml(r: SigningRenderer, sr: SrLike, doc: any): Promise<string | null> {
  if (doc.key === "angebot") {
    const { data } = await r.renderData(payloadWithPaymentChoice(sr, doc));
    return angebotFor(r, data, { mode: "display", sr, doc });
  }
  return formHtml(r, sr, doc.key, doc, "display");
}
