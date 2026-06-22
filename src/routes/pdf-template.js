/* eslint-disable no-undef */
// src/routes/pdf-template.js
import express from "express";
import fs from "fs/promises";
import path from "path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import dayjs from "dayjs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
  //import * as pdfjsLib from "/pdfjs/pdf.min.mjs";
const { getDocument } = pdfjs;

export const router = express.Router();

function log(...args) {
  console.log("[pdf-template]", ...args);
}
function warn(...args) {
  console.warn("[pdf-template][WARN]", ...args);
}
function errlog(...args) {
  console.error("[pdf-template][ERROR]", ...args);
}

function mapData(body = {}) {
  const b = body.bereich || {};
  const sum = body.summe || {};
  const prix = body.preise || {};
  const tb = body.textbausteine || {};
  const bwt = body.bwt || {};
  return {
    Anrede: b.salutation || "",
    Vorname: b.firstName || "",
    Nachname: b.lastName || "",
    Adresse: b.street || "",
    Stadt: b.city || "",
    PLZ: b.postalCode || "",
    Datum: b.date || dayjs().format("YYYY-MM-DD"),
    Ansprechpartner: body.ansprechpartner || b.hasContactPerson || "",
    Kundennummer: b.customerNumber || "",
    Greeting:
      b.salutation === "Frau"
        ? "Sehr geehrte Frau"
        : b.salutation === "Herr"
          ? "Sehr geehrter Herr"
          : "Guten Tag",

    Angebotsnummer: body.offerNumber || "ANG-0001",
    Arbeit: prix.arbeit ?? "",
    Material: prix.material ?? "",
    Long1: tb.long1 ?? "",
    Long3: tb.long3 ?? "",
    Long: tb.long ?? "",
    Pos003: body.pos003 ?? "",
    Bonus1Stk: body.bonus1Stk ?? "",
    Bonus1: body.bonus1 ?? "",
    Bonus1Price: body.bonus1Price ?? "",
    Pos004: body.pos004 ?? "",
    Bonus2Stk: body.bonus2Stk ?? "",
    Bonus2: body.bonus2 ?? "",
    Bonus2Price: body.bonus2Price ?? "",
    Nettobetrag: sum.netto ?? "",
    Rabatt: sum.rabatt ?? "",
    MwSt: sum.mwst ?? "",
    Gesamtsumme: sum.gesamt ?? "",
    Selbstkostenanteil: sum.selbstkostenanteil ?? "",
    Zuschusskrankenkasse: sum.zuschuss ?? "",
    Gesamtsummerabatt: sum.gesamtsummerabatt ?? "",
  };
}

function toUint8Array(input) {
  if (input instanceof Uint8Array && !(input instanceof Buffer)) return input;
  if (input instanceof Buffer) {
    return new Uint8Array(
      input.buffer,
      input.byteOffset,
      input.byteLength,
    ).slice();
  }
  if (input?.buffer instanceof ArrayBuffer) {
    return new Uint8Array(
      input.buffer,
      input.byteOffset || 0,
      input.byteLength || input.length || 0,
    ).slice();
  }
  return new Uint8Array(input);
}

// Join consecutive pdfjs text items into a single string with mapping back to item indices.
// This helps detect tokens that are split across runs.
function joinItems(items) {
  let text = "";
  const map = []; // map char index -> { itemIndex, localIndex }
  items.forEach((it, idx) => {
    const str = it.str || "";
    for (let i = 0; i < str.length; i++) {
      map.push({ itemIndex: idx, localIndex: i });
    }
    text += str;
  });
  return { text, map };
}

// Compute approximate baseline Y, font size, and starting X for a token spanning multiple items.
// We use the first contributing item for baseline/size and the X of that item.
function measureToken(items, startIdx, endIdx) {
  const firstItem = items[startIdx];
  const lastItem = items[endIdx];
  const a = firstItem?.transform?.[0] || 0;
  const b = firstItem?.transform?.[1] || 0;
  const fontSize = Math.max(9, Math.min(12, Math.hypot(a, b) || 11));
  const x = firstItem?.transform?.[4] ?? 0;
  const y = firstItem?.transform?.[5] ?? 0;
  // Estimate token width by summing widths of contributing items; fallback to run width
  let width = 0;
  for (let i = startIdx; i <= endIdx; i++) {
    const it = items[i];
    // Approx width from transform matrix [a c e; b d f; ...] — use scale (a) times string length heuristic
    const w =
      Math.abs(it?.width || 0) ||
      Math.abs(a) * (String(it?.str || "").length * 0.6);
    width += Number.isFinite(w) ? w : 0;
  }
  return { x, y, fontSize, width };
}

