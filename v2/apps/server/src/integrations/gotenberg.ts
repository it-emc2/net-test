// PDF engine (ADR 008): one Gotenberg container replaces LibreOffice (DOCX→PDF) and Puppeteer
// (HTML→PDF). Internal service, no data leaves the host.
export interface PdfEngine {
  docxToPdf(docx: Buffer): Promise<Buffer>;
  htmlToPdf(html: string, opts?: { footerTemplate?: string; margin?: Record<string, string>; format?: string }): Promise<Buffer>;
}

const MM_PER_INCH = 25.4;
/** "18mm" | "1cm" | "0.5in" → inches (Gotenberg units) */
export function toInches(v: string | undefined, dflt = 18 / MM_PER_INCH) {
  if (!v) return dflt;
  const m = /^([\d.]+)\s*(mm|cm|in|px)?$/.exec(String(v).trim());
  if (!m) return dflt;
  const n = Number(m[1]);
  switch (m[2] || "px") { case "mm": return n / MM_PER_INCH; case "cm": return (n * 10) / MM_PER_INCH; case "in": return n; default: return n / 96; }
}

export class Gotenberg implements PdfEngine {
  constructor(private readonly c: { baseUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }) {}

  private async post(route: string, form: FormData): Promise<Buffer> {
    const f = this.c.fetchImpl ?? fetch;
    const res = await f(`${this.c.baseUrl.replace(/\/+$/, "")}${route}`, { method: "POST", body: form, signal: AbortSignal.timeout(this.c.timeoutMs ?? 120_000) });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`PDF engine error: HTTP ${res.status}${detail ? ` - ${detail.slice(0, 200)}` : ""}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  docxToPdf(docx: Buffer) {
    const form = new FormData();
    form.append("files", new Blob([new Uint8Array(docx)]), "document.docx");
    return this.post("/forms/libreoffice/convert", form);
  }

  htmlToPdf(html: string, opts: { footerTemplate?: string; margin?: Record<string, string>; format?: string } = {}) {
    const form = new FormData();
    form.append("files", new Blob([html], { type: "text/html" }), "index.html");
    if (opts.footerTemplate) form.append("files", new Blob([`<html><body>${opts.footerTemplate}</body></html>`], { type: "text/html" }), "footer.html");
    // A4 like legacy page.pdf({ format: "A4", printBackground: true, margin 18 mm })
    form.append("paperWidth", "8.27"); form.append("paperHeight", "11.7");
    const m = opts.margin ?? {};
    form.append("marginTop", String(toInches(m.top))); form.append("marginBottom", String(toInches(m.bottom)));
    form.append("marginLeft", String(toInches(m.left))); form.append("marginRight", String(toInches(m.right)));
    form.append("printBackground", "true");
    return this.post("/forms/chromium/convert/html", form);
  }
}
