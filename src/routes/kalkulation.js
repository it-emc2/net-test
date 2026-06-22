/* eslint-disable no-unused-vars */
import express from "express";
import path from "path";
import dayjs from "dayjs";
import { randomBytes } from "crypto";
import mongoose from "mongoose";

import ProductModel from "../models/Product.js";
import pricingFactory from "../logic/pricing.js";

// Reuse the same helpers you already have
import { renderDocx, convertDocxToPdf, mapData } from "./docx-template.js";

export const router = express.Router();
const pricing = pricingFactory(ProductModel);

/* ===========================
   DEBUG helpers
   =========================== */

// enable with: ?debug=1 OR env DEBUG_KALK=1
function isDebug(req) {
  return (
    String(req?.query?.debug || "") === "1" ||
    String(process.env.DEBUG_KALK || "") === "1"
  );
}

function dlog(req, ...args) {
  if (isDebug(req)) console.log("[kalkulation][debug]", ...args);
}

/* ===========================
   DB-backed uniqueness for CALC IDs (minimal queries)
   =========================== */

const CalcIdSchema = new mongoose.Schema(
  { id: { type: String, required: true, unique: true, index: true } },
  { timestamps: true, collection: "calc_ids" },
);

// Avoid OverwriteModelError in dev/hot reload
const CalcId = mongoose.models.CalcId || mongoose.model("CalcId", CalcIdSchema);

function randomCalcId4() {
  const n = randomBytes(2).readUInt16BE(0) % 10_000;
  return `CALC-${String(n).padStart(4, "0")}`;
}

async function generateUniqueCalcId(maxAttempts = 12) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const id = randomCalcId4();
    try {
      await CalcId.create({ id }); // ✅ single DB op
      return id;
    } catch (e) {
      if (e?.code === 11000) continue; // duplicate => retry
      throw e;
    }
  }

  // Extremely unlikely fallback: widen space
  for (let attempt = 1; attempt <= 12; attempt++) {
    const n = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
    const id = `CALC-${String(n).padStart(6, "0")}`;
    try {
      await CalcId.create({ id });
      return id;
    } catch (e) {
      if (e?.code === 11000) continue;
      throw e;
    }
  }

  throw new Error("Could not generate unique CALC id after multiple attempts");
}

/* ===========================
   Helpers
   =========================== */

function round2(n) {
  const num = Number(n || 0);
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function fmtDateDE(input) {
  const d = input ? dayjs(input) : dayjs();
  return d.isValid() ? d.format("DD.MM.YYYY") : "";
}

function fmtCurrency(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(num);
}

function fmtNumberDE(n, decimals = 2) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(decimals).replace(".", ",");
}

function fmtPercentDE(p, decimals = 2) {
  const num = Number(p);
  if (!Number.isFinite(num)) return "";
  return `${fmtNumberDE(num, decimals)} %`;
}

function safeOfferNumber(body) {
  return (body?.offerNumber && String(body.offerNumber).trim()) || `ANG-${Date.now()}`;
}

function pickCustomerNumber(body) {
  const b = body?.Kundendaten || {};
  return String(b.customerNumber || b.kundennummer || "").trim();
}

function safeFileName(s, fallback = "Kalkulation") {
  const raw = String(s || "").trim() || fallback;
  return raw.replace(/[^a-zA-Z0-9_]/g, "_") || fallback;
}

function cleanLabel(s) {
  return String(s ?? "")
    .replace(/^\s*-\s*/g, "")
    .replace(/^\s*[•·]\s*/g, "")
    .trim();
}

function guessUnitForLine(line) {
  const label = String(line?.label || "").toLowerCase();
  const key = String(line?.key || "").toLowerCase();

  if (line?.unit) return String(line.unit);
  if (/kilometerpauschale/.test(label) || key === "km" || /\bkm\b/.test(label))
    return "km";
  if (/facharbeiter/.test(label) || key === "facharbeiter") return "Std";
  return "Stk";
}

function classifyCostType(line) {
  const label = String(line?.label || "").toLowerCase();
  const key = String(line?.key || "").toLowerCase();
  if (key === "facharbeiter" || /facharbeiter/.test(label)) return "Lohn";
  return "Material";
}

function secondsToHhMm(totalSeconds) {
  const s = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  return { hh, mm };
}

