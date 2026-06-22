import express from "express";

const router = express.Router();

const BITRIX_WEBHOOK_BASE =
  process.env.BITRIX_WEBHOOK_BASE ||
  "https://emczwei.bitrix24.de/rest/2594/na0pingesg144c5z";

const OWNER_TYPE = { contact: 3, requisite: 8 };
const DEFAULT_STAGE_ID = "C72:UC_YOESDE";
const BITRIX_CONCURRENCY = 3;
const RAW_IMPORT_FIELD = "ufCrm_1711018687";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function bxPost(method, paramsObj = {}, { retries = 5, retryDelayMs = 1200 } = {}) {
  if (!BITRIX_WEBHOOK_BASE) {
    throw new Error("BITRIX_WEBHOOK_BASE is not configured.");
  }

  const url = `${BITRIX_WEBHOOK_BASE}/${method}.json`;
  const body = buildQS(paramsObj);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text || "null");
    } catch {
      throw new Error(`Non-JSON response from Bitrix ${method}: ${text.slice(0, 500)}`);
    }

    if (!data) throw new Error(`Invalid JSON response from Bitrix ${method}`);
    if (!res.ok || data.error) {
      const code = data.error || `HTTP_${res.status}`;
      const retryable =
        code === "QUERY_LIMIT_EXCEEDED" ||
        code === "OVERLOAD_LIMIT" ||
        res.status === 429 ||
        res.status === 503;

      if (retryable && attempt < retries) {
        await sleep(retryDelayMs * attempt);
        continue;
      }

      throw new Error(data.error_description || data.error || text || res.statusText);
    }

    return data;
  }

  throw new Error(`Bitrix ${method} failed after retries`);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

function clean(value) {
  return String(value ?? "").trim().replace(/^=+/, "").trim();
}

function getField(label, text) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n");
  const prefix = `${label.toLowerCase()}:`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }

  return "";
}

