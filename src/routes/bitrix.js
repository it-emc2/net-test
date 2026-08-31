// src/routes/bitrix.js
import express from "express";
import { buildAhData } from "./docx-template.js";
import BitrixLog from "../models/BitrixLog.js";
import UserActionLog from "../models/UserActionLog.js";

const router = express.Router();

const BITRIX_WEBHOOK_BASE = "https://emczwei.bitrix24.de/rest/2594/na0pingesg144c5z";

// Bitrix constants (from your script)
const OWNER_TYPE = { contact: 3, company: 4 };

// Deal pipeline stage the offer email flow advances the deal to.
// "[VI] ANG verschickt" lives in deal category 38 (STATUS_ID C38:UC_2ZDNEZ).
const ANG_VERSCHICKT_STAGE_ID = "C38:UC_2ZDNEZ";
const ANG_VERSCHICKT_CATEGORY_ID = 38;

// AH (Alltagshilfe) offers use a separate pipeline: "[VI] ANG versch. / warten"
// lives in deal category 52 (STATUS_ID C52:UC_SNAVG8).
const AH_ANG_VERSCHICKT_STAGE_ID = "C52:UC_SNAVG8";
const AH_ANG_VERSCHICKT_CATEGORY_ID = 52;

// Fields the user is prompted for before entering "[VI] ANG verschickt".
// Only Betrag (OPPORTUNITY) is asked — Währung is always EUR and defaulted
// server-side in updateDealStage().
const ANG_VERSCHICKT_REQUIRED_FIELDS = ["OPPORTUNITY"];

// Stage a completed appointment ("Heutige Termine Planung") is moved to.
// "Zuteilen HD/ AH/ DH" lives in deal category 72 (STATUS_ID C72:PREPARATION).
const ZUTEILEN_STAGE_ID = "C72:PREPARATION";
const ZUTEILEN_CATEGORY_ID = 72;

// AH-specific deal fields, filled from buildAhData()'s AhBitrix output when an
// AH deal is moved to "ANG verschickt". Field IDs/enum option IDs per Bitrix
// crm.deal.fields (checked against real examples, see PR discussion).
const AH_FIELD = {
  ANFAHRTSZONE: "UF_CRM_1711019971",           // enum, single
  STUNDEN_PRO_EINSATZ: "UF_CRM_1711019061",    // double
  ART_DER_LEISTUNG: "UF_CRM_1711017420",       // enum, multiple
  ANZAHL_ANFAHRTSPAUSCHALEN: "UF_CRM_1737548607", // double
  MONATLICHER_STUNDENUMFANG: "UF_CRM_1711092227", // double
  REGELMAESSIGKEIT: "UF_CRM_1711019214",       // enum, single
  GESAMTPREIS_AB: "UF_CRM_1737557386",         // double
  GESAMTPREIS_ANFAHRT: "UF_CRM_1737557868",    // double
  GESAMTBETRAG_AB: "UF_CRM_1737644914",        // double
  GESAMTPREIS_HND: "UF_CRM_1738336465",        // double
  GESAMTBETRAG_HND: "UF_CRM_1738336847",       // double
  TATSAECHLICHER_STUNDENUMFANG: "UF_CRM_1711092423", // double
};

// Anfahrtszone enum option IDs. Bitrix only defines Zone 1-5 (+ two Festpreis
// options the app never produces); zoneNum is uncapped in the app, so clamp.
const AH_ZONE_ENUM = { 1: "1928", 2: "1930", 3: "1932", 4: "1934", 5: "1936" };

// Art der gewünschten Leistung enum option IDs (multi-select).
const AH_LEISTUNG_ENUM = { hnd: "1862", ab: "4316" };

// Regelmäßigkeit enum option IDs — keys match the app's raw regelmaessigkeit
// strings 1:1 (same labels used in AH_FREQ, docx-template.js).
const AH_REGELMAESSIGKEIT_ENUM = {
  "Einmalig": "1904",
  "Wöchentlich": "1906",
  "14-tägig": "1908",
  "alle drei Wochen": "4526",
  "Monatlich": "1910",
  "Vierteljährlich": "1912",
  "Halbjährlich": "1914",
  "Jährlich": "4528",
  "Bei Bedarf": "4524",
};