function hoursToHhMmLabel(hours) {
  const h = Number(hours || 0);
  const totalSeconds = Math.round(h * 3600);
  const { hh, mm } = secondsToHhMm(totalSeconds);
  return `${hh} Std ${mm.toString().padStart(2, "0")} Min`;
}

function hoursToColon(hours) {
  const h = Number(hours || 0);
  const totalSeconds = Math.round(h * 3600);
  const { hh, mm } = secondsToHhMm(totalSeconds);
  return `${hh}:${mm.toString().padStart(2, "0")} Std`;
}

/* ===========================
   Build PDF-like cost lines
   =========================== */

function buildCostLinesFromServices(svcLines = [], laborRateFallback = 0) {
  const out = [];

  for (const s of svcLines) {
    if (!s || s.docxHide) continue;

    const label = cleanLabel(s.label || s.name || "");
    if (!label) continue;

    const qty = Number(s.qty ?? 1);
    const unit = guessUnitForLine(s);

    const isFacharbeiter =
      String(s.key || "").toLowerCase() === "facharbeiter" ||
      /facharbeiter/i.test(label);

    const ekUnit = isFacharbeiter
      ? Number(laborRateFallback || 0)
      : Number(s.unitPrice ?? s.amount ?? 0);

    const total =
      Number.isFinite(Number(s.amount)) && s.amount !== undefined
        ? Number(s.amount)
        : round2((Number(qty) || 0) * (Number(ekUnit) || 0));

    out.push({
      Kostenart: classifyCostType(s),
      Menge: fmtNumberDE(qty, 2),
      Einheit: unit,
      Beschreibung: label,
      EK_je_Einheit: fmtCurrency(ekUnit),
      Gesamt: fmtCurrency(total),
      _totalNum: Number(total) || 0,
    });
  }

  return out;
}

function buildCostLinesFromMaterials(matLines = []) {
  const out = [];

  for (const m of matLines) {
    if (!m || m.docxHide) continue;

    const label = cleanLabel(m.label || m.name || m.productId || m.id || "");
    if (!label) continue;

    const qty = Number(m.qty ?? 0) || 0;
    if (qty <= 0) continue;

    const unit = m.unit ? String(m.unit) : "Stk";
    const ekUnit = Number(m.unitPrice ?? 0) || 0;
    const total = Number(m.lineTotal ?? 0) || round2(qty * ekUnit);

    out.push({
      Kostenart: "Material",
      Menge: fmtNumberDE(qty, 2),
      Einheit: unit,
      Beschreibung: label,
      EK_je_Einheit: fmtCurrency(ekUnit),
      Gesamt: fmtCurrency(total),
      _totalNum: Number(total) || 0,
      _id: String(m.productId || m.id || "").trim(),
    });
  }

  return out;
}

function buildSurchargeLines(costLines = [], markupPct = 0, excludeIds = new Set()) {
  const out = [];
  const pct = Number(markupPct || 0);

  for (const row of costLines) {
    if (String(row.Kostenart || "") !== "Material") continue;

    const id = row?._id ? String(row._id) : "";
    if (id && excludeIds.has(id)) {
      out.push({
        ZuschlagPct: fmtPercentDE(0, 2),
        ZuschlagText: row.Beschreibung,
        ZuschlagValue: fmtCurrency(0),
      });
      continue;
    }

    const ekTotal = Number(row._totalNum || 0);
    const z = round2(ekTotal * pct);
    const pctLine = ekTotal > 0 ? (z / ekTotal) * 100 : 0;

    out.push({
      ZuschlagPct: fmtPercentDE(pctLine, 2),
      ZuschlagText: row.Beschreibung,
      ZuschlagValue: fmtCurrency(z),
    });
  }

  return out;
}

function sumTotals(costLines = []) {
  return round2(costLines.reduce((a, r) => a + (Number(r._totalNum) || 0), 0));
}

/* ===========================
   Bonus picking (003/004)
   =========================== */

function pickBonusRows(angebotData) {
  const rows = Array.isArray(angebotData?.BonusRows) ? angebotData.BonusRows : [];

  const isBonus300 = (r) => {
    const lbl = String(r?.BonusLabel || "").toLowerCase();
    const det = String(r?.BonusDetail || "").toLowerCase();
    return (
      lbl.includes("bestandskundenbonus") ||
      lbl.includes("neukundenbonus") ||
      det.includes("rabatt von 300") ||
      det.includes("300")
    );
  };

  const isGrab = (r) => {
    const lbl = String(r?.BonusLabel || "").toLowerCase();
    const det = String(r?.BonusDetail || "").toLowerCase();
    return lbl.includes("haltegriff") || det.includes("haltegriff");
  };

  const bonus300Row = rows.find(isBonus300) || null;
  const bonusGrabRow = rows.find((r) => isGrab(r) && !isBonus300(r)) || null;

  return { bonus300Row, bonusGrabRow };
}

