// Search/mapping helpers — VERBATIM copy of legacy src/routes/offers.js (helpers) and
// src/utils/searchRegex.js (main@4b6002a), with type annotations only. Behaviour proven by the
// contract test against the running legacy app.

const VARIANTS: Record<string, string> = {
  a: "aàáâãäå",
  c: "cç",
  e: "eèéêë",
  i: "iìíîï",
  n: "nñ",
  o: "oòóôõö",
  s: "sš",
  u: "uùúûü",
  y: "yýÿ",
};

export function foldName(value: any) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");
}

export function nameSearchRegex(q: any) {
  const body = foldName(String(q).trim())
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/[a-z]/gi, (c) => {
      const set = VARIANTS[c.toLowerCase()];
      return set ? `[${set}]` : c;
    });
  return new RegExp(body, "i");
}

export function normalizeValue(value: any) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

export function getByPath(obj: any, path: any) {
  return path.split('.').reduce((acc: any, key: any) => (acc == null ? undefined : acc[key]), obj);
}

export function scoreSearchResult(doc: any, rawQuery: any) {
  const q = String(rawQuery || '').trim();
  if (!q) return 0;

  const qLower = q.toLowerCase();
  const qDigits = q.replace(/\D/g, '');

  const values = {
    offerNumber: normalizeValue(doc.offerNumber),
    angNumber: normalizeValue(doc.angNumber),
    customerNumber: normalizeValue(doc.customerNumber),
    dealId: normalizeValue(doc.dealId),
    firstName: normalizeValue(doc.firstName),
    lastName: normalizeValue(doc.lastName),
    city: normalizeValue(doc.city),
    email: normalizeValue(doc.email),
    postalCode: normalizeValue(doc.postalCode),
    phone: normalizeValue(doc.phone),
    createdAt: normalizeValue(doc.createdAt),
    updatedAt: normalizeValue(doc.updatedAt)
  };

  let score = 0;

  const angCandidates = [values.offerNumber, values.angNumber, values.customerNumber].filter(Boolean);
  const dealCandidates = [values.dealId].filter(Boolean);
  const surnameCandidates = [values.lastName].filter(Boolean);
  const cityCandidates = [values.city].filter(Boolean);
  const otherCandidates = [
    values.firstName,
    values.email,
    values.postalCode,
    values.phone,
    values.createdAt,
    values.updatedAt
  ].filter(Boolean);

  for (const value of angCandidates) {
    const lower = value.toLowerCase();
    const digits = value.replace(/\D/g, '');
    if (lower === qLower) score += 1000;
    else if (lower.startsWith(qLower)) score += 700;
    else if (lower.includes(qLower)) score += 420;
    if (qDigits && digits && digits === qDigits) score += 850;
  }

  for (const value of dealCandidates) {
    const lower = value.toLowerCase();
    const digits = value.replace(/\D/g, '');
    if (lower === qLower) score += 920;
    else if (lower.startsWith(qLower)) score += 650;
    else if (lower.includes(qLower)) score += 380;
    if (qDigits && digits && digits === qDigits) score += 780;
  }

  for (const value of surnameCandidates) {
    const lower = value.toLowerCase();
    if (lower === qLower) score += 820;
    else if (lower.startsWith(qLower)) score += 560;
    else if (lower.includes(qLower)) score += 310;
  }

  for (const value of cityCandidates) {
    const lower = value.toLowerCase();
    if (lower === qLower) score += 540;
    else if (lower.startsWith(qLower)) score += 360;
    else if (lower.includes(qLower)) score += 210;
  }

  for (const value of otherCandidates) {
    const lower = value.toLowerCase();
    if (lower === qLower) score += 200;
    else if (lower.startsWith(qLower)) score += 120;
    else if (lower.includes(qLower)) score += 60;
  }

  if (values.firstName && values.lastName) {
    const fullName = `${values.firstName} ${values.lastName}`.trim().toLowerCase();
    if (fullName === qLower) score += 700;
    else if (fullName.includes(qLower)) score += 250;
  }

  return score;
}

export function mapSearchResult(doc: any, type: any, query: any) {
  const kundendaten = doc.payload?.Kundendaten || doc.kundendaten || {};

  const mapped = {
    ...doc,
    _type: type,
    id: doc._id,
    offerNumber: doc.offerNumber || doc.angNumber || doc.customerNumber || '',
    angNumber: doc.angNumber || doc.offerNumber || doc.customerNumber || '',
    customerNumber: doc.customerNumber || '',
    dealId: doc.dealId || kundendaten.dealId || doc.payload?.dealId || '',
    firstName: doc.firstName || kundendaten.firstName || '',
    lastName: doc.lastName || kundendaten.lastName || '',
    email: doc.email || kundendaten.email || '',
    city: doc.city || kundendaten.city || '',
    postalCode: doc.postalCode || kundendaten.postalCode || '',
    phone: doc.phone || kundendaten.phone || '',
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };

  mapped._score = scoreSearchResult(mapped, query);
  return mapped;
}

export function buildExternalSearchResult(doc: any) {
  const kind = doc._type === 'draft' ? 'draft' : 'offer';
  const title =
    [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim() ||
    doc.name ||
    doc.offerNumber ||
    doc.angNumber ||
    '';

  return {
    kind,
    id: doc.id || doc._id || '',
    title,
    offerType: doc.offerType || '',
    offerNumber: doc.offerNumber || '',
    angNumber: doc.angNumber || '',
    customerNumber: doc.customerNumber || '',
    dealId: doc.dealId || '',
    firstName: doc.firstName || '',
    lastName: doc.lastName || '',
    email: doc.email || '',
    city: doc.city || '',
    postalCode: doc.postalCode || '',
    phone: doc.phone || '',
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

// ===========================
// GLOBAL SEARCH across Drafts + Offers
// Must be above '/:offerNumber'
// ===========================