// Find placeholders robustly: detects tokens even if split across multiple items.
async function findPlaceholdersCoords(pdfBytesU8, placeholders) {
  const u8 = toUint8Array(pdfBytesU8);
  log(
    "Starting placeholder scan. Bytes:",
    u8?.byteLength || "n/a",
    "Placeholders:",
    placeholders.length,
  );
  const t0 = Date.now();

  let pdf;
  try {
    const loadingTask = getDocument({ data: u8 });
    pdf = await loadingTask.promise;
  } catch (e) {
    errlog("pdfjs getDocument failed:", e);
    throw new Error("pdfjs getDocument failed: " + (e?.message || e));
  }

  log(
    "PDF loaded with pdfjs. Pages:",
    pdf.numPages,
    "Init took",
    Date.now() - t0,
    "ms",
  );

  const result = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tPage = Date.now();
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();

    const items = textContent.items.map((it) => ({
      str: it.str || "",
      transform: it.transform,
      width: it.width,
    }));

    log(`Page ${p}: items=${items.length}`);
    if (items.length) {
      const sample = items.slice(0, Math.min(5, items.length)).map((i) => ({
        str: i.str,
        x: i.transform?.[4],
        y: i.transform?.[5],
      }));
      log(`Page ${p} sample:`, sample);
    }

    const { text, map } = joinItems(items);

    // Build index for fast search
    const matches = [];
    for (const key of placeholders) {
      const token = `[${key}]`;
      let index = text.indexOf(token);
      while (index !== -1) {
        const startChar = index;
        const endChar = index + token.length - 1;
        const startItemIndex = map[startChar]?.itemIndex ?? 0;
        const endItemIndex = map[endChar]?.itemIndex ?? startItemIndex;

        const m = measureToken(items, startItemIndex, endItemIndex);
        matches.push({
          key,
          token,
          x: m.x,
          y: m.y,
          fontSize: m.fontSize,
          estWidth: m.width,
        });

        index = text.indexOf(token, index + token.length);
      }
    }

    // Deduplicate by key + rounded position to avoid double writes on identical runs
    const seen = new Set();
    const deduped = [];
    for (const m of matches) {
      const k = `${m.key}@${Math.round(m.x)}:${Math.round(m.y)}`;
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(m);
      }
    }

    log(
      `Page ${p}: matches=${deduped.length}, scan took ${Date.now() - tPage}ms`,
    );
    result.push({ pageIndex: p - 1, matches: deduped });
    page.cleanup();
  }

  log("Placeholder scan done in", Date.now() - t0, "ms");
  return result;
}

router.post("/", async (req, res) => {
  if (!process.env.PDFJS_DISABLE_WORKER)
    process.env.PDFJS_DISABLE_WORKER = "true";

  try {
    const templatePath = getAngebotTemplatePath(req.body);
      console.log('[pdf-template] Using template path:', templatePath);
        console.log('[pdf-template] Template exists?', fsSync.existsSync(templatePath));
    log("Reading template from", templatePath);

    let templateBytes;
    try {
      templateBytes = await fs.readFile(templatePath); // Buffer for pdf-lib
    } catch (e) {
      errlog("Failed to read template:", e);
      return res
        .status(500)
        .json({ error: "Template not found", detail: String(e) });
    }
    if (!templateBytes || templateBytes.length < 1000) {
      warn("Template bytes look suspicious:", templateBytes?.length);
    }

    const templateU8 = toUint8Array(templateBytes); // for pdfjs
    const data = mapData(req.body || {});
    const keys = Object.keys(data);
    log("Mapped data keys:", keys.length);

    // 1) Detect positions
    let coords;
    try {
      coords = await findPlaceholdersCoords(templateU8, keys);
    } catch (e) {
      errlog("Placeholder scan failed:", e);
      return res
        .status(500)
        .json({ error: "Placeholder scan failed", detail: String(e) });
    }

    const totalMatches = coords.reduce((acc, c) => acc + c.matches.length, 0);
    log("Total placeholder matches found:", totalMatches);
    if (totalMatches === 0)
      warn(
        "No placeholders matched. Are tokens like [Anrede] present in the PDF text layer?",
      );

    // 2) Draw overlays with pdf-lib (use original Buffer)
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(templateBytes);
    } catch (e) {
      errlog("pdf-lib load failed:", e);
      return res
        .status(500)
        .json({ error: "PDF load failed", detail: String(e) });
    }

    let font;
    try {
      font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    } catch (e) {
      errlog("Font embed failed:", e);
      return res
        .status(500)
        .json({ error: "Font embed failed", detail: String(e) });
    }

    const white = rgb(1, 1, 1);
    const black = rgb(0, 0, 0);

    // Optional per-page Y fine-tune (if baseline appears a bit high/low)
    const yAdjustByPage = {
      // 0: 0, // pageIndex: adjustment
    };

    try {
      coords.forEach(({ pageIndex, matches }) => {
        const page = pdfDoc.getPage(pageIndex);
        const yAdj = yAdjustByPage[pageIndex] ?? 0;

        matches.forEach((m) => {
          const value = data[m.key] ?? "";
          const size = Math.max(9, Math.min(12, m.fontSize || 11));
          const baselineY = m.y + yAdj;

          // Height for white-out box
          const h = size * 1.15;

          // Place text so baseline matches roughly the original
          const y = baselineY - h * 0.8; // tweak as needed

          // Compute width using token estimate vs new value’s width
          const valueWidth = font.widthOfTextAtSize(String(value), size);
          const w = Math.max(m.estWidth || 0, valueWidth) + 2;

          // White-out and draw
          page.drawRectangle({ x: m.x, y, width: w, height: h, color: white });
          page.drawText(String(value), {
            x: m.x,
            y: y + (h - size) / 2,
            size,
            font,
            color: black,
          });
        });
      });
    } catch (e) {
      errlog("Drawing overlays failed:", e);
      return res
        .status(500)
        .json({ error: "Drawing overlays failed", detail: String(e) });
    }

    let out;
    try {
      out = await pdfDoc.save();
    } catch (e) {
      errlog("PDF save failed:", e);
      return res
        .status(500)
        .json({ error: "PDF save failed", detail: String(e) });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Angebot_aus_Vorlage.pdf"',
    );
    res.send(Buffer.from(out));
  } catch (err) {
    errlog("Unhandled error:", err);
    errlog(err?.stack || "");
    res
      .status(500)
      .json({ error: "PDF generation failed", detail: String(err) });
  }
});

export default router;
