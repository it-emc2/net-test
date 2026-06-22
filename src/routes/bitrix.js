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

// GET /api/bitrix/activities/today
// Returns today's CRM activities indexed by OWNER_ID (deal ID) with start/end times.
// Used to enrich planning entries with exact Bitrix-confirmed appointment times.
router.get("/activities/today", async (_req, res) => {
  try {
    const now = new Date();
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to   = new Date(now); to.setHours(23, 59, 59, 999);

    const [meetingsData, callsData] = await Promise.all([
      bxGet("crm.activity.list", {
        filter: { ">=START_TIME": from.toISOString(), "<=START_TIME": to.toISOString(), TYPE_ID: 3 },
        select: ["ID", "SUBJECT", "START_TIME", "END_TIME", "OWNER_ID", "OWNER_TYPE_ID", "STATUS"],
        order:  { START_TIME: "ASC" },
      }).catch(() => ({ result: [] })),
      bxGet("crm.activity.list", {
        filter: { ">=START_TIME": from.toISOString(), "<=START_TIME": to.toISOString(), TYPE_ID: 1 },
        select: ["ID", "SUBJECT", "START_TIME", "END_TIME", "OWNER_ID", "OWNER_TYPE_ID", "STATUS"],
        order:  { START_TIME: "ASC" },
      }).catch(() => ({ result: [] })),
    ]);

    const activities = [...(meetingsData.result || []), ...(callsData.result || [])];

    // Index by OWNER_ID so the frontend can look up by importDealId
    const byDealId = {};
    for (const act of activities) {
      const ownerId = String(act.OWNER_ID || "");
      if (!ownerId) continue;
      const start = new Date(act.START_TIME);
      const end   = act.END_TIME ? new Date(act.END_TIME) : null;
      byDealId[ownerId] = {
        startMinutes: isNaN(start.getTime()) ? null : start.getHours() * 60 + start.getMinutes(),
        endMinutes:   end && !isNaN(end.getTime()) ? end.getHours() * 60 + end.getMinutes() : null,
        startISO:     isNaN(start.getTime()) ? null : start.toISOString(),
        endISO:       end && !isNaN(end.getTime()) ? end.toISOString() : null,
      };
    }

    return res.json({ byDealId });
  } catch (err) {
    console.error("GET /api/bitrix/activities/today error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// GET /api/bitrix/calendar/week
// Returns the current week's CRM activities (meetings + calls) grouped by day
// in the same { planning: { days: [...] } } shape the week calendar renderer expects.
router.get("/calendar/week", async (_req, res) => {
  try {
    // Monday–Sunday of the current week
    const now = new Date();
    const dow = now.getDay(); // 0=Sun
    const toMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(now);
    monday.setDate(now.getDate() + toMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Bitrix expects ISO or "dd.mm.yyyy hh:mm:ss" — ISO works fine
    const fromISO = monday.toISOString();
    const toISO   = sunday.toISOString();

    // Fetch meetings (TYPE_ID 3) and calls (TYPE_ID 1) for the week
    const [meetingsData, callsData] = await Promise.all([
      bxGet("crm.activity.list", {
        filter: { ">=START_TIME": fromISO, "<=START_TIME": toISO, TYPE_ID: 3 },
        select: ["ID", "SUBJECT", "START_TIME", "END_TIME", "STATUS", "RESPONSIBLE_ID", "COMMUNICATIONS", "DESCRIPTION"],
        order:  { START_TIME: "ASC" },
      }).catch(() => ({ result: [] })),
      bxGet("crm.activity.list", {
        filter: { ">=START_TIME": fromISO, "<=START_TIME": toISO, TYPE_ID: 1 },
        select: ["ID", "SUBJECT", "START_TIME", "END_TIME", "STATUS", "RESPONSIBLE_ID", "COMMUNICATIONS"],
        order:  { START_TIME: "ASC" },
      }).catch(() => ({ result: [] })),
    ]);

    const activities = [
      ...(meetingsData.result || []),
      ...(callsData.result  || []),
    ].sort((a, b) => new Date(a.START_TIME) - new Date(b.START_TIME));

    // Group activities into a day map
    const dayMap = new Map();

    for (const act of activities) {
      const start   = new Date(act.START_TIME);
      if (isNaN(start.getTime())) continue;

      const dateKey = start.toLocaleDateString("sv-SE"); // "YYYY-MM-DD"

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          date:      dateKey,
          label:     start.toLocaleDateString("de-DE", { weekday: "long" }),
          shortLabel: start.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "").slice(0, 2),
          dateLabel: start.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          locked:    false,
          customers: [],
        });
      }

      const day  = dayMap.get(dateKey);
      const end  = act.END_TIME ? new Date(act.END_TIME) : null;
      const dur  = end && !isNaN(end.getTime()) ? Math.max(0, Math.round((end - start) / 60000)) : 0;
      const mins = start.getHours() * 60 + start.getMinutes();

      // Pull phone/email from COMMUNICATIONS if present
      const comms  = Array.isArray(act.COMMUNICATIONS) ? act.COMMUNICATIONS : [];
      const phone  = comms.map(c => c.VALUE || c.PHONE || "").find(Boolean) || "";
      const email  = comms.map(c => c.EMAIL || "").find(Boolean) || "";

      // STATUS: "0"=planned, "1"=completed, "2"=failed/cancelled
      const cancelled = String(act.STATUS) === "2";
      const completed = String(act.STATUS) === "1";

      day.customers.push({
        id:                  String(act.ID),
        name:                act.SUBJECT || "Termin",
        address:             act.DESCRIPTION || "",
        email,
        phone,
        locked:              !cancelled && !completed, // planned = time is set
        lockedSlot:          null,
        cancelled,
        duration:            dur,
        manualStartMinutes:  mins,
        priority:            "medium",
        _type:               Number(act.TYPE_ID) === 1 ? "call" : "meeting",
      });
    }

    // Always emit all 5 weekdays Mon–Fri, even if empty
    const days = [];
    const cursor = new Date(monday);
    for (let i = 0; i < 5; i++) {
      const dk = cursor.toLocaleDateString("sv-SE");
      days.push(
        dayMap.get(dk) ?? {
          date:      dk,
          label:     cursor.toLocaleDateString("de-DE", { weekday: "long" }),
          shortLabel: cursor.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "").slice(0, 2),
          dateLabel: cursor.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          locked:    false,
          customers: [],
        }
      );
      cursor.setDate(cursor.getDate() + 1);
    }

    return res.json({ planning: { days } });
  } catch (err) {
    console.error("GET /api/bitrix/calendar/week error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

export default router;
export { addTimelineComment };
