// Gotenberg client: units + request shape (fake fetch). Real conversions: documents-golden.test.ts.
import { describe, expect, it } from "vitest";
import { Gotenberg, toInches, withPdfLog } from "../src/integrations/gotenberg.js";
import { runLegacy } from "../src/documents/express-adapter.js";
import Fastify from "fastify";

describe("Gotenberg client", () => {
  it("margins: mm/cm/in/px → inches; default 18 mm", () => {
    expect(toInches("25.4mm")).toBeCloseTo(1); expect(toInches("2.54cm")).toBeCloseTo(1); expect(toInches("1in")).toBe(1);
    expect(toInches("96px")).toBe(1); expect(toInches(undefined)).toBeCloseTo(18 / 25.4); expect(toInches("bogus")).toBeCloseTo(18 / 25.4);
  });
  it("HTML → A4 chromium route with margins, background and optional footer; errors carry the status", async () => {
    const seen: any[] = [];
    const fetchImpl = (async (url: string, init: any) => {
      seen.push({ url, form: Object.fromEntries([...(init.body as FormData).entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name])) });
      return seen.length === 1 ? new Response("%PDF-1") : new Response("boom", { status: 503 });
    }) as unknown as typeof fetch;
    const g = new Gotenberg({ baseUrl: "http://pdf.test/", fetchImpl });
    expect((await g.htmlToPdf("<p>x</p>", { footerTemplate: "<span>1</span>", margin: { top: "10mm" } })).toString()).toBe("%PDF-1");
    expect(seen[0].url).toBe("http://pdf.test/forms/chromium/convert/html");
    expect(seen[0].form).toMatchObject({ paperWidth: "8.27", paperHeight: "11.7", printBackground: "true", files: "footer.html" });
    expect(Number(seen[0].form.marginTop)).toBeCloseTo(10 / 25.4);
    await expect(g.docxToPdf(Buffer.from("x"))).rejects.toThrow("PDF engine error: HTTP 503 - boom");
    expect(seen[1].url).toBe("http://pdf.test/forms/libreoffice/convert");
  });
});

describe("PDF engine: main sync 2026-11-12", () => {
  it("DOCX conversion sends main's image export settings (PR #320)", async () => {
    let form: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: any) => {
      form = Object.fromEntries([...(init.body as FormData).entries()].map(([k, v]) => [k, typeof v === "string" ? v : (v as File).name]));
      return new Response("%PDF-1");
    }) as unknown as typeof fetch;
    await new Gotenberg({ baseUrl: "http://pdf.test", fetchImpl }).docxToPdf(Buffer.from("x"));
    expect(form).toMatchObject({ reduceImageResolution: "true", maxImageResolution: "300", quality: "90", files: "document.docx" });
  });
  it("withPdfLog records kind, duration and outcome; a failed conversion still throws", async () => {
    const rows: any[] = [];
    const engine = withPdfLog({
      docxToPdf: async () => Buffer.from("ok"),
      htmlToPdf: async () => { throw new Error("engine down"); },
    }, (r) => rows.push(r));
    expect((await engine.docxToPdf(Buffer.from("x"))).toString()).toBe("ok");
    await expect(engine.htmlToPdf("<p>x</p>")).rejects.toThrow("engine down");
    expect(rows.map((r) => [r.kind, r.ok, r.error])).toEqual([["docx", true, undefined], ["html", false, "engine down"]]);
    expect(rows.every((r) => typeof r.ms === "number" && r.ms >= 0)).toBe(true);
  });
});

describe("legacy handler adapter", () => {
  it("passes status/headers/body through; legacy { error } becomes the v2 envelope", async () => {
    const app = Fastify();
    app.post("/ok", (req, reply) => runLegacy((_q, res) => { res.setHeader("X-T", "1"); res.status(201).send(Buffer.from("doc")); }, req, reply));
    app.post("/bad", (req, reply) => runLegacy((_q, res) => res.status(500).json({ error: "DOCX generation failed", detail: "x" }), req, reply));
    app.post("/throw", (req, reply) => runLegacy(async () => { throw new Error("kaputt"); }, req, reply));
    const ok = await app.inject({ method: "POST", url: "/ok" });
    expect([ok.statusCode, ok.headers["x-t"], ok.body]).toEqual([201, "1", "doc"]);
    const bad = await app.inject({ method: "POST", url: "/bad" });
    expect(bad.statusCode).toBe(500);
    expect(bad.json()).toMatchObject({ error: { code: "DOCUMENT_ERROR", message: "DOCX generation failed" }, detail: "x" });
    expect((await app.inject({ method: "POST", url: "/throw" })).statusCode).toBe(500);
  });

  it("streamed responses (pdfkit doc.pipe(res)) and res.end(buffer) are sent once, with headers", async () => {
    const { Readable } = await import("node:stream");
    const app = Fastify();
    app.post("/pipe", (req, reply) => runLegacy((_q, res) => { res.setHeader("Content-Type", "application/pdf"); Readable.from([Buffer.from("%PDF-"), Buffer.from("x")]).pipe(res); }, req, reply));
    app.post("/end", (req, reply) => runLegacy((_q, res) => { res.statusCode = 202; res.end(Buffer.from("done")); }, req, reply));
    const p = await app.inject({ method: "POST", url: "/pipe" });
    expect([p.statusCode, p.headers["content-type"], p.body]).toEqual([200, "application/pdf", "%PDF-x"]);
    const e = await app.inject({ method: "POST", url: "/end" });
    expect([e.statusCode, e.body]).toEqual([202, "done"]);
  });
});

describe("retired endpoints (ADR 020)", () => {
  it("answer 410 with the German hint", async () => {
    const { registerRetired, RETIRED_ROUTES, RETIRED_MESSAGE } = await import("../src/routes/retired.js");
    const app = Fastify();
    await registerRetired(app);
    for (const [method, url] of RETIRED_ROUTES) {
      const r = await app.inject({ method, url });
      expect([url, r.statusCode, r.json().error.message]).toEqual([url, 410, RETIRED_MESSAGE]);
    }
  });
});
