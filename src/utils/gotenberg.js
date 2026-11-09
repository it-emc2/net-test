// src/utils/gotenberg.js
//
// Optional PDF engine (same approach as v2, ADR 008): with GOTENBERG_URL set,
// DOCX→PDF and HTML→PDF go to one Gotenberg container (LibreOffice + Chromium
// inside) instead of a local soffice process / Puppeteer browser.
export const GOTENBERG_URL = (process.env.GOTENBERG_URL || "").replace(/\/+$/, "");
// fetch() rejects URLs with credentials → split "https://user:pass@host" into URL + Basic header.
const u = GOTENBERG_URL ? new URL(GOTENBERG_URL) : null;
const AUTH = u?.username ? { Authorization: "Basic " + Buffer.from(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`).toString("base64") } : {};
const BASE = u ? `${u.origin}${u.pathname.replace(/\/+$/, "")}` : "";

// "18mm" | "1cm" | "0.5in" | "96px" → inches (Gotenberg units)
export function toInches(v, dflt = 18 / 25.4) {
  const m = /^([\d.]+)\s*(mm|cm|in|px)?$/.exec(String(v ?? "").trim());
  if (!m) return dflt;
  const n = Number(m[1]);
  return { mm: n / 25.4, cm: n / 2.54, in: n }[m[2]] ?? n / 96;
}

async function post(route, form) {
  const res = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: AUTH,
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gotenberg HTTP ${res.status}${detail ? ` - ${detail.slice(0, 200)}` : ""}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function gotenbergDocxToPdf(docx) {
  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(docx)]), "document.docx");
  // Match desktop soffice's export defaults; without these the 2560px header image
  // stays lossless and the offer PDF grows 181 KB → 667 KB.
  form.append("reduceImageResolution", "true");
  form.append("maxImageResolution", "300");
  form.append("quality", "90");
  return post("/forms/libreoffice/convert", form);
}

export function gotenbergHtmlToPdf(html, opts = {}) {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  if (opts.footerTemplate) {
    form.append("files", new Blob([`<html><body>${opts.footerTemplate}</body></html>`], { type: "text/html" }), "footer.html");
  }
  form.append("paperWidth", "8.27"); // A4
  form.append("paperHeight", "11.7");
  const m = opts.margin || {};
  for (const [k, side] of [["marginTop", "top"], ["marginBottom", "bottom"], ["marginLeft", "left"], ["marginRight", "right"]]) {
    form.append(k, String(toInches(m[side])));
  }
  form.append("printBackground", "true");
  return post("/forms/chromium/convert/html", form);
}
