import express from "express";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import https from "node:https";
import { addTimelineComment } from "./bitrix.js";

const router = express.Router();

// onlinebrief24.de / letterei.de API v1 (Stand 30.07.2026, docs1/refs/onlinebrief24-api.pdf.pdf).
// One request does everything: POST /v1/printjobs with the letter as base64.
// There is NO recipient-address field and no cover text — the address must sit
// in the PDF's DIN-5008 address window. Our Angebot template already has it
// (src/templates/Angebot.docx), so the offer PDF IS the letter and everything
// else rides along in base64_attachments.
const DEFAULT_BASE_URL = "https://api.onlinebrief24.de/v1";
const DEFAULT_SPECIFICATION = {
  color: "4", // 1 = s/w, 4 = Farbe
  mode: "duplex", // simplex, duplex
  shipping: "national", // national, international, auto
};
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB je PDF laut Doku

// Postversand only. The Flyer "Barrierefreies Wohnen" is deliberately NOT here:
// it goes out by e-mail only (and it is a landscape document, which onlinebrief24
// rejects anyway). The frontend list in script.js must stay in sync.
const STATIC_POSTAL_ATTACHMENTS = {
  abtretung: {
    id: "abtretung",
    filename: "Abtretungserklärung.pdf",
    absPath: path.join(process.cwd(), "src", "public", "assets", "Email", "Abtretungserklärung.pdf"),
  },
  vollmacht: {
    id: "vollmacht",
    filename: "Vollmacht.pdf",
    absPath: path.join(process.cwd(), "src", "public", "assets", "Email", "Vollmacht.pdf"),
  },
  // Future-ready: add more predefined postal attachments here if needed.
};

function maskBase64(value) {
  const s = String(value || "");
  if (!s) return "(empty)";
  return `${s.slice(0, 24)}... [len=${s.length}]`;
}

function summarizeForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => summarizeForLog(item));
  }

  if (!value || typeof value !== "object") return value;

  const clone = { ...value };

  if (clone.base64) clone.base64 = maskBase64(clone.base64);
  if (clone.base64_file) clone.base64_file = maskBase64(clone.base64_file);
  if (Array.isArray(clone.base64_attachments)) {
    clone.base64_attachments = clone.base64_attachments.map((item) => maskBase64(item));
  }
  if (clone.auth && typeof clone.auth === "object") {
    clone.auth = { ...clone.auth, apiKey: "***", apiSecret: "***" };
  }
  if (clone.letter && typeof clone.letter === "object") {
    clone.letter = summarizeForLog(clone.letter);
  }
  if (clone.document && typeof clone.document === "object") {
    clone.document = {
      ...clone.document,
      base64: maskBase64(clone.document.base64 || clone.document.content),
      content: undefined,
    };
  }
  if (clone.attachments && Array.isArray(clone.attachments)) {
    clone.attachments = clone.attachments.map((att) => ({
      ...att,
      base64: att?.base64 ? maskBase64(att.base64) : undefined,
      content: att?.content ? maskBase64(att.content) : undefined,
    }));
  }
  return clone;
}

function logPost(label, data) {
  if (data === undefined) {
    console.log(`[post] ${label}`);
    return;
  }
  console.log(`[post] ${label}`, summarizeForLog(data));
}

function withStage(error, stage, extra = {}) {
  if (!error) error = new Error("Unknown postal error");
  error.stage = stage;
  error.debug = { ...(error.debug || {}), ...extra };
  return error;
}

