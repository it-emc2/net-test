// TodaysCustomers.js
const BITRIX_BASE = 'https://emczwei.bitrix24.de/rest/1136/x12qj6y84r9g9era';

// --------------------
// Generic Bitrix caller
// --------------------
async function bitrixCall(method, payload = {}, { retries = 5, retryDelayMs = 1200 } = {}) {
  const url = `${BITRIX_BASE}/${method}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST', // use POST consistently for crm.item.list/filter payloads
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response from ${method}: ${text.slice(0, 500)}`);
      }

      // Bitrix REST can return 200 with error payload
      if (!res.ok || data.error) {
        const code = data.error || `HTTP_${res.status}`;
        const msg = data.error_description || text || res.statusText;

        // retry on throttling / temporary errors
        const retryable =
          code === 'QUERY_LIMIT_EXCEEDED' ||
          code === 'OVERLOAD_LIMIT' ||
          res.status === 429 ||
          res.status === 503;

        if (retryable && attempt < retries) {
          await sleep(retryDelayMs * attempt); // simple backoff
          continue;
        }

        throw new Error(`${method} failed (${code}): ${msg}`);
      }

      return data;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      await sleep(retryDelayMs * attempt);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --------------------
// Small concurrency limiter (no dependency)
// --------------------
async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) break;
      results[i] = await mapper(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --------------------
// Sanitizers / parsers
// --------------------
function clean(v) {
  return (v ?? '').toString().trim().replace(/^=+/, '').trim();
}

function stripCountrySuffix(v) {
  return clean(v)
    .replace(/\s*-\s*DE\s*;?$/i, '') // "-DE" / "-DE;"
    .replace(/\s*,+\s*$/g, '')       // trailing commas
    .trim();
}

function normalizePostalCode(v) {
  return clean(v).replace(/^[A-Z]{2}-/i, '');
}

function parseStreetLine(streetRaw, cityRaw, postalRaw) {
  let street = clean(streetRaw);
  let city = stripCountrySuffix(cityRaw);
  let postalCode = normalizePostalCode(postalRaw);

  // Handle weird separators from imports / excel / copy paste:
  // e.g. "Musterweg 1 | 12345 Berlin"
  street = street.replace(/\s*\|\s*/g, ' ').trim();

  // If city/postal missing and entire address is in street
  if (street && (!city || !postalCode)) {
    const s = street.replace(/\s+/g, ' ').trim();

    // Examples:
    // "Am Waldeck 3 DE-90530 Wendelstein"
    // "Musterweg 5, 08451 Crimmitschau"
    // "Hauptstr. 10 12345 Berlin"
    const m = s.match(/^(.*?)(?:,\s*|\s+)(?:[A-Z]{2}-)?(\d{5})\s+(.+)$/i);
    if (m) {
      street = clean(m[1]).replace(/[,\s|]+$/, '');
      postalCode = postalCode || clean(m[2]);
      city = city || stripCountrySuffix(m[3]);
    }
  }

  return { street, city, postalCode };
}

function firstMultifieldValue(arr) {
  if (!Array.isArray(arr)) return '';
  const found = arr.find(x => x && x.VALUE);
  return found ? clean(found.VALUE) : '';
}

// --------------------
// Bitrix-specific fetchers
// --------------------
async function listDealsByStage(stageId) {
  const payload = {
    entityTypeId: 2, // DEAL
    select: ['id', 'title', 'stageId', 'contactId', 'createdTime'],
    filter: { stageId },
  };

  const data = await bitrixCall('crm.item.list', payload);
  return data.result?.items || [];
}

async function getContact(contactId) {
  if (!contactId) return null;
  const data = await bitrixCall('crm.contact.get', { id: Number(contactId) });
  return data.result || null;
}

async function listRequisitesByContact(contactId) {
  if (!contactId) return [];
  // ENTITY_TYPE_ID 3 = Contact
  const data = await bitrixCall('crm.requisite.list', {
    filter: {
      ENTITY_TYPE_ID: 3,
      ENTITY_ID: Number(contactId),
    },
  });
  return data.result || [];
}

async function listAddressesByRequisiteId(requisiteId) {
  if (!requisiteId) return [];
  // ENTITY_TYPE_ID 8 = Requisite
  const data = await bitrixCall('crm.address.list', {
    filter: {
      ENTITY_TYPE_ID: 8,
      ENTITY_ID: Number(requisiteId),
    },
  });
  return data.result || [];
}

// --------------------
// Transformations
// --------------------
function mapContactToNormalized(contact) {
  const c = contact || {};
  return {
    contactId: clean(c.ID),
    contact: {
      bitrixContactId: clean(c.ID),
      firstName: clean(c.NAME),
      lastName: clean(c.LAST_NAME),
      phone: firstMultifieldValue(c.PHONE),
      email: firstMultifieldValue(c.EMAIL),

      // fallback from contact if no requisite address found
      street: clean(c.ADDRESS || c.ADDRESS_1 || ''),
      city: clean(c.ADDRESS_CITY || ''),
      state: clean(c.ADDRESS_PROVINCE || c.ADDRESS_REGION || ''),
      postalCode: normalizePostalCode(c.ADDRESS_POSTAL_CODE || ''),
    },
  };
}

function mapBitrixAddressRow(row) {
  if (!row) {
    return {
      contactId: '',
      address: { street: '', city: '', state: '', postalCode: '' },
    };
  }

  const parsed = parseStreetLine(row.ADDRESS_1, row.CITY, row.POSTAL_CODE);

  return {
    contactId: clean(row.ANCHOR_ID), // this is the contact id in your sample
    address: {
      street: parsed.street,
      city: parsed.city,
      state: clean(row.PROVINCE || row.REGION),
      postalCode: parsed.postalCode,
    },
  };
}

function buildKundendaten(merged) {
  const c = merged.contact || {};
  const a = merged.address || {};

  return {
    Kundendaten: {
      bitrixContactId: clean(c.bitrixContactId || merged.contactId),
      firstName: clean(c.firstName),
      lastName: clean(c.lastName),
      phone: clean(c.phone),
      email: clean(c.email),
      street: clean(a.street) || clean(c.street),
      city: clean(a.city) || clean(c.city),
      state: clean(a.state) || clean(c.state),
      postalCode: clean(a.postalCode) || clean(c.postalCode),
    },
  };
}

// --------------------
// Main integration function
// --------------------
async function getKundendatenForStage(stageId = 'C72:UC_YOESDE') {
  const deals = await listDealsByStage(stageId);

  // Deduplicate by contactId (important if multiple deals share same contact)
  const contactIds = [...new Set(deals.map(d => clean(d.contactId)).filter(Boolean))];

  // Tune concurrency to avoid QUERY_LIMIT_EXCEEDED
  const CONCURRENCY = 3;

  // 1) Fetch contacts
  const contactResults = await mapLimit(contactIds, CONCURRENCY, async (contactId) => {
    try {
      const contact = await getContact(contactId);
      return mapContactToNormalized(contact);
    } catch (e) {
      return {
        contactId: clean(contactId),
        contact: {
          bitrixContactId: clean(contactId),
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          street: '',
          city: '',
          state: '',
          postalCode: '',
        },
        _contactError: String(e.message || e),
      };
    }
  });

  // 2) Fetch requisites + addresses per contact
  const addressResultsNested = await mapLimit(contactIds, CONCURRENCY, async (contactId) => {
    try {
      const requisites = await listRequisitesByContact(contactId);

      if (!requisites.length) {
        return [{
          contactId: clean(contactId),
          address: { street: '', city: '', state: '', postalCode: '' },
        }];
      }

      // Fetch addresses for all requisites of this contact
      const addressSets = await mapLimit(requisites, 2, async (req) => {
        const rows = await listAddressesByRequisiteId(req.ID);
        return rows.map(mapBitrixAddressRow);
      });

      const flattened = addressSets.flat();

      // Prefer TYPE_ID=1 if present (primary address), else first
      // (Your sample shows TYPE_ID "1")
      if (!flattened.length) {
        return [{
          contactId: clean(contactId),
          address: { street: '', city: '', state: '', postalCode: '' },
        }];
      }

      // Keep first non-empty address row; you can make this smarter later
      return [flattened.find(x =>
        x.address?.street || x.address?.city || x.address?.postalCode
      ) || flattened[0]];
    } catch (e) {
      return [{
        contactId: clean(contactId),
        address: { street: '', city: '', state: '', postalCode: '' },
        _addressError: String(e.message || e),
      }];
    }
  });

  const addressResults = addressResultsNested.flat();

  // 3) Merge by contactId
  const contactMap = new Map(contactResults.map(x => [clean(x.contactId), x]));
  const addressMap = new Map(addressResults.map(x => [clean(x.contactId), x]));

  const mergedByContactId = contactIds.map(contactId => {
    const c = contactMap.get(clean(contactId)) || { contactId: clean(contactId), contact: {} };
    const a = addressMap.get(clean(contactId)) || { contactId: clean(contactId), address: {} };

    return {
      contactId: clean(contactId),
      contact: c.contact || {},
      address: a.address || {},
      _contactError: c._contactError,
      _addressError: a._addressError,
    };
  });

  // 4) Optional: map back to deals (if you need one output per deal, not per contact)
  const byContactKundendaten = new Map(
    mergedByContactId.map(x => [x.contactId, buildKundendaten(x)])
  );

  const outputPerDeal = deals.map(deal => ({
    dealId: clean(deal.id),
    title: clean(deal.title),
    stageId: clean(deal.stageId),
    createdTime: clean(deal.createdTime),
    contactId: clean(deal.contactId),
    ...(byContactKundendaten.get(clean(deal.contactId)) || { Kundendaten: {} }),
  }));

  return outputPerDeal;
}

export {
  getKundendatenForStage,
  parseStreetLine,
  stripCountrySuffix,
  normalizePostalCode,
};