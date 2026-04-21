// src/routes/hl-parse.js
// Parse a Flexofit Angebot PDF into structured HL Freier-Posten rows.
// Returns groups (Handlauf Hausecke / Haustür / …) with parsed positions
// and resolves each productId against the Product collection (FF_<raw>).

import express from "express";
import multer from "multer";
import os from "os";
import fs from "fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import Product from "../models/Product.js";

const { getDocument } = pdfjs;

export const router = express.Router();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function toUint8Array(buf) {
  if (buf instanceof Uint8Array && !(buf instanceof Buffer)) return buf;
  if (buf instanceof Buffer) {
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
  }
  return new Uint8Array(buf);
}

/**
 * Reconstruct text per page as an array of lines, grouping pdfjs text items
 * by their Y baseline and sorting left-to-right by X.
 */
async function extractLinesFromPdf(pdfBytes) {
  const u8 = toUint8Array(pdfBytes);
  const pdf = await getDocument({ data: u8 }).promise;
  const pagesLines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items || [];

    // Group items by approximate Y (baseline)
    const byRow = new Map();
    for (const it of items) {
      const y = Math.round((it.transform?.[5] ?? 0) * 10) / 10;
      const x = it.transform?.[4] ?? 0;
      if (!byRow.has(y)) byRow.set(y, []);
      byRow.get(y).push({ x, str: it.str || "" });
    }

    // Sort rows top-to-bottom (PDF Y grows upward → descending)
    const ys = [...byRow.keys()].sort((a, b) => b - a);
    const lines = ys.map((y) => {
      const row = byRow.get(y).sort((a, b) => a.x - b.x);
      // Join with a space; collapse multi-spaces
      const text = row
        .map((r) => r.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      return { y, x: row[0]?.x ?? 0, text, parts: row };
    });

    pagesLines.push(lines);
  }

  return pagesLines;
}

const SECTION_RE = /^Handlauf\s+.+?(?:Innen|Außen|Aussen)bereich\s*$/i;
const STOP_RE = /^(Zwischensumme|Übertrag|Gesamt\s+Netto|Gesamtbetrag|zzgl\.)\b/i;
const HEADER_NOISE_RE =
  /^(Pos|Menge|Nummer|Text|Einzelpreis|Gesamtpreis|EUR|Seite:|Kunden\s+Nr\.|Bearbeiter:|USt-IdNr\.|Lieferdatum:|Datum:|Angebot\s+Nr\.)/i;

// Row: "1  1,55  lfm.  69  flexofit, Edelstahl-Rohr  39,00  60,45"
// or:  "2  1,00  Stück  SL01  Zuschnitt  8,00  8,00"
// We anchor on <pos> at start and two trailing money columns at end.
const ROW_RE =
  /^(\d{1,3})\s+(\d+(?:[.,]\d+)?)\s+(lfm\.?|Stück|Stuck|Stk\.?)\s+(\S+)\s+(.+?)\s+(\d+(?:[.,]\d{1,2}))\s+(\d+(?:[.,]\d{1,2}))\s*$/i;

function parseMoney(s) {
  return Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
}

function parseQty(s) {
  return Number(String(s).replace(",", ".")) || 0;
}

function normalizeUnit(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.startsWith("lfm")) return "m";
  if (s.startsWith("stü") || s.startsWith("stu") || s.startsWith("stk")) return "Stück";
  return raw;
}

/**
 * Walk the flat list of lines, emit {sections:[{group, rows:[...]}]}.
 * Continuation lines (no leading pos number, not a section/stop/noise)
 * are appended to the previous row's `name`.
 */