function getConfig() {
  const baseUrl = String(process.env.OB24_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const apiKey = process.env.OB24_API_KEY || "";
  const apiSecret = process.env.OB24_API_SECRET || "";
  // "test" parkt den Auftrag im Warenkorb (7 Tage), "live" versendet sofort.
  const mode = String(process.env.OB24_MODE || "test").trim().toLowerCase() === "live" ? "live" : "test";

  if (!apiKey || !apiSecret) {
    throw new Error("onlinebrief24 credentials missing. Set OB24_API_KEY and OB24_API_SECRET in .env.");
  }

  return { baseUrl, apiKey, apiSecret, mode };
}

function md5(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

// onlinebrief24 only accepts A4 portrait and rejects everything else with
// "Das PDF ist verschlüsselt oder liegt nicht im richtigen Format vor". Our
// Angebot templates are still US Letter (612x792) and uploads can be anything,
// so every PDF is fitted onto A4 here — scaled to fit, centred horizontally and
// anchored at the top so the address block stays where the envelope window
// expects it. Pages that already are A4 portrait are left untouched.
const A4 = { width: 595.28, height: 841.89 };
const A4_TOLERANCE = 3; // pt — LibreOffice/Word round A4 slightly differently

function isA4Portrait(page) {
  const { width, height } = page.getSize();
  return (
    Math.abs(width - A4.width) <= A4_TOLERANCE &&
    Math.abs(height - A4.height) <= A4_TOLERANCE &&
    page.getRotation().angle % 360 === 0
  );
}

async function normalizeToA4(base64, label) {
  let source;
  try {
    source = await PDFDocument.load(Buffer.from(base64, "base64"));
  } catch {
    throw new Error(`${label} konnte nicht gelesen werden (beschädigt oder passwortgeschützt).`);
  }

  const pages = source.getPages();
  if (pages.every(isA4Portrait)) return base64;

  // ponytail: rotated source pages are scaled by their unrotated box; no rotated
  // input has shown up yet — revisit if onlinebrief24 rejects one.
  const target = await PDFDocument.create();
  const embedded = await target.embedPages(pages);

  embedded.forEach((embeddedPage, index) => {
    const { width, height } = pages[index].getSize();
    const scale = Math.min(A4.width / width, A4.height / height);
    const page = target.addPage([A4.width, A4.height]);
    page.drawPage(embeddedPage, {
      xScale: scale,
      yScale: scale,
      x: (A4.width - width * scale) / 2,
      y: A4.height - height * scale,
    });
  });

  logPost("normalized to A4", { label, pages: pages.length, from: pages[0].getSize() });
  return Buffer.from(await target.save()).toString("base64");
}

function assertPdfSize(base64, label) {
  const bytes = Math.floor((String(base64 || "").length * 3) / 4);
  if (bytes > MAX_PDF_BYTES) {
    throw new Error(`${label} ist größer als 50 MB (${(bytes / 1024 / 1024).toFixed(1)} MB).`);
  }
  return bytes;
}

// onlinebrief24 wants the auth object in the JSON body of a GET too, which
// fetch() rejects ("Request with GET/HEAD method cannot have body") — so GETs
// go out through node:https instead. POSTs keep using fetch.
function httpsJson(url, method, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () =>
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: { get: (name) => res.headers[String(name).toLowerCase()] || "" },
            json: async () => JSON.parse(raw || "null"),
            text: async () => raw,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

// The auth object travels in the JSON body of EVERY request — including GETs.
async function ob24Fetch(apiPath, { method = "POST", body } = {}) {
  const { baseUrl, apiKey, apiSecret, mode } = getConfig();
  const url = `${baseUrl}${apiPath}`;
  const payloadBody = { auth: { apiKey, apiSecret, mode }, ...(body || {}) };

  logPost(`OB24 request -> ${method} ${apiPath}`, payloadBody);

  const startedAt = Date.now();
  const res =
    method === "GET"
      ? await httpsJson(url, method, payloadBody)
      : await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payloadBody),
        });

  const durationMs = Date.now() - startedAt;
  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  logPost(`OB24 response <- ${method} ${apiPath}`, { status: res.status, ok: res.ok, durationMs, payload });

  if (!res.ok || (payload && typeof payload === "object" && payload.status && Number(payload.status) >= 400)) {
    const message =
      (typeof payload === "string" ? payload : payload?.message || payload?.error) ||
      `onlinebrief24 error ${res.status}`;

    const err = new Error(message);
    err.status = res.status >= 400 ? res.status : Number(payload?.status) || 500;
    err.payload = payload;
    err.apiPath = apiPath;
    err.method = method;
    throw err;
  }

  return payload;
}