function cleanValue(value) {
  const stringValue = String(value || "")
    .replace(/&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const blocked = new Set([
    "",
    "Informationen zum Senior",
    "Weitere Details:",
    "Erreichbarkeit:",
    "Beziehung:",
    "Pflegegrad:",
    "Lebenssituation:",
    "Mobilität:",
    "Medizinisches:",
    "Anfragedetails:",
    "Anfragen-Nr.:",
    "Bedarfsort:",
    "Pflegegrad/-stufe:",
    "Wohnsituation:",
    "Einverständnis des Vermieters:",
    "Jetzige Badeausstattung:",
    "Budgetrahmen:",
    "Restschwelle:",
    "Vor-Ort-Termin:",
    "Bedarf:",
  ]);

  return blocked.has(stringValue) ? "" : stringValue;
}

function splitName(fullName) {
  const cleaned = String(fullName || "")
    .replace(/^(Herr|Frau)\s+/i, "")
    .trim();

  if (!cleaned) return { firstName: "", lastName: "" };

  const parts = cleaned.split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function parseBedarfsort(value) {
  const stringValue = String(value || "").trim();
  const match = stringValue.match(/(\d{5})\s+(.+?)(?:-DE)?$/i);

  if (!match) return { postalCode: "", city: "" };

  return {
    postalCode: match[1].trim(),
    city: match[2].trim(),
  };
}

function parseAddressLine(value) {
  const stringValue = String(value || "").trim();
  if (!stringValue) return { street: "", postalCode: "", city: "" };

  const fullAddressMatch = stringValue.match(
    /^(.*?)(?:\s+DE-?(\d{5})\s+(.+)|\s+(\d{5})\s+(.+))$/i,
  );
  if (fullAddressMatch) {
    return {
      street: (fullAddressMatch[1] || "").trim(),
      postalCode: (fullAddressMatch[2] || fullAddressMatch[4] || "").trim(),
      city: (fullAddressMatch[3] || fullAddressMatch[5] || "").trim(),
    };
  }

  const cityOnlyMatch = stringValue.match(/^DE-?(\d{5})\s+(.+)$/i);
  if (cityOnlyMatch) {
    return {
      street: "",
      postalCode: cityOnlyMatch[1].trim(),
      city: cityOnlyMatch[2].trim(),
    };
  }

  return {
    street: stringValue,
    postalCode: "",
    city: "",
  };
}

function stripCountrySuffix(value) {
  return clean(value)
    .replace(/\s*-\s*DE\s*;?$/i, "")
    .replace(/\s*,+\s*$/g, "")
    .trim();
}

function normalizePostalCode(value) {
  return clean(value).replace(/^[A-Z]{2}-/i, "");
}

function parseStreetLine(streetRaw, cityRaw, postalRaw) {
  let street = clean(streetRaw);
  let city = stripCountrySuffix(cityRaw);
  let postalCode = normalizePostalCode(postalRaw);

  street = street.replace(/\s*\|\s*/g, " ").trim();

  if (street && (!city || !postalCode)) {
    const match = street
      .replace(/\s+/g, " ")
      .trim()
      .match(/^(.*?)(?:,\s*|\s+)(?:[A-Z]{2}-)?(\d{5})\s+(.+)$/i);

    if (match) {
      street = clean(match[1]).replace(/[,\s|]+$/, "");
      postalCode = postalCode || clean(match[2]);
      city = city || stripCountrySuffix(match[3]);
    }
  }

  return { street, city, postalCode };
}

function firstMultifieldValue(rows) {
  if (!Array.isArray(rows)) return "";
  const found = rows.find((row) => row?.VALUE);
  return found ? clean(found.VALUE) : "";
}

function hasAddressFromN8nSources(contact, deals) {
  const hasContactStreet = !!cleanValue(contact?.street);
  const hasContactLocation = !!(cleanValue(contact?.postalCode) || cleanValue(contact?.city));
  if (hasContactStreet && hasContactLocation) return true;

  return deals.some((deal) => {
    const imported = extractImportFields(deal?.[RAW_IMPORT_FIELD]);
    const hasStreet = !!imported.textAddr.street;
    const hasLocation = !!(
      imported.textAddr.postalCode ||
      imported.textAddr.city ||
      imported.loc.postalCode ||
      imported.loc.city
    );
    return hasStreet && hasLocation;
  });
}

async function listDealsByStage(stageId) {
  const items = [];
  let start = 0;

  do {
    const data = await bxPost("crm.item.list", {
      entityTypeId: 2,
      select: ["id", "title", "stageId", "contactId", "createdTime", RAW_IMPORT_FIELD],
      filter: { stageId },
      order: { createdTime: "DESC" },
      start,
    });

    items.push(...(data.result?.items || []));
    start = data.next;
  } while (start !== undefined && start !== null);

  return items;
}

async function getContact(contactId) {
  if (!contactId) return null;
  const data = await bxPost("crm.contact.get", { id: Number(contactId) });
  return data.result || null;
}

async function listRequisitesByContact(contactId) {
  if (!contactId) return [];
  const data = await bxPost("crm.requisite.list", {
    filter: {
      ENTITY_TYPE_ID: OWNER_TYPE.contact,
      ENTITY_ID: Number(contactId),
    },
    order: { ID: "ASC" },
  });
  return data.result || [];
}

async function listAddressesByRequisiteId(requisiteId) {
  if (!requisiteId) return [];
  const data = await bxPost("crm.address.list", {
    filter: {
      ENTITY_TYPE_ID: OWNER_TYPE.requisite,
      ENTITY_ID: Number(requisiteId),
    },
  });
  return data.result || [];
}

function mapContactToNormalized(contact, contactId = "") {
  const c = contact || {};
  return {
    contactId: clean(c.ID || contactId),
    contact: {
      bitrixContactId: clean(c.ID || contactId),
      salutation: clean(c.HONORIFIC?.STATUS_ID || c.HONORIFIC || c.HONORIFIC_ID),
      firstName: clean(c.NAME),
      lastName: clean(c.LAST_NAME),
      company: clean(c.COMPANY_TITLE),
      phone: firstMultifieldValue(c.PHONE),
      email: firstMultifieldValue(c.EMAIL),
      street: clean(c.ADDRESS || c.ADDRESS_1),
      city: clean(c.ADDRESS_CITY),
      state: clean(c.ADDRESS_PROVINCE || c.ADDRESS_REGION),
      postalCode: normalizePostalCode(c.ADDRESS_POSTAL_CODE),
      country: clean(c.ADDRESS_COUNTRY),
    },
  };
}

function mapBitrixAddressRow(row, contactId = "") {
  if (!row) {
    return {
      contactId: clean(contactId),
      address: { street: "", city: "", state: "", postalCode: "", country: "" },
    };
  }

  const parsed = parseStreetLine(row.ADDRESS_1, row.CITY, row.POSTAL_CODE);

  return {
    contactId: clean(row.ANCHOR_ID || contactId),
    address: {
      street: parsed.street,
      city: parsed.city,
      state: clean(row.PROVINCE || row.REGION),
      postalCode: parsed.postalCode,
      country: clean(row.COUNTRY),
    },
  };
}

function extractImportFields(rawImportText) {
  const raw = String(rawImportText || "");
  const fullName = cleanValue(getField("Name", raw));
  const textAddress = cleanValue(getField("Anschrift", raw));

  return {
    nameParts: splitName(fullName),
    phoneFromText: cleanValue(getField("Mobil", raw)).replace(/^Mobil:\s*/i, ""),
    emailFromText: cleanValue(getField("E-Mail-Adresse", raw)),
    textAddress,
    textAddr: parseAddressLine(textAddress),
    loc: parseBedarfsort(cleanValue(getField("Bedarfsort", raw))),
    erreichbarkeit: cleanValue(getField("Erreichbarkeit", raw)),
    beziehung: cleanValue(getField("Beziehung", raw)),
    pflegegrad: cleanValue(getField("Pflegegrad", raw)),
    lebenssituation: cleanValue(getField("Lebenssituation", raw)),
    mobilitaet: cleanValue(getField("Mobilität", raw)),
    medizinisches: cleanValue(getField("Medizinisches", raw)),
    anfragedetails: cleanValue(getField("Anfragedetails", raw)),
    anfragenNr: cleanValue(getField("Anfragen-Nr.", raw)),
    bedarfsort: cleanValue(getField("Bedarfsort", raw)),
    pflegegradStufe: cleanValue(getField("Pflegegrad/-stufe", raw)),
    wohnsituation: cleanValue(getField("Wohnsituation", raw)),
    einverstaendnisVermieter: cleanValue(getField("Einverständnis des Vermieters", raw)),
    jetzigeBadeausstattung: cleanValue(getField("Jetzige Badeausstattung", raw)),
    budget: cleanValue(getField("Budgetrahmen", raw)),
    restschwelle: cleanValue(getField("Restschwelle", raw)),
    vorOrtTermin: cleanValue(getField("Vor-Ort-Termin", raw)),
    bedarf: cleanValue(getField("Bedarf", raw)),
  };
}

function buildKundendaten(merged, deal = {}) {
  const c = merged.contact || {};
  const a = merged.address || {};
  const rawImportText = String(deal[RAW_IMPORT_FIELD] || "");
  const imported = extractImportFields(rawImportText);
  const contactAddr = parseAddressLine(c.street);

  return {
    Kundendaten: {
      bitrixContactId: clean(c.bitrixContactId || merged.contactId),
      customerNumber: clean(c.bitrixContactId || merged.contactId),
      salutation: clean(c.salutation),
      firstName: cleanValue(c.firstName) || imported.nameParts.firstName,
      lastName: cleanValue(c.lastName) || imported.nameParts.lastName,
      company: clean(c.company),
      phone: clean(c.phone) || imported.phoneFromText,
      email: clean(c.email) || imported.emailFromText,
      street:
        cleanValue(c.street) ||
        imported.textAddr.street ||
        contactAddr.street ||
        clean(a.street),
      city:
        cleanValue(c.city) ||
        imported.textAddr.city ||
        contactAddr.city ||
        imported.loc.city ||
        clean(a.city),
      state: cleanValue(c.state) || clean(a.state),
      postalCode:
        cleanValue(c.postalCode) ||
        imported.textAddr.postalCode ||
        contactAddr.postalCode ||
        imported.loc.postalCode ||
        clean(a.postalCode),
      country: clean(a.country) || clean(c.country),
      erreichbarkeit: imported.erreichbarkeit,
      beziehung: imported.beziehung,
      pflegegrad: imported.pflegegrad,
      lebenssituation: imported.lebenssituation,
      mobilitaet: imported.mobilitaet,
      medizinisches: imported.medizinisches,
      anfragedetails: imported.anfragedetails,
      anfragenNr: imported.anfragenNr,
      bedarfsort: imported.bedarfsort,
      pflegegradStufe: imported.pflegegradStufe,
      wohnsituation: imported.wohnsituation,
      einverstaendnisVermieter: imported.einverstaendnisVermieter,
      jetzigeBadeausstattung: imported.jetzigeBadeausstattung,
      budget: imported.budget,
      restschwelle: imported.restschwelle,
      vorOrtTermin: imported.vorOrtTermin,
      bedarf: imported.bedarf,
    },
  };
}

async function getKundendatenForStage(stageId = DEFAULT_STAGE_ID) {
  const deals = await listDealsByStage(stageId);
  const contactIds = [
    ...new Set(deals.map((deal) => clean(deal.contactId)).filter(Boolean)),
  ];

  const contactResults = await mapLimit(contactIds, BITRIX_CONCURRENCY, async (contactId) => {
    try {
      return mapContactToNormalized(await getContact(contactId), contactId);
    } catch (error) {
      return {
        contactId: clean(contactId),
        contact: { bitrixContactId: clean(contactId) },
        _contactError: error?.message || String(error),
      };
    }
  });

  const contactMap = new Map(
    contactResults.map((item) => [clean(item.contactId), item]),
  );
  const dealsByContactId = new Map();
  deals.forEach((deal) => {
    const contactId = clean(deal.contactId);
    if (!contactId) return;
    const bucket = dealsByContactId.get(contactId) || [];
    bucket.push(deal);
    dealsByContactId.set(contactId, bucket);
  });

  const contactIdsNeedingAddressFallback = contactIds.filter((contactId) => {
    const contact = contactMap.get(contactId)?.contact || {};
    const contactDeals = dealsByContactId.get(contactId) || [];
    return !hasAddressFromN8nSources(contact, contactDeals);
  });

  const addressResultsNested = await mapLimit(contactIdsNeedingAddressFallback, BITRIX_CONCURRENCY, async (contactId) => {
    try {
      const requisites = await listRequisitesByContact(contactId);
      if (!requisites.length) {
        return [mapBitrixAddressRow(null, contactId)];
      }

      const addressSets = await mapLimit(requisites, 2, async (requisite) => {
        const rows = await listAddressesByRequisiteId(requisite.ID);
        return rows.map((row) => mapBitrixAddressRow(row, contactId));
      });
      const addresses = addressSets.flat();

      return [
        addresses.find((item) =>
          item.address?.street || item.address?.city || item.address?.postalCode
        ) ||
          addresses[0] ||
          mapBitrixAddressRow(null, contactId),
      ];
    } catch (error) {
      return [
        {
          ...mapBitrixAddressRow(null, contactId),
          _addressError: error?.message || String(error),
        },
      ];
    }
  });

  const addressMap = new Map(
    addressResultsNested.flat().map((item) => [clean(item.contactId), item]),
  );

  const byContact = new Map(
    contactIds.map((contactId) => {
      const contact = contactMap.get(contactId) || { contactId, contact: {} };
      const address = addressMap.get(contactId) || { contactId, address: {} };
      return [
        contactId,
        {
          contactId,
          contact: contact.contact || {},
          address: address.address || {},
        },
      ];
    }),
  );

  return deals.map((deal) => {
    const merged = byContact.get(clean(deal.contactId)) || {
      contactId: clean(deal.contactId),
      contact: {},
      address: {},
    };

    return {
      dealId: clean(deal.id),
      title: clean(deal.title),
      dealTitle: clean(deal.title),
      dealStage: clean(deal.stageId),
      stageId: clean(deal.stageId),
      createdTime: clean(deal.createdTime),
      contactId: clean(deal.contactId),
      ...buildKundendaten(merged, deal),
      rawImportText: String(deal[RAW_IMPORT_FIELD] || ""),
    };
  });
}

router.get("/bitrix/kundendaten", async (req, res) => {
  try {
    const stageId = String(req.query.stageId || DEFAULT_STAGE_ID).trim();
    const customers = await getKundendatenForStage(stageId);
    return res.json(customers);
  } catch (err) {
    console.error("GET /api/bitrix/kundendaten failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

router.post("/calendar/today", async (req, res) => {
  try {
    const data = await bxPost("calendar.event.get", {
      type: "group",
      ownerId: "152",
    });
    return res.json(data);
  } catch (err) {
    console.error("POST /api/calendar/today failed:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
    });
  }
});

export default router;