function groupLines(allLines) {
  const sections = [];
  let current = { group: "Ohne Zuordnung", rows: [] };
  let lastRow = null;
  let started = false;

  const pushCurrent = () => {
    if (current.rows.length) sections.push(current);
  };

  for (const line of allLines) {
    const text = line.text;
    if (!text) continue;
    if (HEADER_NOISE_RE.test(text)) continue;

    if (SECTION_RE.test(text)) {
      pushCurrent();
      current = { group: text.trim(), rows: [] };
      lastRow = null;
      started = true;
      continue;
    }

    if (STOP_RE.test(text)) {
      // Keep parsing further pages: some Flexofit PDFs have "Übertrag"
      // followed by more rows. Just reset lastRow so new rows start cleanly.
      lastRow = null;
      continue;
    }

    const m = text.match(ROW_RE);
    if (m) {
      started = true;
      const [, pos, qty, unit, productId, name, unitPrice, lineTotal] = m;
      const row = {
        pos: Number(pos),
        qty: parseQty(qty),
        unit: normalizeUnit(unit),
        productId: productId.trim(),
        name: name.trim(),
        unitPrice: parseMoney(unitPrice),
        lineTotal: parseMoney(lineTotal),
      };
      current.rows.push(row);
      lastRow = row;
      continue;
    }

    // Continuation line: append to the previous row's name
    if (started && lastRow && /^[^\d]/.test(text) && text.length < 120) {
      lastRow.name = `${lastRow.name} ${text}`.replace(/\s+/g, " ").trim();
    }
  }

  pushCurrent();

  // Drop empty sections; if nothing matched, still return at least an empty default
  return sections.filter((s) => s.rows.length);
}

async function resolveProductIds(sections) {
  const rawIds = new Set();
  for (const sec of sections) {
    for (const r of sec.rows) {
      if (r.productId) rawIds.add(r.productId);
    }
  }

  // Try `FF_<raw>` first, then raw. Build a map raw -> resolved.
  const candidates = [...rawIds].flatMap((raw) => [`FF_${raw}`, raw]);
  const docs = await Product.find({ productId: { $in: candidates } })
    .select("productId name price source")
    .lean();

  const byId = new Map(docs.map((d) => [d.productId, d]));

  const resolve = (raw) => {
    if (!raw) return { productId: "", dbProductId: null, matched: false };
    const ff = `FF_${raw}`;
    if (byId.has(ff)) {
      const d = byId.get(ff);
      return {
        productId: ff,
        dbProductId: ff,
        dbName: d.name || "",
        dbPrice: Number(d.price) || 0,
        matched: true,
      };
    }
    if (byId.has(raw)) {
      const d = byId.get(raw);
      return {
        productId: raw,
        dbProductId: raw,
        dbName: d.name || "",
        dbPrice: Number(d.price) || 0,
        matched: true,
      };
    }
    return { productId: raw, dbProductId: null, matched: false };
  };

  const out = sections.map((sec) => ({
    group: sec.group,
    rows: sec.rows.map((r) => {
      const res = resolve(r.productId);
      return {
        ...r,
        productId: res.productId,
        dbMatched: res.matched,
        dbName: res.dbName || null,
        dbPrice: Number.isFinite(res.dbPrice) ? res.dbPrice : null,
      };
    }),
  }));

  return out;
}

router.post("/parse-flexofit-offer", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "Keine Datei hochgeladen." });

  try {
    const buf = await fs.readFile(file.path);
    const mime = (file.mimetype || "").toLowerCase();
    const ext = (file.originalname || "").toLowerCase().split(".").pop();

    if (mime !== "application/pdf" && ext !== "pdf") {
      return res.status(400).json({ error: "Nur PDF-Dateien werden unterstützt." });
    }

    const pages = await extractLinesFromPdf(buf);
    const flat = pages.flat();
    const parsedSections = groupLines(flat);
    const sections = await resolveProductIds(parsedSections);

    const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);
    const unmatched = sections.reduce(
      (n, s) => n + s.rows.filter((r) => !r.dbMatched).length,
      0,
    );

    res.json({
      ok: true,
      sections,
      summary: {
        sections: sections.length,
        rows: totalRows,
        unmatched,
      },
    });
  } catch (err) {
    console.error("[hl-parse] failed:", err);
    res.status(500).json({ error: "Parser-Fehler: " + (err?.message || err) });
  } finally {
    fs.unlink(file.path).catch(() => {});
  }
});

export default router;