function buildBitrixPostalComment({ recipient, offerNumber, printjobId, printjob, mode, attachmentNames }) {
  const item = Array.isArray(printjob?.items) ? printjob.items[0] : null;
  const statusText = printjob?.status || item?.status || "-";
  const pages = item?.pages ? `${item.pages} Seiten` : "-";

  const lines = [
    "📬 Angebot per Post versendet",
    "",
    `👤 Kunde: ${String(recipient?.name || "-").trim() || "-"}`,
    `📄 Angebot: ${String(offerNumber || "-").trim() || "-"}`,
    `🆔 onlinebrief24: ${String(printjobId || "-").trim() || "-"}${mode === "test" ? " (Testmodus – liegt im Warenkorb)" : ""}`,
    `📦 Status: ${statusText} · ${pages}`,
    `📎 Anhänge: ${(attachmentNames || []).join(", ") || "-"}`,
    `🕒 ${new Date().toLocaleString("de-DE")}`,
  ];

  return lines.join("\n");
}

// OB24 needs no address fields (the PDF carries them) — this stays as a sanity
// check so we never post a letter for a customer without a usable address.
function normalizeRecipientAddress(recipient = {}) {
  const name = String(recipient.name || "").trim();
  const street = String(recipient.street || "").trim();
  const zipCode = String(recipient.zipCode || recipient.zip || recipient.postalCode || "").trim();
  const city = String(recipient.city || "").trim();

  if (!name || !street || !zipCode || !city) {
    throw new Error("Recipient address is incomplete. Name, street, zip code and city are required.");
  }

  return { name, street, zipCode, city };
}

async function loadStaticAttachmentById(id) {
  const config = STATIC_POSTAL_ATTACHMENTS[String(id || "").trim()];
  if (!config) {
    throw new Error(`Unknown static postal attachment id: ${id}`);
  }
  if (!fsSync.existsSync(config.absPath)) {
    throw new Error(`Static postal attachment not found: ${config.filename}`);
  }

  const buffer = await fs.readFile(config.absPath);
  return {
    id: config.id,
    filename: config.filename,
    base64: buffer.toString("base64"),
  };
}

async function normalizeRequestedAttachments(rawAttachments) {
  const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];
  const out = [];

  for (const item of attachments) {
    const type = String(item?.type || "").trim();

    if (type === "static") {
      const loaded = await loadStaticAttachmentById(item?.id);
      out.push({
        type: "static",
        id: loaded.id,
        filename: loaded.filename,
        base64: loaded.base64,
      });
      continue;
    }

    if (type === "upload") {
      const filename = String(item?.filename || "").trim();
      const base64 = String(item?.base64 || item?.content || "").trim();

      if (!filename || !base64) continue;
      if (!/\.pdf$/i.test(filename)) {
        throw new Error(`Only PDF upload attachments are allowed: ${filename}`);
      }

      out.push({
        type: "upload",
        filename,
        base64,
      });
    }
  }

  return out;
}

