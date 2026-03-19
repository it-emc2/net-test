import express from "express";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_BASE_URL = "https://app.binect.de/binectapi/v1";
const DEFAULT_OPTIONS = {
  simplex: false,
  color: false,
  envelope: "DINLANG",
};

const DEFAULT_BITRIX_WEBHOOK_BASE =
  "https://emczwei.bitrix24.de/rest/2594/na0pingesg144c5z";

const STATIC_POSTAL_ATTACHMENTS = {
  abtretung: {
    id: "abtretung",
    filename: "Abtretungserklärung.pdf",
    absPath: path.join(process.cwd(), "src", "public", "assets", "Email", "Abtretungserklärung.pdf"),
  },
  barrierefrei: {
    id: "barrierefrei",
    filename: "emc2_Barrierefreies_Wohnen.pdf",
    absPath: path.join(process.cwd(), "src", "public", "assets", "Email", "emc2_Barrierefreies_Wohnen.pdf"),
  },
  vollmacht: {
    id: "vollmacht",
    filename: "Vollmacht.pdf",
    absPath: path.join(process.cwd(), "src", "public", "assets", "Email", "Vollmacht.pdf"),
  },
  // Future-ready: add more predefined postal attachments here if needed.
};

function getConfig() {
  const baseUrl = String(process.env.BINECT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const username = process.env.BINECT_USERNAME || process.env.BINNECT_USERNAME || "";
  const password = process.env.BINECT_PASSWORD || process.env.BINNECT_PASSWORD || "";

  if (!username || !password) {
    throw new Error("Binect credentials missing. Set BINECT_USERNAME and BINECT_PASSWORD in .env.");
  }

  return { baseUrl, username, password };
}

function getBitrixWebhookBase() {
  return String(process.env.BITRIX_WEBHOOK_BASE || DEFAULT_BITRIX_WEBHOOK_BASE).replace(/\/$/, "");
}

function authHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function compactObject(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function buildQS(paramsObj) {
  const sp = new URLSearchParams();
  const add = (k, v) => {
    if (v !== undefined && v !== null) sp.append(k, String(v));
  };

  for (const [k, v] of Object.entries(paramsObj || {})) {
    if (Array.isArray(v)) {
      for (const item of v) add(`${k}[]`, item);
    } else if (typeof v === "object" && v !== null) {
      for (const [kk, vv] of Object.entries(v)) add(`${k}[${kk}]`, vv);
    } else {
      add(k, v);
    }
  }
  return sp.toString();
}

async function binectFetch(apiPath, { method = "GET", body } = {}) {
  const { baseUrl, username, password } = getConfig();
  const headers = {
    Authorization: authHeader(username, password),
    Accept: "application/json",
  };

  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.error?.text || payload?.text || payload?.message || `Binect error ${res.status}`;

    const err = new Error(message || `Binect error ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

async function bitrixGet(method, paramsObj = {}) {
  const base = getBitrixWebhookBase();
  if (!base) throw new Error("BITRIX_WEBHOOK_BASE is not configured.");

  const qs = buildQS(paramsObj);
  const url = `${base}/${method}.json${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => null);

  if (!data) throw new Error("Invalid JSON response from Bitrix");
  if (data.error) throw new Error(data.error_description || data.error);

  return data;
}

async function notifyBitrixTimelineComment({ entityType = "deal", entityId, comment }) {
  if (entityId === undefined || entityId === null || String(entityId).trim() === "") {
    return { skipped: true, reason: "missing entityId" };
  }
  if (!comment || !String(comment).trim()) {
    return { skipped: true, reason: "missing comment" };
  }

  const numericId = Number(entityId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return { skipped: true, reason: "invalid entityId" };
  }

  return bitrixGet("crm.timeline.comment.add", {
    fields: {
      ENTITY_ID: numericId,
      ENTITY_TYPE: entityType,
      COMMENT: String(comment).trim(),
    },
  });
}

function buildBitrixPostalComment({ recipient, offerNumber, documentId, sendingStatus, attachmentNames }) {
  const statusText =
    sendingStatus?.text ||
    sendingStatus?.label ||
    sendingStatus?.name ||
    sendingStatus?.code ||
    "-";

  const lines = [
    "📬 Angebot per Post versendet",
    "",
    `👤 Kunde: ${String(recipient?.name || "-").trim() || "-"}`,
    `📄 Angebot: ${String(offerNumber || "-").trim() || "-"}`,
    `🆔 Binect: ${String(documentId || "-").trim() || "-"}`,
    `📦 Status: ${String(statusText)}`,
    `📎 Anhänge: ${(attachmentNames || []).join(", ") || "-"}`,
    `🕒 ${new Date().toLocaleString("de-DE")}`,
  ];

  return lines.join("\n");
}

function normalizeRecipientAddress(recipient = {}) {
  const name = String(recipient.name || "").trim();
  const street = String(recipient.street || "").trim();
  const zipCode = String(recipient.zipCode || recipient.zip || recipient.postalCode || "").trim();
  const city = String(recipient.city || "").trim();
  const country = String(recipient.country || "DE").trim() || "DE";
  const nameExtend = String(recipient.nameExtend || recipient.company || "").trim();

  if (!name || !street || !zipCode || !city) {
    throw new Error("Recipient address is incomplete. Name, street, zip code and city are required.");
  }

  return compactObject({
    name,
    nameExtend,
    street,
    zipCode,
    city,
    country,
  });
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
    const {
      recipient,
      auftragId,
      subject,
      body: letterBody,
      document,
      options,
      attributes,
      attachments,
      meta,
      dealId,
      bitrixEntityType,
    } = req.body || {};

    const mainFilename = String(document?.filename || "").trim() || "Angebot.pdf";
    const mainBase64 = String(document?.base64 || document?.content || "").trim();

    if (!mainBase64) {
      return res.status(400).json({ error: "Main document base64 is required." });
    }

    const receivingAddress = normalizeRecipientAddress(recipient || {});
    const offerNumber =
      String(meta?.offerNumber || req.body?.offerNumber || "").trim() || mainFilename.replace(/\.pdf$/i, "");

    const requestedAttachments = await normalizeRequestedAttachments(attachments);

    const uploadPayload = {
      content: {
        filename: mainFilename,
        content: mainBase64,
      },
      options: {
        ...DEFAULT_OPTIONS,
        ...(options && typeof options === "object" ? options : {}),
      },
      attributes: [
        ...(Array.isArray(attributes) ? attributes.filter(Boolean) : []),
        ...(auftragId ? [{ key: "auftragId", value: String(auftragId) }] : []),
        ...(offerNumber ? [{ key: "offerNumber", value: String(offerNumber) }] : []),
      ],
    };

    const uploadedDocument = await binectFetch("/documents", {
      method: "POST",
      body: uploadPayload,
    });

    const documentId = uploadedDocument?.id;
    if (!documentId) {
      throw new Error("Binect did not return a document id.");
    }

    const uploadedStatusCode = Number(uploadedDocument?.status?.code || 0);
    if (uploadedStatusCode === 7) {
      throw new Error(
        uploadedDocument?.status?.text || "The uploaded PDF was rejected by Binect validation.",
      );
    }

    if (String(subject || "").trim() || String(letterBody || "").trim()) {
      await binectFetch(`/documents/${documentId}/coverpage`, {
        method: "PUT",
        body: {
          receivingAddress,
          coverText: {
            subject: String(subject || "").trim(),
            text: String(letterBody || "").trim() || "Anbei erhalten Sie Ihr Angebot.",
            date: new Date().toISOString().slice(0, 10),
          },
        },
      });
    }

    const uploadedAttachmentIds = [];
    for (const attachment of requestedAttachments) {
      const createdAttachment = await binectFetch("/attachments", {
        method: "POST",
        body: {
          content: {
            filename: attachment.filename,
            content: attachment.base64,
          },
          newSheet: true,
          remarks: attachment.type === "upload" ? "Upload Post-Anhang" : "Automatischer Post-Anhang",
        },
      });

      if (createdAttachment?.id) uploadedAttachmentIds.push(createdAttachment.id);
    }

    if (uploadedAttachmentIds.length) {
      await binectFetch(`/documents/${documentId}/attachments`, {
        method: "PATCH",
        body: uploadedAttachmentIds,
      });
    }

    const sendingDocument = await binectFetch(`/sendings/${documentId}`, {
      method: "POST",
    });

    const attachmentNames = [mainFilename, ...requestedAttachments.map((item) => item.filename)];

    const timelineEntityId =
      meta?.dealId ??
      dealId ??
      auftragId ??
      null;

    let bitrixResult = null;
    try {
      bitrixResult = await notifyBitrixTimelineComment({
        entityType: String(bitrixEntityType || meta?.bitrixEntityType || "deal").trim() || "deal",
        entityId: timelineEntityId,
        comment: buildBitrixPostalComment({
          recipient,
          offerNumber,
          documentId,
          sendingStatus: sendingDocument?.status,
          attachmentNames,
        }),
      });
    } catch (bitrixError) {
      console.warn("[post] Bitrix timeline comment failed:", bitrixError?.message || bitrixError);
      bitrixResult = {
        ok: false,
        error: bitrixError?.message || "Bitrix timeline comment failed",
      };
    }

    return res.json({
      ok: true,
      provider: "binect",
      documentId,
      uploadStatus: uploadedDocument?.status || null,
      sendingStatus: sendingDocument?.status || null,
      attachmentCount: requestedAttachments.length,
      attachmentNames,
      bitrix: bitrixResult,
      document: sendingDocument,
    });
  } catch (error) {
    console.error("[post] send failed:", error?.payload || error);
    return res.status(error?.status || 500).json({
      ok: false,
      error: error?.message || "Postversand fehlgeschlagen.",
      details: error?.payload || null,
    });
  }
});

export default router;
