// src/utils/htmlToPdf.js
//
// Render a full HTML string to an A4 PDF buffer using Puppeteer (Chromium
// print-to-PDF). Used by the online-signing flow to turn HTML document
// templates (Vollmacht, Abtretung, signature sheet) into final PDFs.
//
// A single browser instance is reused across calls for speed.

import puppeteer from "puppeteer";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    // In production (Docker/Fly) point at the system Chromium via
    // PUPPETEER_EXECUTABLE_PATH; locally puppeteer uses its bundled download.
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
      ],
    });
  }
  const browser = await browserPromise;
  // If the browser died (e.g. crashed), reset so the next call relaunches.
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

/**
 * @param {string} html  full HTML document string
 * @param {object} [opts]
 * @param {string} [opts.format="A4"]
 * @param {object} [opts.margin] page margins (CSS units), default 18mm all round
 * @returns {Promise<Buffer>} PDF bytes
 */
export async function htmlToPdfBuffer(html, opts = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: opts.format || "A4",
      printBackground: true,
      margin: opts.margin || {
        top: "18mm",
        bottom: "18mm",
        left: "18mm",
        right: "18mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    if (b) await b.close().catch(() => {});
  }
}
