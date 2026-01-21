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

export default router;
