// legacy utils/htmlToPdf.js (Puppeteer) → PDF engine (Gotenberg, ADR 008); same options shape
import { pdfEngine } from "./runtime.js";
export const htmlToPdfBuffer = (html: string, opts: Record<string, unknown> = {}) => pdfEngine().htmlToPdf(html, opts);
export default htmlToPdfBuffer;
