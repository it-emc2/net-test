// Product pictures and plan photos — the rules of today's UI (src/public/EmailManager.js;
// reference: test/fixtures/versand-bilder.json, v2/scripts/capture-versand-bilder.cjs):
//  - "Produktbilder-PDF anhängen": the server names the offer's products; each one with a
//    picture can be ticked (the server says which are ticked to begin with), one without can get
//    an own picture and is ticked with it. With the tick on and at least one product ticked the
//    mail gets one more attachment
//  - "Grundriss / Fotos": pictures for Bitrix only. They are made smaller (longest side 1600 px,
//    JPEG) because a screenshot of the iPad is about 4 MB, and a picture with a name that says
//    nothing ("image.png", "Screenshot …") is called "Grundriss_<day>_<n>.jpg"
type Fields = Record<string, unknown>;
export interface Product { productId: string; name: string; finish?: string | null; qty?: number | string | null; unit?: string | null; hasImage?: boolean; imageUrl?: string | null; defaultInclude?: boolean }
export interface PictureState { on: boolean; products: Product[] | null; failed: boolean; ticks: Record<string, boolean>; own: Record<string, string> }
export const NO_PICTURES: PictureState = { on: false, products: null, failed: false, ticks: {}, own: {} };

export const hasPicture = (p: Product, s: PictureState): boolean => !!p.hasImage || !!s.own[p.productId];
/** ticked: what was chosen here, else what the server proposes — never without a picture */
export const isTicked = (p: Product, s: PictureState): boolean => hasPicture(p, s) && (p.productId in s.ticks ? s.ticks[p.productId]! : !!p.defaultInclude);
export const quantity = (p: Product): string => `${p.qty ?? ""} ${p.unit || "Stck."}`.trim();
/** the products the PDF leaves out (everything not ticked) */
export const leftOut = (s: PictureState): string[] => (s.products ?? []).filter((p) => !isTicked(p, s)).map((p) => p.productId);
/** the list arrived: every product gets its tick (kept from before, else the server's proposal) */
export function withProducts(s: PictureState, products: Product[]): PictureState {
  const next: PictureState = { ...s, products, failed: false };
  return { ...next, ticks: Object.fromEntries(products.map((p) => [p.productId, isTicked(p, { ...next, ticks: s.ticks })])) };
}
/** an own picture: the product can be ticked now, and is */
export const withOwnPicture = (s: PictureState, id: string, dataUrl: string): PictureState => ({ ...s, own: { ...s.own, [id]: dataUrl }, ticks: { ...s.ticks, [id]: true } });
/** the attachment the mail gets, null while the tick is off or no product is ticked */
export function picturesFile(s: PictureState, offerNumber: unknown): { name: string; meta: string } | null {
  if (!s.on || !(s.products ?? []).some((p) => isTicked(p, s))) return null;
  return { name: `Produktbilder_${String(offerNumber || "Angebot").replace(/[^\w-]+/g, "_")}.pdf`, meta: "Produktbilder" };
}
/** what the send (and the preview) carries about the pictures */
export function pictureFields(s: PictureState): Fields {
  return s.on ? { includeProductImages: "1", excludeProductImageIds: JSON.stringify(leftOut(s)), productCustomImageData: JSON.stringify(s.own) } : { includeProductImages: "" };
}

// ---- plan photos ----
export const MAX_EDGE = 1600;
export const isImage = (f: { type?: string }): boolean => /^image\//.test(f.type || "");
/** the size a picture is made: its longest side at most MAX_EDGE, never larger than it is */
export function fitted(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
export const jpgName = (name: string): string => `${(name || "Grundriss").replace(/\.[^.]+$/, "")}.jpg`;
/** screenshots are all called "image.png": such a name is replaced by "Grundriss_<day>_<n>.jpg" */
export const planName = (name: string, day: string, n: number): string => (/^(image|screenshot|img)[-_. 0-9]*\.(jpe?g|png)$/i.test(name) ? `Grundriss_${day}_${n}.jpg` : name);
