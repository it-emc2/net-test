// HTML → PDF via a shared headless-Chromium (Puppeteer) instance.
// One browser is reused across requests; each render gets its own page.
import puppeteer, { type Browser } from "puppeteer";

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  const b = await browserPromise;
  if (!b.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return b;
}

export interface PdfOptions {
  /** Per-page margins (reserve space for the repeating header/footer). */
  margin?: { top?: string; bottom?: string; left?: string; right?: string };
  /** Repeating page header/footer (Puppeteer templates; inline styles only). */
  headerTemplate?: string;
  footerTemplate?: string;
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const hasHF = Boolean(opts.headerTemplate || opts.footerTemplate);
    const data = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: hasHF,
      headerTemplate: opts.headerTemplate ?? "<span></span>",
      footerTemplate: opts.footerTemplate ?? "<span></span>",
      margin: {
        top: opts.margin?.top ?? "28mm",
        bottom: opts.margin?.bottom ?? "26mm",
        left: opts.margin?.left ?? "20mm",
        right: opts.margin?.right ?? "20mm",
      },
    });
    return Buffer.from(data);
  } finally {
    await page.close();
  }
}