// Builds the AH-specific UF_CRM_* fields object from an offer payload, for
// merging into the crm.item.update call when moving an AH deal to
// "ANG verschickt". `currentZoneValue` is the deal's existing Anfahrtszone
// value (falsy/empty means "not set yet") — the zone is only ever filled in
// once, never overwritten on a later resend.
function buildAhBitrixFields(payload, currentZoneValue) {
  const { AhBitrix } = buildAhData(payload || {});
  const fields = {};

  if (!currentZoneValue) {
    const zoneId = AH_ZONE_ENUM[Math.min(5, Math.max(0, Math.round(AhBitrix.zoneNum)))];
    if (zoneId) fields[AH_FIELD.ANFAHRTSZONE] = zoneId;
  }

  if (AhBitrix.stundenProEinsatz > 0) {
    fields[AH_FIELD.STUNDEN_PRO_EINSATZ] = AhBitrix.stundenProEinsatz;
  }

  const leistungIds = [
    AhBitrix.hasHnD ? AH_LEISTUNG_ENUM.hnd : null,
    AhBitrix.hasAb ? AH_LEISTUNG_ENUM.ab : null,
  ].filter(Boolean);
  if (leistungIds.length) fields[AH_FIELD.ART_DER_LEISTUNG] = leistungIds;

  if (AhBitrix.anzahlAnfahrtspauschalen > 0) {
    fields[AH_FIELD.ANZAHL_ANFAHRTSPAUSCHALEN] = AhBitrix.anzahlAnfahrtspauschalen;
  }
  if (AhBitrix.monatlicherStundenumfang > 0) {
    fields[AH_FIELD.MONATLICHER_STUNDENUMFANG] = AhBitrix.monatlicherStundenumfang;
  }

  const regelId = AH_REGELMAESSIGKEIT_ENUM[AhBitrix.regelmaessigkeit];
  if (regelId) fields[AH_FIELD.REGELMAESSIGKEIT] = regelId;

  if (AhBitrix.gesamtpreisAB > 0) fields[AH_FIELD.GESAMTPREIS_AB] = AhBitrix.gesamtpreisAB;
  if (AhBitrix.gesamtpreisHnD > 0) fields[AH_FIELD.GESAMTPREIS_HND] = AhBitrix.gesamtpreisHnD;
  if (AhBitrix.anfahrtGesamt > 0) fields[AH_FIELD.GESAMTPREIS_ANFAHRT] = AhBitrix.anfahrtGesamt;
  if (AhBitrix.gesamtbetragAB > 0) fields[AH_FIELD.GESAMTBETRAG_AB] = AhBitrix.gesamtbetragAB;
  if (AhBitrix.gesamtbetragHnD > 0) fields[AH_FIELD.GESAMTBETRAG_HND] = AhBitrix.gesamtbetragHnD;
  if (AhBitrix.tatsaechlicherStundenumfang > 0) {
    fields[AH_FIELD.TATSAECHLICHER_STUNDENUMFANG] = AhBitrix.tatsaechlicherStundenumfang;
  }

  return fields;
}

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
// All Bitrix calls (every offer type, every route) go through bxGet/bxPost,
// so logging failures here covers the whole app in one place.
function logBitrixFailure(method, paramsObj, err, httpMethod) {
  console.error(`[bitrix] ${method} failed:`, err);
  BitrixLog.create({
    method,
    message: err?.message || String(err),
    params: paramsObj,
    httpMethod,
  }).catch((logErr) => console.error("[bitrix] failed to write BitrixLog:", logErr));
}

async function bxGet(method, paramsObj = {}) {
  try {
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
  } catch (err) {
    logBitrixFailure(method, paramsObj, err, "GET");
    throw err;
  }
}

async function bxPost(method, paramsObj = {}) {
  try {
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
  } catch (err) {
    logBitrixFailure(method, paramsObj, err, "POST");
    throw err;
  }
}

