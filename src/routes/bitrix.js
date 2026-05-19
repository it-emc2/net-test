// src/routes/bitrix.js
import express from "express";

const router = express.Router();

const BITRIX_WEBHOOK_BASE = "https://emczwei.bitrix24.de/rest/2594/na0pingesg144c5z";

// Bitrix constants (from your script)
const OWNER_TYPE = { contact: 3, company: 4 };

// ---------- helpers ----------
function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === "";
}

function buildQS(paramsObj) {
  const sp = new URLSearchParams();

  function appendValue(prefix, value) {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => appendValue(`${prefix}[${index}]`, item));
      return;
    }

    if (typeof value === "object") {
      Object.entries(value).forEach(([key, nested]) => {
        appendValue(`${prefix}[${key}]`, nested);
      });
      return;
    }

    sp.append(prefix, String(value));
  }

  Object.entries(paramsObj || {}).forEach(([key, value]) => {
    appendValue(key, value);
  });

  return sp.toString();
}

/**
 * Calls Bitrix REST webhook endpoints like:
 *   `${BITRIX_WEBHOOK_BASE}/crm.contact.get.json?id=123`
 *
 * Many Bitrix methods accept GET query params, so we use GET.
 */
async function bxGet(method, paramsObj = {}) {
  if (!BITRIX_WEBHOOK_BASE) {
    throw new Error(
      "BITRIX_WEBHOOK_BASE is not configured (set it in env).",
    );
  }

  const qs = buildQS(paramsObj);
  const url = `${BITRIX_WEBHOOK_BASE}/${method}.json${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, { method: "GET" });
  const data = await res.json().catch(() => null);

  if (!data) throw new Error("Invalid JSON response from Bitrix");
  if (data.error) throw new Error(data.error_description || data.error);

  return data;
}

async function bxPost(method, paramsObj = {}) {
  if (!BITRIX_WEBHOOK_BASE) {
    throw new Error(
      "BITRIX_WEBHOOK_BASE is not configured (set it in env).",
    );
  }

  const url = `${BITRIX_WEBHOOK_BASE}/${method}.json`;
  const body = buildQS(paramsObj);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });
  const data = await res.json().catch(() => null);

  if (!data) throw new Error("Invalid JSON response from Bitrix");
  if (data.error) throw new Error(data.error_description || data.error);

  return data;
}

async function addTimelineComment({
  entityType,
  entityId,
  comment,
  attachments = [],
}) {
  const numericId = Number(entityId);
  if (!entityType) throw new Error("entityType is required");
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("entityId must be a positive number");
  }
  if (!comment || !String(comment).trim()) {
    throw new Error("comment is required");
  }

  const files = (Array.isArray(attachments) ? attachments : [])
    .map((item) => ({
      filename: String(item?.filename || "").trim(),
      base64: String(item?.base64 || item?.content || "").trim(),
    }))
    .filter((item) => item.filename && item.base64)
    .map((item) => [item.filename, item.base64]);

  const fields = {
    ENTITY_ID: numericId,
    ENTITY_TYPE: entityType,
    COMMENT: String(comment).trim(),
  };

  if (files.length) {
    fields.FILES = files;
  }

  return bxPost("crm.timeline.comment.add", { fields });
}

async function getRequisiteIdForContact(contactId) {
  const data = await bxGet("crm.requisite.list", {
    filter: { ENTITY_TYPE_ID: OWNER_TYPE.contact, ENTITY_ID: Number(contactId) },
    select: ["ID"],
    order: { ID: "ASC" },
  });

  const arr = data.result;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return Number(arr[0].ID);
}

async function getAddressForRequisite(reqId) {
  const data = await bxGet("crm.address.list", {
    filter: { ENTITY_TYPE_ID: 8, ENTITY_ID: Number(reqId) },
    select: ["*"],
  });

  const arr = data.result;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0];
}

function patchContactAddressFromReq(contact, reqAddr) {
  const street = String(reqAddr?.ADDRESS_1 || "").trim();
  const zip = String(reqAddr?.POSTAL_CODE || "").trim();
  const city = String(reqAddr?.CITY || "").trim();

  // Patch into the same keys your frontend expects from crm.contact.get
  if (street) contact.ADDRESS = street;
  if (zip) contact.ADDRESS_POSTAL_CODE = zip;
  if (city) contact.ADDRESS_CITY = city;

  return contact;
}

// ---------- route ----------
// GET /api/bitrix/contact/:id
router.get("/contact/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    // 1) contact.get
    const contactResp = await bxGet("crm.contact.get", { id });
    const contact = contactResp?.result;

    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    // 2) if ADDRESS* missing, try requisites
    const hasAnyAddress =
      !isEmpty(contact.ADDRESS) ||
      !isEmpty(contact.ADDRESS_CITY) ||
      !isEmpty(contact.ADDRESS_POSTAL_CODE);

    if (!hasAnyAddress) {
      const reqId = await getRequisiteIdForContact(contact.ID || id);
      if (reqId) {
        const reqAddr = await getAddressForRequisite(reqId);
        if (reqAddr) {
          patchContactAddressFromReq(contact, reqAddr);
          // optional debug marker (remove if you want)
          contactResp.__addressSource = `REQUISITE:${reqId}`;
        }
      }
    }

    // return same shape: { result: {...} }
    return res.json(contactResp);
  } catch (err) {
    console.error("GET /api/bitrix/contact/:id error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});


// POST /api/bitrix/timeline/comment
// Body: { entityType: 'deal'|'contact'|'company'|'lead'|..., entityId: number|string, comment: string }
router.post("/timeline/comment", express.json({ limit: "25mb" }), async (req, res) => {
  try {
    const entityType = String(req.body?.entityType || "").trim();
    const entityIdRaw = req.body?.entityId;
    const comment = String(req.body?.comment || "").trim();

    if (!entityType) return res.status(400).json({ error: "entityType is required" });
    if (entityIdRaw === undefined || entityIdRaw === null || String(entityIdRaw).trim() === "") {
      return res.status(400).json({ error: "entityId is required" });
    }
    if (!comment) return res.status(400).json({ error: "comment is required" });
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const data = await addTimelineComment({
      entityType,
      entityId: entityIdRaw,
      comment,
      attachments,
    });

    return res.json(data);
  } catch (err) {
    console.error("POST /api/bitrix/timeline/comment error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

export default router;
export { addTimelineComment };
