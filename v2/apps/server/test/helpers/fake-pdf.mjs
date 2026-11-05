// TEST-ONLY deterministic "PDF": the bytes are a hash of the HTML that would have been
// printed, with volatile parts (dates, times, tokens, ids) normalised. Used for the legacy
// app (via fake-puppeteer.mjs) and for v2's test renderer, so equal bytes = equal document.
import { createHash } from "node:crypto";
export function normaliseHtml(html) {
  return String(html)
    .replace(/[0-9a-f]{48}/g, "<TOKEN>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<ISO>")
    .replace(/\d{1,2}\.\d{1,2}\.\d{4}(,? \d{1,2}:\d{2}(:\d{2})?)?/g, "<DATE>");
}
export function fakePdf(html) {
  return Buffer.from(`%PDF-1.4\n%fake ${createHash("sha256").update(normaliseHtml(html)).digest("hex")}\n%%EOF\n`);
}