function buildBonusPos(posNo, row) {
  const label = String(row?.BonusLabel || "").trim() || "Bonus";
  const detail = String(row?.BonusDetail || "").trim();
  const amount = String(row?.gesamt || row?.preis || "0,00 €");

  return {
    PosNo: posNo,
    PosTitle: label,
    PosHoursLabel: "",
    PosHoursColon: "",
    PosQty: "1,00",
    PosUnit: "Stk",
    PosUnitPrice: amount,
    PosLineTotal: amount,
    CostLines: [
      {
        Kostenart: "Material",
        Menge: "1,00",
        Einheit: "Stk",
        Beschreibung: detail ? `${label} ${detail}`.trim() : label,
        EK_je_Einheit: amount,
        Gesamt: amount,
      },
    ],
    CostSum: amount,
    SurchargeLines: [
      {
        ZuschlagPct: fmtPercentDE(0, 2),
        ZuschlagText: label,
        ZuschlagValue: fmtCurrency(0),
      },
    ],
    UnitPriceLabel: amount,
  };
}

/* ===========================
   Mapping for Kalkulation.docx
   NOTE: returns FLAT placeholder keys (no dot nesting)
   =========================== */

async function mapKalkulationData(body = {}, computed = {}, debugMeta = null) {
  const b = body?.Kundendaten || {};
  const offerNumber = safeOfferNumber(body);

  const dokumentnummer = await generateUniqueCalcId();
  const angebotData = mapData(body, computed);

  const { bonus300Row, bonusGrabRow } = pickBonusRows(angebotData);
  const HasBonus300 = !!bonus300Row;
  const HasBonusGrab = !!bonusGrabRow;

  const svcLines =
    computed?.servicesDisplayDocx?.lines || computed?.services?.lines || [];
  const matLines =
    computed?.materialsDisplayDocx?.lines || computed?.materials?.lines || [];
  const laborRate = Number(computed?.services?.laborRate || 0);

  const markupPct = Number(computed?.markupPct || 0);
  const markup = Number(computed?.markup || 0);

  const materialEK = Number(computed?.productsSubtotal ?? 0);
  const materialZuschlag = Number.isFinite(markup) ? markup : 0;
  const materialVerkauf = round2(materialEK + materialZuschlag);

  const svcCostLines = buildCostLinesFromServices(svcLines, laborRate);
  const servicesLohnEK = round2(
    svcCostLines
      .filter((x) => x.Kostenart === "Lohn")
      .reduce((a, x) => a + (Number(x._totalNum) || 0), 0),
  );

  const lohnEK = servicesLohnEK;
  const lohnZuschlag = 0;
  const lohnVerkauf = round2(lohnEK + lohnZuschlag);

  const netEK = round2(materialEK + lohnEK);
  const netZuschlag = round2(materialZuschlag + lohnZuschlag);
  const netVerkauf = round2(netEK + netZuschlag);

  const vatOnNet = Number(computed?.vatOnNet ?? 0);
  const total = Number(computed?.total ?? 0);

  const laborHours = Number(computed?.services?.laborHours || 0);
  const totalHoursLabel = hoursToHhMmLabel(laborHours);

  const Greeting =
    b.salutation === "Frau"
      ? "Sehr geehrte Frau"
      : b.salutation === "Herr"
        ? "Sehr geehrter Herr"
        : b.salutation === "Familie"
          ? "Sehr geehrte Familie"
          : "Guten Tag";

  const SummaryRows = [
    {
      Kostenart: "Material",
      EK: fmtCurrency(materialEK),
      ZuschlagEuro: fmtCurrency(materialZuschlag),
      ZuschlagPct: fmtPercentDE(markupPct * 100, 2),
      Verkauf: fmtCurrency(materialVerkauf),
    },
    {
      Kostenart: "Lohn / Maschinenkosten",
      EK: fmtCurrency(lohnEK),
      ZuschlagEuro: fmtCurrency(lohnZuschlag),
      ZuschlagPct: fmtPercentDE(0, 2),
      Verkauf: fmtCurrency(lohnVerkauf),
    },
    {
      Kostenart: "Nettosumme",
      EK: fmtCurrency(netEK),
      ZuschlagEuro: fmtCurrency(netZuschlag),
      ZuschlagPct:
        netEK > 0
          ? fmtPercentDE((netZuschlag / netEK) * 100, 2)
          : fmtPercentDE(0, 2),
      Verkauf: fmtCurrency(netVerkauf),
      IsNet: true,
    },
  ];

  // -------- Pos 0.001 Services --------
  const servicesTitle = (
    computed?.services?.title ||
    angebotData?.ServicePosTitle ||
    "Auszuführende Arbeiten"
  )
    .toString()
    .trim();

  const serviceSum = Number(computed?.services?.sum ?? 0) || 0;

  const Pos001 = {
    PosNo: "0.001",
    PosTitle: servicesTitle,
    PosHoursLabel: laborHours > 0 ? hoursToHhMmLabel(laborHours) : "0 Std 00 Min",
    PosHoursColon: laborHours > 0 ? hoursToColon(laborHours) : "0:00 Std",
    PosQty: fmtNumberDE(1, 2),
    PosUnit: "Stk",
    PosUnitPrice: fmtCurrency(serviceSum),
    PosLineTotal: fmtCurrency(round2(serviceSum)),
    CostLines: svcCostLines.map((x) => ({
      Kostenart: x.Kostenart,
      Menge: x.Menge,
      Einheit: x.Einheit,
      Beschreibung: x.Beschreibung,
      EK_je_Einheit: x.EK_je_Einheit,
      Gesamt: x.Gesamt,
    })),
    CostSum: fmtCurrency(sumTotals(svcCostLines)),
    SurchargeLines: svcCostLines.map((x) => ({
      ZuschlagPct: fmtPercentDE(0, 2),
      ZuschlagText: x.Beschreibung,
      ZuschlagValue: fmtCurrency(0),
    })),
    UnitPriceLabel: fmtCurrency(serviceSum),
  };

  // -------- Pos 0.002 Materials --------
  const materialsTitle = (
    computed?.materials?.title ||
    angebotData?.MaterialsPosTitle ||
    "Material für Badumbau"
  )
    .toString()
    .trim();

  const costLinesRaw = buildCostLinesFromMaterials(matLines);
  const costSumNum = sumTotals(costLinesRaw);

  const excludeIds = new Set(["KM02"]);
  const surchargeLines = buildSurchargeLines(costLinesRaw, markupPct, excludeIds);

  const posUnitPrice =
    Number(computed?.material_plus_aufschlag ?? costSumNum) || costSumNum;

  const Pos002 = {
    PosNo: "0.002",
    PosTitle: materialsTitle,
    PosHoursLabel: "0 Std 00 Min",
    PosHoursColon: "0:00 Std",
    PosQty: fmtNumberDE(1, 2),
    PosUnit: "Stk",
    PosUnitPrice: fmtCurrency(posUnitPrice),
    PosLineTotal: fmtCurrency(round2(posUnitPrice)),
    CostLines: costLinesRaw.map((x) => ({
      Kostenart: x.Kostenart,
      Menge: x.Menge,
      Einheit: x.Einheit,
      Beschreibung: x.Beschreibung,
      EK_je_Einheit: x.EK_je_Einheit,
      Gesamt: x.Gesamt,
    })),
    CostSum: fmtCurrency(costSumNum),
    SurchargeLines: surchargeLines,
    UnitPriceLabel: fmtCurrency(posUnitPrice),
  };

  // -------- Bonus blocks 0.003 / 0.004 --------
  const Pos003 = bonus300Row ? buildBonusPos("0.003", bonus300Row) : null;
  const Pos004 = bonusGrabRow ? buildBonusPos("0.004", bonusGrabRow) : null;

  // ---------- FLAT keys for DOCX ----------
  const data = {
    // Header fields
    Anrede: b.salutation || "",
    Vorname: b.firstName || "",
    Nachname: b.lastName || "",
    Adresse: b.street || "",
    PLZ: b.postalCode || "",
    Stadt: b.city || "",

    Greeting,
    Kundennummer: pickCustomerNumber(body),
    Dokumentennummer: dokumentnummer,
    Datum: fmtDateDE(b.date),

    // Angebotsnummer placeholder
    Angebotsnummer: offerNumber,

    Projektnummer: offerNumber,
    TitleLine: `Kalkulation zu ${offerNumber}`,
    TotalHoursLabel: totalHoursLabel,

    SummaryRows,

    UstLabel: "Ust. 19 %",
    UstValue: fmtCurrency(vatOnNet),
    BruttoLabel: "Bruttosumme",
    BruttoValue: fmtCurrency(total),

    // --- Pos001 flat ---
    Pos001_No: Pos001.PosNo,
    Pos001_Title: Pos001.PosTitle,
    Pos001_HoursLabel: Pos001.PosHoursLabel,
    Pos001_HoursColon: Pos001.PosHoursColon,
    Pos001_Qty: Pos001.PosQty,
    Pos001_Unit: Pos001.PosUnit,
    Pos001_UnitPrice: Pos001.PosUnitPrice,
    Pos001_LineTotal: Pos001.PosLineTotal,
    Pos001_CostSum: Pos001.CostSum,
    Pos001_CostLines: Pos001.CostLines,
    Pos001_SurchargeLines: Pos001.SurchargeLines,

    // --- Pos002 flat ---
    Pos002_No: Pos002.PosNo,
    Pos002_Title: Pos002.PosTitle,
    Pos002_HoursLabel: Pos002.PosHoursLabel,
    Pos002_HoursColon: Pos002.PosHoursColon,
    Pos002_Qty: Pos002.PosQty,
    Pos002_Unit: Pos002.PosUnit,
    Pos002_UnitPrice: Pos002.PosUnitPrice,
    Pos002_LineTotal: Pos002.PosLineTotal,
    Pos002_CostSum: Pos002.CostSum,
    Pos002_CostLines: Pos002.CostLines,
    Pos002_SurchargeLines: Pos002.SurchargeLines,

    // Bonus flags
    HasBonus300,
    HasBonusGrab,

    // Optional: totals for direct use
    vatOnNet: fmtCurrency(vatOnNet),
    total: fmtCurrency(total),
  };

  if (HasBonus300 && Pos003) {
    data.Pos003_No = Pos003.PosNo;
    data.Pos003_Title = Pos003.PosTitle;
    data.Pos003_UnitPrice = Pos003.PosUnitPrice;
    data.Pos003_LineTotal = Pos003.PosLineTotal;
    data.Pos003_CostSum = Pos003.CostSum;
    data.Pos003_CostLines = Pos003.CostLines;
  }

  if (HasBonusGrab && Pos004) {
    data.Pos004_No = Pos004.PosNo;
    data.Pos004_Title = Pos004.PosTitle;
    data.Pos004_UnitPrice = Pos004.PosUnitPrice;
    data.Pos004_LineTotal = Pos004.PosLineTotal;
    data.Pos004_CostSum = Pos004.CostSum;
    data.Pos004_CostLines = Pos004.CostLines;
  }

  // Attach debug meta only if requested (won't break docx placeholders if you never reference it)
  if (debugMeta) data._debug = debugMeta;

  return data;
}

