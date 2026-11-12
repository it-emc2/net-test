// Pure signing rules — ports of the helpers in legacy src/routes/signing.js and
// src/templates/signing-docs.js (resolveFields, hasPaymentChoice, required fields, labels,
// document set, status rollup). Differential test against legacy: test/signing-fields.test.ts.

export const DEFAULT_EXPIRY_DAYS = 56;
const OPTIONAL_DOCS = ["vollmacht", "abtretung"] as const;

export const DOC_LABELS: Record<string, string> = {
  angebot: "Angebot",
  vollmacht: "Vollmacht für die Krankenkasse",
  abtretung: "Abtretungserklärung",
  zusatzblatt: "Zusatzblatt – Wichtige Hinweise",
  abtretung_ah: "Abtretungserklärung § 45b SGB XI",
};

export const VOLLMACHT_REQUIRED_FIELDS: [string, string][] = [
  ["lastName", "Nachname"], ["firstName", "Vorname"], ["street", "Straße"], ["postalCode", "PLZ"], ["city", "Ort"],
  ["phone", "Telefon"], ["geburtsdatum", "Geburtsdatum"], ["kassenkundeName", "Krankenkasse"], ["kk_versichertennr", "KVNR"],
];
export const ABTRETUNG_REQUIRED_FIELDS: [string, string][] = [
  ["lastName", "Nachname"], ["firstName", "Vorname"], ["geburtsdatum", "Geburtstag"], ["kk_versichertennr", "Vers.-Nr."],
  ["street", "Straße"], ["postalCode", "PLZ"], ["city", "Ort"], ["phone", "Telefon"], ["pflegegrad", "Pflegegrad"],
  ["kk_pflegegradSeit", "Pflegegrad seit"], ["kassenkundeName", "Name der Pflegekasse"], ["kk_krankenkasseAdresse", "Adresse der Pflegekasse"],
];
export const REQUIRED_FIELDS_BY_KEY: Record<string, [string, string][]> = {
  vollmacht: VOLLMACHT_REQUIRED_FIELDS, abtretung: ABTRETUNG_REQUIRED_FIELDS, abtretung_ah: ABTRETUNG_REQUIRED_FIELDS,
};

export const isPartnerKey = (key: unknown) => /_p2$/.test(String(key || ""));
export const baseDocKey = (key: unknown) => String(key || "").replace(/_p2$/, "");

export interface SrLike {
  prefill?: any; payloadSnapshot?: any; documents?: any[]; offerType?: string; offerNumber?: string;
  status?: string; openedAt?: Date | null; completedAt?: Date | null; expiresAt?: Date | null;
}

export function isAhOffer(sr: { offerType?: unknown }) {
  const t = String(sr?.offerType || "").toLowerCase();
  return t === "ah" || t === "ah-alt";
}

export function resolveFields(sr: SrLike, doc: { key?: string; editedFields?: any }) {
  const p = sr.prefill || {};
  const k = sr.payloadSnapshot?.Kundendaten || {};
  const e = doc?.editedFields || {};
  const pick = (key: string, dflt: unknown) => (e[key] !== undefined ? e[key] : dflt);
  if (isPartnerKey(doc?.key)) {
    return {
      firstName: pick("firstName", k.partnerFirstName || ""), lastName: pick("lastName", k.partnerLastName || ""),
      street: pick("street", p.street || ""), postalCode: pick("postalCode", p.postalCode || ""), city: pick("city", p.city || ""),
      phone: pick("phone", p.phone || ""), email: pick("email", p.email || ""),
      geburtsdatum: pick("geburtsdatum", k.partnerGeburtsdatum || ""),
      kassenkundeName: pick("kassenkundeName", k.partnerKassenkundeName || ""),
      kk_versichertennr: pick("kk_versichertennr", k.partnerKvnr || ""),
      pflegegrad: pick("pflegegrad", String(k.partnerPflegegrad || "")),
      kk_pflegegradSeit: pick("kk_pflegegradSeit", k.partnerPflegegradSeit || ""),
      kk_krankenkasseAdresse: pick("kk_krankenkasseAdresse", k.partnerKrankenkasseAdresse || ""),
    } as Record<string, any>;
  }
  return {
    firstName: pick("firstName", p.firstName || ""), lastName: pick("lastName", p.lastName || ""),
    street: pick("street", p.street || ""), postalCode: pick("postalCode", p.postalCode || ""), city: pick("city", p.city || ""),
    phone: pick("phone", p.phone || ""), email: pick("email", p.email || ""),
    geburtsdatum: pick("geburtsdatum", p.geburtsdatum || ""),
    kassenkundeName: pick("kassenkundeName", k.kassenkundeName || ""),
    kk_versichertennr: pick("kk_versichertennr", k.kk_versichertennr || ""),
    pflegegrad: pick("pflegegrad", String(k.pflegegrad || "")),
    kk_pflegegradSeit: pick("kk_pflegegradSeit", k.kk_pflegegradSeit || ""),
    kk_krankenkasseAdresse: pick("kk_krankenkasseAdresse", k.kk_krankenkasseAdresse || ""),
    rechnungskopieArt: k.kk_rechnungskopie === "ja" ? k.kk_rechnungskopie_art || "post" : "",
  } as Record<string, any>;
}