router.post("/send", async (req, res) => {
  try {
    logPost("incoming /api/post/send payload", req.body);

    const {
      recipient,
      auftragId,
      document,
      specification,
      dispatchDate,
      registered,
      attachments,
      meta,
      dealId,
      bitrixEntityType,
    } = req.body || {};

    const mainFilename = String(document?.filename || "").trim() || "Angebot.pdf";
    const mainBase64 = String(document?.base64 || document?.content || "").trim();

    if (!mainBase64) {
      logPost("validation failed: missing main document base64");
      return res.status(400).json({ error: "Main document base64 is required." });
    }

    try {
      normalizeRecipientAddress(recipient || {});
    } catch (err) {
      throw withStage(err, "normalize_recipient", { recipient });
    }

    const offerNumber =
      String(meta?.offerNumber || req.body?.offerNumber || "").trim() || mainFilename.replace(/\.pdf$/i, "");

    let requestedAttachments;
    try {
      requestedAttachments = await normalizeRequestedAttachments(attachments);
    } catch (err) {
      throw withStage(err, "normalize_attachments", { attachments });
    }

    let letterBase64;
    try {
      assertPdfSize(mainBase64, mainFilename);
      for (const att of requestedAttachments) assertPdfSize(att.base64, att.filename);

      letterBase64 = await normalizeToA4(mainBase64, mainFilename);
      for (const att of requestedAttachments) {
        att.base64 = await normalizeToA4(att.base64, att.filename);
      }
    } catch (err) {
      throw withStage(err, "normalize_pdf");
    }

    const letter = {
      base64_file: letterBase64,
      base64_file_checksum: md5(letterBase64),
      filename_original: mainFilename,
      specification: {
        ...DEFAULT_SPECIFICATION,
        ...(specification && typeof specification === "object" ? specification : {}),
      },
      notice: [offerNumber, auftragId ? `Auftrag ${auftragId}` : ""].filter(Boolean).join(" / ").slice(0, 255),
    };

    if (requestedAttachments.length) {
      letter.base64_attachments = requestedAttachments.map((item) => item.base64);
    }
    if (dispatchDate) letter.dispatch_date = String(dispatchDate).trim();
    if (registered === "r1" || registered === "r2") letter.registered = registered;

    const { mode } = getConfig();

    let printjob;
    try {
      const result = await ob24Fetch("/printjobs", { method: "POST", body: { letter } });
      printjob = result?.data || null;
    } catch (err) {
      throw withStage(err, "submit_printjob", { mainFilename, offerNumber });
    }

    const printjobId = printjob?.id;
    if (!printjobId) {
      throw withStage(new Error("onlinebrief24 did not return a printjob id."), "submit_printjob_result", {
        printjob,
      });
    }

    const attachmentNames = [mainFilename, ...requestedAttachments.map((item) => item.filename)];

    const timelineEntityId = meta?.dealId ?? dealId ?? auftragId ?? null;

    let bitrixResult = null;
    try {
      const comment = buildBitrixPostalComment({
        recipient,
        offerNumber,
        printjobId,
        printjob,
        mode,
        attachmentNames,
      });

      // Bundle the same documents we handed to onlinebrief24 (main + attachments)
      // as base64 files for the Bitrix timeline entry — matches the email flow
      // so every offer type (bu, hl, bwt, bl, ah, hms, wd) gets a full document bundle.
      const bitrixAttachments = [
        { filename: mainFilename, base64: mainBase64 },
        ...requestedAttachments
          .filter((a) => a?.filename && a?.base64)
          .map((a) => ({ filename: a.filename, base64: a.base64 })),
      ];

      const resolvedEntityType =
        String(bitrixEntityType || meta?.bitrixEntityType || "deal").trim() || "deal";

      if (timelineEntityId) {
        bitrixResult = await addTimelineComment({
          entityType: resolvedEntityType,
          entityId: timelineEntityId,
          comment,
          attachments: bitrixAttachments,
        });
      } else {
        bitrixResult = { skipped: true, reason: "missing entityId" };
      }

      logPost("bitrix result", bitrixResult);
    } catch (bitrixError) {
      console.warn("[post] Bitrix timeline comment failed:", {
        message: bitrixError?.message || null,
        stack: bitrixError?.stack || null,
      });
      bitrixResult = {
        ok: false,
        error: bitrixError?.message || "Bitrix timeline comment failed",
      };
    }

    return res.json({
      ok: true,
      provider: "onlinebrief24",
      mode,
      printjobId,
      status: printjob?.status || null,
      attachmentCount: requestedAttachments.length,
      attachmentNames,
      bitrix: bitrixResult,
      document: printjob,
    });
  } catch (error) {
    console.error("[post] send failed:", {
      message: error?.message || null,
      stage: error?.stage || null,
      status: error?.status || null,
      apiPath: error?.apiPath || null,
      method: error?.method || null,
      payload: error?.payload || null,
      debug: error?.debug || null,
      stack: error?.stack || null,
    });

    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.message || "Postversand fehlgeschlagen.",
      details: error?.payload || null,
      stage: error?.stage || null,
      debug: error?.debug || null,
    });
  }
});

// Guthaben — handy for a health check before a live send.
router.get("/balance", async (_req, res) => {
  try {
    const result = await ob24Fetch("/balance", { method: "GET" });
    return res.json({ ok: true, ...(result?.data || {}) });
  } catch (error) {
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || "Balance-Abfrage fehlgeschlagen." });
  }
});

export default router;