// Replay a previously logged failed Bitrix call with its original params.
// Marks the log entry resolved on success; a fresh failure logs a new entry
// (via bxGet/bxPost above) and this rethrows, leaving the original untouched.
export async function retryBitrixLog(logId) {
  const log = await BitrixLog.findById(logId);
  if (!log) throw new Error("Log-Eintrag nicht gefunden");
  const call = log.httpMethod === "GET" ? bxGet : bxPost;
  const result = await call(log.method, log.params || {});
  log.resolved = true;
  log.resolvedAt = new Date();
  await log.save();
  return result;
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

// entityTypeId for deals in the universal CRM item API.
const DEAL_ENTITY_TYPE_ID = 2;

// UF_CRM_1775019866756 ("Anzahl Umbautage") enumeration option IDs.
const UMBAUTAGE_ENUM = {
  NICHT_ZUTREFFEND: "8436",
  HALF_DAY: "8444", // "0,5 (BWT / Handläufe)"
  ONE_DAY: "8438",
  TWO_DAYS: "8440",
  THREE_DAYS: "8442",
};

// BWT/Handläufe offers always get the fixed 0,5-day option; BU offers derive
// the day count from the Arbeitszeit tab (only 1/2/3 map to an enum option).
function resolveUmbautageEnumId(workDays, offerType) {
  const type = String(offerType || "").toLowerCase();
  if (type === "bwt" || type === "hl") return UMBAUTAGE_ENUM.HALF_DAY;
  switch (Math.round(Number(workDays) || 0)) {
    case 1: return UMBAUTAGE_ENUM.ONE_DAY;
    case 2: return UMBAUTAGE_ENUM.TWO_DAYS;
    case 3: return UMBAUTAGE_ENUM.THREE_DAYS;
    default: return UMBAUTAGE_ENUM.NICHT_ZUTREFFEND;
  }
}

// Move a deal to a specific pipeline stage. STAGE_IDs are category-specific
// (prefixed with C<categoryId>:), so when the target stage belongs to a
// different pipeline the deal's category must change too. crm.deal.update
// silently ignores CATEGORY_ID changes, so use crm.item.update (which does
// support moving a deal between pipelines). Note crm.item.* uses camelCase
// field names (stageId/categoryId/opportunity) unlike crm.deal.* (STAGE_ID…).
// Custom UF_CRM_* fields keep their original field code either way.
async function updateDealStage({
  dealId,
  stageId,
  categoryId,
  opportunity,
  currencyId,
  workDays,
  offerType,
  offerNumber,
  finalTotal,
  selfPayAmount,
  extraFields,
}) {
  const numericId = Number(dealId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("dealId must be a positive number");
  }
  if (!stageId || !String(stageId).trim()) {
    throw new Error("stageId is required");
  }

  // categoryId must be sent before/with stageId so the stage is valid for the
  // target pipeline.
  const fields = {};
  if (categoryId !== undefined && categoryId !== null && String(categoryId) !== "") {
    fields.categoryId = Number(categoryId);
  }
  fields.stageId = String(stageId).trim();

  // AH has its own dedicated field set (see AH_* fields below, filled by the
  // caller once the corresponding Bitrix field IDs are known) — none of the
  // generic BU fields (Betrag, Umbautage, finalTotal, offerNumber, Eigenanteil)
  // apply to it.
  const isAhOffer = String(offerType || "").toLowerCase() === "ah";

  // "Betrag und Währung" — required on some stages. Fill it from the offer total.
  const amount = Number(opportunity);
  if (!isAhOffer && Number.isFinite(amount) && amount > 0) {
    fields.opportunity = amount;
    // Keep the amount fixed instead of letting Bitrix recompute it from the
    // (empty) product rows, which would reset it to 0.
    fields.isManualOpportunity = "Y";
    fields.currencyId = String(currencyId || "EUR").trim() || "EUR";
  }

  // Offer fields the sales team wants populated on the deal when the offer
  // email goes out and the deal is moved to "ANG verschickt".
  // AH has no "Umbautage" concept (per-Einsatz service, not a renovation), so
  // this field is skipped for it.
  if (!isAhOffer && (workDays !== undefined || offerType !== undefined)) {
    fields.UF_CRM_1775019866756 = resolveUmbautageEnumId(workDays, offerType);
  }
  const finalTotalNum = Number(finalTotal);
  if (!isAhOffer && Number.isFinite(finalTotalNum) && finalTotalNum > 0) {
    fields.UF_CRM_1768391021079 = finalTotalNum;
  }
  if (!isAhOffer && offerNumber && String(offerNumber).trim()) {
    fields.UF_CRM_1776156870205 = String(offerNumber).trim();
  }
  // Eigenanteil is only relevant for Kassenkunde; caller omits it otherwise.
  const selfPayNum = Number(selfPayAmount);
  if (!isAhOffer && Number.isFinite(selfPayNum) && selfPayNum > 0) {
    fields.UF_CRM_1757490052931 = selfPayNum;
  }

  // AH's own field set (Anfahrtszone, Art der Leistung, Gesamtpreise, …),
  // computed by the caller via buildAhBitrixFields().
  if (extraFields) Object.assign(fields, extraFields);

  return bxPost("crm.item.update", {
    entityTypeId: DEAL_ENTITY_TYPE_ID,
    id: numericId,
    fields,
    // crm.item.update expects UF_CRM_* keys camelCased (ufCrm_...) unless
    // told otherwise — without this the custom fields above are silently
    // dropped and land empty on the deal.
    useOriginalUfNames: "Y",
  });
}

// Stages the deal moves to once the customer finishes online signing
// (BU/BWT only — AH has no such step). Both live in deal category 38, the
// same pipeline as ANG_VERSCHICKT_STAGE_ID above.
const SIGNING_KASSE_STAGE_ID = "C38:UC_ON3GS1"; // "[VI] Antrag an Kasse stellen"
const SIGNING_SZ_STAGE_ID = "C38:UC_5DII17"; // "[VI] AUTOM in FT anl. + überpr."
const SIGNING_CATEGORY_ID = 38;

// Fixed field values filled on the deal once a Kassenkunde completes online
// signing (Vollmacht + Abtretung always get signed as part of that flow, so
// these are always "Ja"/"emc2" — not derived from anything customer-specific).
const SIGNING_KASSE_FIELDS = {
  UF_CRM_1771944212969: "8396", // Antragsstellung bei Kasse durch -> emc2
  UF_CRM_1771944969284: "8400", // [autom] Mail an Kd. bzgl. Antragsstellung -> Ja
  UF_CRM_1772533113350: "8412", // Kassen-Vollmacht beim Kontakt hinterlegt? -> Ja
  UF_CRM_1772533223056: "8418", // Abtretungserklärung §40 SGB XI hinterlegt? -> Ja
};

// Move a deal after the customer completes online signing (see signing.js).
// Kassenkunde also gets the Vollmacht/Abtretung fields filled in; Selbstzahler
// is just a stage move.
async function updateDealAfterSigning({ dealId, customerType }) {
  const numericId = Number(dealId);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error("dealId must be a positive number");
  }

  const isKasse = String(customerType || "").toUpperCase() === "KASSE";
  const fields = {
    categoryId: SIGNING_CATEGORY_ID,
    stageId: isKasse ? SIGNING_KASSE_STAGE_ID : SIGNING_SZ_STAGE_ID,
  };
  if (isKasse) Object.assign(fields, SIGNING_KASSE_FIELDS);

  return bxPost("crm.item.update", {
    entityTypeId: DEAL_ENTITY_TYPE_ID,
    id: numericId,
    fields,
    useOriginalUfNames: "Y",
  });
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


// GET /api/bitrix/contact/:id/deals — returns deal IDs linked to a contact
router.get("/contact/:id/deals", async (req, res) => {
  const contactId = String(req.params.id || "").trim();
  if (!contactId) return res.status(400).json({ error: "Missing contact id" });
  try {
    const data = await bxGet("crm.deal.list", {
      filter: { CONTACT_ID: contactId },
      select: ["ID", "TITLE"],
    });
    const deals = (data?.result || []).map((d) => ({
      id:    String(d.ID),
      title: String(d.TITLE || "").trim(),
    }));
    return res.json({ deals });
  } catch (err) {
    console.error("GET /api/bitrix/contact/:id/deals error:", err);
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

// GET /api/bitrix/deal/:id/ang-verschickt-fields
// Reads the deal and reports which "[VI] ANG verschickt" required fields
// (Betrag/Währung) are still empty, with options for the currency select.
// GET /api/bitrix/deal/:id — deal + its linked contact, for the Hauptmenü
// "Bitrix Deal laden" field (loads a deal directly, without knowing the
// contact ID first).
router.get("/deal/:id", async (req, res) => {
  try {
    const dealId = String(req.params.id || "").trim();
    if (!dealId) return res.status(400).json({ error: "id is required" });

    const dealResp = await bxGet("crm.deal.get", { id: dealId });
    const deal = dealResp?.result;
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    let contact = null;
    if (deal.CONTACT_ID) {
      const contactResp = await bxGet("crm.contact.get", { id: deal.CONTACT_ID });
      contact = contactResp?.result || null;

      if (contact) {
        const hasAnyAddress =
          !isEmpty(contact.ADDRESS) ||
          !isEmpty(contact.ADDRESS_CITY) ||
          !isEmpty(contact.ADDRESS_POSTAL_CODE);

        if (!hasAnyAddress) {
          const reqId = await getRequisiteIdForContact(contact.ID || deal.CONTACT_ID);
          if (reqId) {
            const reqAddr = await getAddressForRequisite(reqId);
            if (reqAddr) patchContactAddressFromReq(contact, reqAddr);
          }
        }
      }
    }

    return res.json({
      deal: { id: Number(dealId), title: deal.TITLE || "", stageId: deal.STAGE_ID || "" },
      contact,
    });
  } catch (err) {
    console.error("GET /api/bitrix/deal/:id error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

router.get("/deal/:id/ang-verschickt-fields", async (req, res) => {
  try {
    const dealId = String(req.params.id || "").trim();
    if (!dealId) return res.status(400).json({ error: "id is required" });

    const dealResp = await bxGet("crm.deal.get", { id: dealId });
    const deal = dealResp?.result;
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    // Währung is always EUR, so it is not prompted; only Betrag is asked.
    const meta = {
      OPPORTUNITY: { label: "Betrag", type: "double" },
    };

    const fields = ANG_VERSCHICKT_REQUIRED_FIELDS.map((name) => {
      const currentValue = deal[name];
      // OPPORTUNITY of "0"/"0.00" counts as empty (no amount set yet).
      const empty =
        name === "OPPORTUNITY"
          ? isEmpty(currentValue) || Number(currentValue) === 0
          : isEmpty(currentValue);
      return {
        name,
        label: meta[name]?.label || name,
        type: meta[name]?.type || "string",
        options: meta[name]?.options,
        currentValue: currentValue ?? "",
        isEmpty: empty,
      };
    });

    return res.json({
      dealId: Number(dealId),
      title: deal.TITLE || "",
      stageId: deal.STAGE_ID || "",
      fields,
      allFilled: fields.every((f) => !f.isEmpty),
    });
  } catch (err) {
    console.error("GET /api/bitrix/deal/:id/ang-verschickt-fields error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// POST /api/bitrix/deal/:id/move-ang-verschickt
// Body: { opportunity?: number, currencyId?: string }
// Fills Betrag/Währung (if provided) and moves the deal to "[VI] ANG verschickt".
router.post("/deal/:id/move-ang-verschickt", express.json(), async (req, res) => {
  try {
    const dealId = String(req.params.id || "").trim();
    if (!dealId) return res.status(400).json({ error: "id is required" });

    const dealResp = await bxGet("crm.deal.get", { id: dealId });
    const deal = dealResp?.result;
    if (!deal) return res.status(404).json({ error: "Deal not found" });

    const isAh = String(req.body?.offerType || "").toLowerCase() === "ah";

    // Resolve final Betrag/Währung from the request, falling back to whatever
    // is already on the deal. AH doesn't use Betrag at all (see updateDealStage),
    // so it's neither required nor read from the deal here.
    const providedAmount = Number(req.body?.opportunity);
    const amount = isAh
      ? 0
      : Number.isFinite(providedAmount) && providedAmount > 0
        ? providedAmount
        : Number(deal.OPPORTUNITY) || 0;
    const currencyId =
      String(req.body?.currencyId || "").trim() ||
      String(deal.CURRENCY_ID || "").trim() ||
      "EUR";

    if (!isAh && !(amount > 0)) {
      return res.status(400).json({
        error: "Betrag (OPPORTUNITY) fehlt",
        missing: ["OPPORTUNITY"],
      });
    }

    // AH: derive its own field set from the offer payload sent by the client.
    // Anfahrtszone is only filled in once — never overwritten on a resend.
    let ahExtraFields;
    if (isAh) {
      let ahPayload = null;
      try {
        ahPayload = req.body?.payload ? JSON.parse(req.body.payload) : null;
      } catch {
        // ignore invalid JSON — AH fields just won't be set this time
      }
      if (ahPayload) {
        ahExtraFields = buildAhBitrixFields(ahPayload, deal[AH_FIELD.ANFAHRTSZONE]);
      }
    }

    const data = await updateDealStage({
      dealId,
      stageId: isAh ? AH_ANG_VERSCHICKT_STAGE_ID : ANG_VERSCHICKT_STAGE_ID,
      categoryId: isAh ? AH_ANG_VERSCHICKT_CATEGORY_ID : ANG_VERSCHICKT_CATEGORY_ID,
      opportunity: amount,
      currencyId,
      workDays: req.body?.workDays,
      offerType: req.body?.offerType,
      offerNumber: req.body?.offerNumber,
      finalTotal: req.body?.finalTotal ?? amount,
      selfPayAmount: req.body?.selfPayAmount,
      extraFields: ahExtraFields,
    });

    UserActionLog.create({
      event: "move_succeeded",
      dealId,
      offerNumber: req.body?.offerNumber,
      offerType: req.body?.offerType,
    }).catch((e) => console.warn("[bitrix] UserActionLog move_succeeded failed:", e?.message || e));

    return res.json({ ok: true, dealId: Number(dealId), result: data?.result ?? data });
  } catch (err) {
    console.error("POST /api/bitrix/deal/:id/move-ang-verschickt error:", err);
    UserActionLog.create({
      event: "move_failed",
      dealId: String(req.params.id || ""),
      offerNumber: req.body?.offerNumber,
      offerType: req.body?.offerType,
      message: err?.message || String(err),
    }).catch((e) => console.warn("[bitrix] UserActionLog move_failed failed:", e?.message || e));
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// POST /api/bitrix/log-action
// Body: { event, dealId?, offerNumber?, offerType? }
// Generic fire-and-forget audit log for client-side milestones that have no
// dealId yet (e.g. opening a configurator before a deal is picked). Deal-scoped
// events use /deal/:id/log-dialog-event instead.
router.post("/log-action", express.json(), async (req, res) => {
  const event = String(req.body?.event || "");
  if (!["termin_opened", "configurator_opened"].includes(event)) {
    return res.status(400).json({ error: "invalid event" });
  }
  try {
    await UserActionLog.create({
      event,
      dealId: req.body?.dealId,
      offerNumber: req.body?.offerNumber,
      offerType: req.body?.offerType,
    });
  } catch (e) {
    console.warn("[bitrix] UserActionLog log-action failed:", e?.message || e);
  }
  return res.json({ ok: true });
});

// POST /api/bitrix/deal/:id/log-dialog-event
// Body: { event: "move_dialog_shown" | "move_dialog_dismissed", offerNumber?, offerType? }
// Fire-and-forget audit trail for the "ANG verschickt" dialog shown after an
// offer send, so we can tell apart "user never confirmed" from a real error.
router.post("/deal/:id/log-dialog-event", express.json(), async (req, res) => {
  const dealId = String(req.params.id || "").trim();
  const event = String(req.body?.event || "");
  if (!dealId || !["move_dialog_shown", "move_dialog_dismissed"].includes(event)) {
    return res.status(400).json({ error: "invalid event" });
  }
  try {
    await UserActionLog.create({
      event,
      dealId,
      offerNumber: req.body?.offerNumber,
      offerType: req.body?.offerType,
    });
  } catch (e) {
    console.warn("[bitrix] UserActionLog dialog event failed:", e?.message || e);
  }
  return res.json({ ok: true });
});

// POST /api/bitrix/deal/:id/move-zuteilen
// Marks a completed appointment: moves the deal to "Zuteilen HD/ AH/ DH".
router.post("/deal/:id/move-zuteilen", express.json(), async (req, res) => {
  try {
    const dealId = String(req.params.id || "").trim();
    if (!dealId) return res.status(400).json({ error: "id is required" });

    const data = await updateDealStage({
      dealId,
      stageId: ZUTEILEN_STAGE_ID,
      categoryId: ZUTEILEN_CATEGORY_ID,
    });

    return res.json({ ok: true, dealId: Number(dealId), result: data?.result ?? data });
  } catch (err) {
    console.error("POST /api/bitrix/deal/:id/move-zuteilen error:", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

// GET /api/bitrix/deals/stages?ids=123,456
// Returns the current STAGE_ID for each deal — used by the today-planning
// list to hide "Hat stattgefunden" for deals already moved past it.
router.get("/deals/stages", async (req, res) => {
  try {
    const ids = String(req.query.ids || "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (!ids.length) return res.json({ stages: {} });

    const data = await bxGet("crm.item.list", {
      entityTypeId: DEAL_ENTITY_TYPE_ID,
      filter: { id: ids },
      select: ["id", "stageId"],
    });

    const stages = {};
    for (const item of data?.result?.items || []) {
      stages[String(item.id)] = item.stageId;
    }

    return res.json({ stages });
  } catch (err) {
    console.error("GET /api/bitrix/deals/stages error:", err);
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
export { addTimelineComment, updateDealStage, updateDealAfterSigning };