/** SelfPayLines → radio options (legacy parsePayLines). */
export function parsePayLines(selfPayLines: unknown) {
  const lines = Array.isArray(selfPayLines) ? selfPayLines : [];
  let title = "";
  const options: string[] = [];
  const footer: string[] = [];
  for (const l of lines) {
    const t = String(l?.Text || "");
    if (l?.IsTitle) title = t;
    else if (/^[O☒]\s/.test(t)) options.push(t.replace(/^[O☒]\s+/, "").replace(/\s+oder\s*$/i, ""));
    else if ((l?.IsBullet || /^•\s/.test(t)) && options.length) options[options.length - 1] += (/:$/.test(options[options.length - 1]!) ? " " : ", ") + t.replace(/^•\s+/, "");
    else footer.push(t);
  }
  return { title, options, footer };
}
export const hasPaymentChoice = (selfPayLines: unknown) => parsePayLines(selfPayLines).options.length > 0;

export function hasPartner(payload: any) {
  const k = payload?.Kundendaten || {};
  return !!k.twoPersons && !!String(k.partnerFirstName || "").trim() && !!String(k.partnerLastName || "").trim();
}

/** "Vollmacht für die Krankenkasse – Person 2 (Name)" only on two-person requests. */
export function docLabel(sr: SrLike, key: string) {
  const base = DOC_LABELS[baseDocKey(key)] || key;
  if (!(sr.documents || []).some((d) => isPartnerKey(d.key))) return base;
  if (!["vollmacht", "abtretung"].includes(baseDocKey(key))) return base;
  const f = resolveFields(sr, { key });
  const name = `${f.firstName} ${f.lastName}`.trim();
  return `${base} – ${isPartnerKey(key) ? "Person 2" : "Person 1"}${name ? ` (${name})` : ""}`;
}

export function buildGreetingLine(prefill: any = {}) {
  const salutation = String(prefill.salutation || "").trim();
  const lastName = String(prefill.lastName || "").trim();
  if (salutation === "Herr" && lastName) return `Sehr geehrter Herr ${lastName},`;
  if (salutation === "Frau" && lastName) return `Sehr geehrte Frau ${lastName},`;
  if (salutation === "Familie" && lastName) return `Sehr geehrte Familie ${lastName},`;
  return "Sehr geehrte Damen und Herren,";
}

export function extractPrefill(payload: any = {}) {
  const k = payload?.Kundendaten || {};
  return {
    salutation: k.salutation || "", firstName: k.firstName || "", lastName: k.lastName || "", street: k.street || "",
    postalCode: k.postalCode || "", city: k.city || "", phone: k.phone || "", email: k.email || "",
    geburtsdatum: k.kk_geburtsdatum || k.ah_geburtsdatum || "",
  };
}

export function deriveCustomerType(payload: any = {}): "KASSE" | "SZ" {
  return String(payload?.Kundendaten?.payer || "").toLowerCase().includes("kasse") ? "KASSE" : "SZ";
}

export function deriveBitrixTarget({ dealId, contactId }: { dealId?: unknown; contactId?: unknown }) {
  const d = String(dealId || "").trim();
  const c = String(contactId || "").trim();
  if (d) return { bitrixEntityType: "deal", bitrixEntityId: d };
  if (c) return { bitrixEntityType: "contact", bitrixEntityId: c };
  return { bitrixEntityType: "", bitrixEntityId: "" };
}

/** AH: Angebot + Zusatzblatt (+ Abtretung §45b for Kasse). BU: Angebot + optional docs by payer/docSelection (+ partner set). */
export function docKeysFor(payload: any, offerType: unknown, customerType: "KASSE" | "SZ") {
  const t = String(offerType || payload?.activeOffer || "").toLowerCase();
  if (t === "ah" || t === "ah-alt") return customerType === "KASSE" ? ["angebot", "zusatzblatt", "abtretung_ah"] : ["angebot", "zusatzblatt"];
  const sel = payload?.docSelection || {};
  const chosen = OPTIONAL_DOCS.filter((key) => (customerType === "KASSE" ? sel[key] !== false : sel[key] === true));
  return ["angebot", ...chosen, ...(hasPartner(payload) ? chosen.map((key) => `${key}_p2`) : [])];
}

/** Legacy SigningRequest.methods.recomputeStatus (mutates). */
export function recomputeStatus(sr: SrLike) {
  if (sr.status === "expired") return sr.status;
  const docs = sr.documents || [];
  const signed = docs.filter((d) => d.status === "signed").length;
  if (signed === 0) sr.status = sr.openedAt ? "opened" : "sent";
  else if (signed < docs.length) sr.status = "partially_signed";
  else { sr.status = "completed"; if (!sr.completedAt) sr.completedAt = new Date(); }
  return sr.status;
}

export const isExpired = (sr: SrLike) => !!(sr.expiresAt && new Date(sr.expiresAt).getTime() < Date.now());

/** Payload copy with the customer's chosen payment term (so the Angebot ticks the right box). */
export function payloadWithPaymentChoice(sr: SrLike, doc?: { extraFields?: any } | null) {
  const payload = JSON.parse(JSON.stringify(sr.payloadSnapshot || {}));
  const idx = Number(doc?.extraFields?.paymentTermIdx);
  if (Number.isFinite(idx) && idx >= 0) {
    payload.Kundendaten = payload.Kundendaten || {};
    payload.Kundendaten.selectedPaymentTermIdx = idx;
  }
  return payload;
}