/* ===========================
   HTML PREVIEW endpoint (no DOCX involved)
   Use to verify values quickly
   =========================== */

router.post("/preview", async (req, res) => {
  try {
    const body = req.body || {};
    const computed = await pricing.computePrices(body);
    const data = await mapKalkulationData(
      body,
      computed,
      isDebug(req) ? { note: "preview debug" } : null,
    );

    const esc = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const renderTable = (rows = [], cols = []) => {
      const thead = cols.map((c) => `<th>${esc(c)}</th>`).join("");
      const tbody =
        rows.length === 0
          ? `<tr><td colspan="${cols.length}" style="color:#666">No rows</td></tr>`
          : rows
              .map((r) => `<tr>${cols.map((c) => `<td>${esc(r?.[c])}</td>`).join("")}</tr>`)
              .join("");
      return `
        <table>
          <thead><tr>${thead}</tr></thead>
          <tbody>${tbody}</tbody>
        </table>
      `;
    };

    const renderPosFlat = (prefix) => {
      const no = data[`${prefix}_No`];
      const title = data[`${prefix}_Title`];
      if (!no && !title) return `<div class="muted">${esc(prefix)}: (missing)</div>`;

      const costLines = data[`${prefix}_CostLines`] || [];
      const surchargeLines = data[`${prefix}_SurchargeLines`] || [];

      return `
        <section class="card">
          <h2>${esc(prefix)} — ${esc(no)} ${esc(title)}</h2>
          <div><b>Hours:</b> ${esc(data[`${prefix}_HoursLabel`])}
              <span class="muted">(${esc(data[`${prefix}_HoursColon`])})</span></div>
          <div><b>Calc:</b> ${esc(data[`${prefix}_Qty`])} ${esc(data[`${prefix}_Unit`])}
              × ${esc(data[`${prefix}_UnitPrice`])} = <b>${esc(data[`${prefix}_LineTotal`])}</b></div>

          <h3>CostLines (${costLines.length})</h3>
          ${renderTable(costLines, [
            "Kostenart",
            "Menge",
            "Einheit",
            "Beschreibung",
            "EK_je_Einheit",
            "Gesamt",
          ])}

          <h3>SurchargeLines (${surchargeLines.length})</h3>
          ${renderTable(surchargeLines, ["ZuschlagPct", "ZuschlagText", "ZuschlagValue"])}

          <div class="right"><b>CostSum:</b> ${esc(data[`${prefix}_CostSum`] || "")}</div>
        </section>
      `;
    };

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Kalkulation Preview</title>
<style>
  body{font-family:system-ui,Arial;margin:20px;background:#fff;color:#111}
  .header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
  .card{border:1px solid #ddd;border-radius:12px;padding:14px;margin:14px 0}
  h1{margin:0 0 6px}
  h2{margin:0 0 8px}
  h3{margin:12px 0 6px}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th,td{border:1px solid #eee;padding:6px;vertical-align:top}
  th{background:#fafafa}
  .muted{color:#666}
  .right{text-align:right;margin-top:8px}
  code{background:#f5f5f5;padding:2px 6px;border-radius:8px}
  pre{white-space:pre-wrap;background:#fafafa;border:1px solid #eee;padding:10px;border-radius:10px}
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${esc(data.TitleLine || "Kalkulation")}</h1>
      <div><b>Angebotsnummer:</b> ${esc(data.Angebotsnummer)}</div>
      <div><b>Dokumentennummer:</b> ${esc(data.Dokumentennummer)}</div>
      <div><b>Datum:</b> ${esc(data.Datum)}</div>
      <div><b>TotalHoursLabel:</b> ${esc(data.TotalHoursLabel)}</div>
    </div>
    <div class="card" style="min-width:320px">
      <h2>Totals</h2>
      <div><b>${esc(data.UstLabel)}:</b> ${esc(data.UstValue)}</div>
      <div><b>${esc(data.BruttoLabel)}:</b> ${esc(data.BruttoValue)}</div>
    </div>
  </div>

  <section class="card">
    <h2>SummaryRows (${(data.SummaryRows || []).length})</h2>
    ${renderTable(data.SummaryRows || [], [
      "Kostenart",
      "EK",
      "ZuschlagEuro",
      "ZuschlagPct",
      "Verkauf",
    ])}
  </section>

  ${renderPosFlat("Pos001")}
  ${renderPosFlat("Pos002")}

  <section class="card">
    <h2>Bonus</h2>
    <div><code>HasBonus300</code>: ${esc(data.HasBonus300)}</div>
    <div><code>HasBonusGrab</code>: ${esc(data.HasBonusGrab)}</div>

    ${
      data.HasBonus300
        ? `<div class="card"><h3>Pos003</h3>
            <div>${esc(data.Pos003_No)} ${esc(data.Pos003_Title)} — ${esc(data.Pos003_LineTotal)}</div>
            ${renderTable(data.Pos003_CostLines || [], ["Kostenart","Menge","Einheit","Beschreibung","EK_je_Einheit","Gesamt"])}
           </div>`
        : `<div class="muted">Pos003 hidden</div>`
    }

    ${
      data.HasBonusGrab
        ? `<div class="card"><h3>Pos004</h3>
            <div>${esc(data.Pos004_No)} ${esc(data.Pos004_Title)} — ${esc(data.Pos004_LineTotal)}</div>
            ${renderTable(data.Pos004_CostLines || [], ["Kostenart","Menge","Einheit","Beschreibung","EK_je_Einheit","Gesamt"])}
           </div>`
        : `<div class="muted">Pos004 hidden</div>`
    }
  </section>

  ${
    isDebug(req)
      ? `<section class="card"><h2>_debug</h2><pre>${esc(JSON.stringify(data._debug || {}, null, 2))}</pre></section>`
      : ""
  }
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    console.error("[kalkulation/preview] failed:", e);
    res.status(500).send(`<pre>${String(e?.stack || e)}</pre>`);
  }
});

/* ===========================
   DEBUG endpoint (JSON)
   =========================== */

router.post("/debug", async (req, res) => {
  try {
    const body = req.body || {};
    const computed = await pricing.computePrices(body);

    const angebotData = mapData(body, computed);
    const { bonus300Row, bonusGrabRow } = pickBonusRows(angebotData);

    const meta = {
      offerNumber: body?.offerNumber || null,
      activeOffer: body?.activeOffer || null,
      rabatt: body?.rabatt || null,
      computedFlags: computed?.flags || null,
      computedPick: {
        productsSubtotal: computed?.productsSubtotal,
        markupPct: computed?.markupPct,
        markup: computed?.markup,
        material_plus_aufschlag: computed?.material_plus_aufschlag,
        vatOnNet: computed?.vatOnNet,
        total: computed?.total,
      },
      servicesPick: {
        sum: computed?.services?.sum,
        laborRate: computed?.services?.laborRate,
        laborHours: computed?.services?.laborHours,
        distanceKm: computed?.services?.distanceKm,
      },
      materialsPick: {
        sum: computed?.materials?.sum,
      },
      bonusRows: angebotData?.BonusRows || [],
      bonus300Row,
      bonusGrabRow,
    };

    const data = await mapKalkulationData(body, computed, meta);

    dlog(req, "top-level keys:", Object.keys(data));
    dlog(req, "Angebotsnummer:", data.Angebotsnummer);
    dlog(req, "HasBonus300:", data.HasBonus300, "HasBonusGrab:", data.HasBonusGrab);
    dlog(req, "Pos001_CostLines:", data?.Pos001_CostLines?.length);
    dlog(req, "Pos002_CostLines:", data?.Pos002_CostLines?.length);

    res.json({ ok: true, data });
  } catch (e) {
    console.error("[kalkulation/debug] failed:", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/* ===========================
   Routes
   =========================== */

// Generate DOCX Kalkulation
router.post("/docx", async (req, res) => {
  try {
    const body = req.body || {};
    const computed = await pricing.computePrices(body);

    const templatePath = path.join(process.cwd(), "src", "templates", "Kalkulation.docx");

    const data = await mapKalkulationData(
      body,
      computed,
      isDebug(req) ? { note: "docx debug" } : null,
    );

    dlog(req, "Angebotsnummer:", data.Angebotsnummer);
    dlog(req, "Pos001_No:", data.Pos001_No, "Pos001_CostLines:", data?.Pos001_CostLines?.length);
    dlog(req, "Pos002_No:", data.Pos002_No, "Pos002_CostLines:", data?.Pos002_CostLines?.length);

    const out = await renderDocx(templatePath, data);

    const fname = `${safeFileName(
      `Kalkulation_${data.Projektnummer}_${data.Dokumentennummer}`,
      "Kalkulation",
    )}.docx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(out);
  } catch (e) {
    console.error("[kalkulation/docx] generation failed:", e);
    res.status(500).json({
      error: "Kalkulation DOCX generation failed",
      detail: e?.message || String(e),
    });
  }
});

// Generate PDF Kalkulation (DOCX -> LibreOffice)
router.post("/pdf", async (req, res) => {
  try {
    const body = req.body || {};
    const computed = await pricing.computePrices(body);

    const templatePath = path.join(process.cwd(), "src", "templates", "Kalkulation.docx");

    const data = await mapKalkulationData(
      body,
      computed,
      isDebug(req) ? { note: "pdf debug" } : null,
    );

    dlog(req, "Angebotsnummer:", data.Angebotsnummer);

    const docxBuffer = await renderDocx(templatePath, data);
    const pdfBuffer = await convertDocxToPdf(docxBuffer);

    const fname = `${safeFileName(
      `Kalkulation_${data.Projektnummer}_${data.Dokumentennummer}`,
      "Kalkulation",
    )}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
    res.send(pdfBuffer);
  } catch (e) {
    console.error("[kalkulation/pdf] generation failed:", e);
    res.status(500).json({
      error: "Kalkulation PDF generation failed",
      detail: e?.message || String(e),
    });
  }
});

export default router;