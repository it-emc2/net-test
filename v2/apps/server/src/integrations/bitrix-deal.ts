// Bitrix deal WRITES — port of the legacy helpers in src/routes/bitrix.js (updateDealStage,
// updateDealAfterSigning, addTimelineComment, ensurePartnerContact, setDealOfferLink, AH fields).
// Field ids, enum ids, stage ids and the exact request shapes are unchanged: the contract test
// records the outgoing calls of legacy and v2 against the same stub and requires them identical.
import { ahDocHoursFor, ahDocServices, ahDocTravel, ahDocumentInput, ahOfferTotals, type AhZoneReading } from "@oc/pricing";
import { buildQS, type BitrixBatchResult, type BitrixClient } from "./bitrix.js";

export const DEAL_ENTITY_TYPE_ID = 2;
export const STAGES = {
  ANG_VERSCHICKT: { stageId: "C38:UC_2ZDNEZ", categoryId: 38 },
  AH_ANG_VERSCHICKT: { stageId: "C52:UC_SNAVG8", categoryId: 52 },
  ZUTEILEN: { stageId: "C72:PREPARATION", categoryId: 72 },
  BESICHTIGUNG: { stageId: "C72:UC_MXCAGT", categoryId: 72 },
  SIGNING_KASSE: { stageId: "C38:UC_ON3GS1", categoryId: 38 },
  SIGNING_SZ: { stageId: "C38:UC_5DII17", categoryId: 38 },
  AH_SIGNING: { stageId: "C52:UC_7NLTX7", categoryId: 52 },
} as const;

export const AH_FIELD = {
  ANFAHRTSZONE: "UF_CRM_1711019971",
  STUNDEN_PRO_EINSATZ: "UF_CRM_1711019061",
  ART_DER_LEISTUNG: "UF_CRM_1711017420",
  ANZAHL_ANFAHRTSPAUSCHALEN: "UF_CRM_1737548607",
  MONATLICHER_STUNDENUMFANG: "UF_CRM_1711092227",
  REGELMAESSIGKEIT: "UF_CRM_1711019214",
  GESAMTPREIS_AB: "UF_CRM_1737557386",
  GESAMTPREIS_ANFAHRT: "UF_CRM_1737557868",
  GESAMTBETRAG_AB: "UF_CRM_1737644914",
  GESAMTPREIS_HND: "UF_CRM_1738336465",
  GESAMTBETRAG_HND: "UF_CRM_1738336847",
  TATSAECHLICHER_STUNDENUMFANG: "UF_CRM_1711092423",
} as const;
const AH_ZONE_ENUM: Record<number, string> = { 1: "1928", 2: "1930", 3: "1932", 4: "1934", 5: "1936" };
const AH_LEISTUNG_ENUM = { hnd: "1862", ab: "4316" };
const AH_REGELMAESSIGKEIT_ENUM: Record<string, string> = {
  "Einmalig": "1904", "Wöchentlich": "1906", "14-tägig": "1908", "alle drei Wochen": "4526", "Monatlich": "1910",
  "Vierteljährlich": "1912", "Halbjährlich": "1914", "Jährlich": "4528", "Bei Bedarf": "4524",
};
const UMBAUTAGE_ENUM = { NICHT_ZUTREFFEND: "8436", HALF_DAY: "8444", ONE_DAY: "8438", TWO_DAYS: "8440", THREE_DAYS: "8442" };
const SIGNING_KASSE_FIELDS = {
  UF_CRM_1771944212969: "8396", UF_CRM_1771944969284: "8400", UF_CRM_1772533113350: "8412", UF_CRM_1772533223056: "8418",
};
export const INVOICE_COPY_ENUM: Record<string, string> = { post: "3080", email: "3078" };
export const OFFER_LINK_FIELD = "UF_CRM_1790772236055";
export const DEAL_UPLOADS: Record<string, { field: string; label: string; note: string }> = {
  kasse: { field: "UF_CRM_1741678405915", label: "Bestätigung der Kasse für Wohnumfeldverb. Maßnahmen", note: "Freigabe der Kasse" },
  vermieter: { field: "UF_CRM_1741678430123", label: "Bestätigung vom Vermieter für Umbauten", note: "Bestätigung des Vermieters" },
};

// ---------------- AH: numbers for the deal fields (legacy buildAhData().AhBitrix) ----------------
// Every amount from THE AH total function (ADR 028: @oc/pricing ahOfferTotals on the documents'
// reading of the offer, ahDocumentInput) — no own arithmetic; equal to the legacy numbers
// (differential test: test/bitrix-deal.test.ts). The deal fields do not depend on the payer.
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const NO_FUNDING_CONFIG = { entlastungsbetragMonat: 0, steuerabsetzPct: 20, steuerabsetzCapJahr: 4000 };

export interface AhBitrix {
  zoneNum: number; hasHnD: boolean; hasAb: boolean; stundenProEinsatz: number; tatsaechlicherStundenumfang: number;
  regelmaessigkeit: string; monatlicherStundenumfang: number; anzahlAnfahrtspauschalen: number; anfahrtGesamt: number;
  gesamtpreisAB: number; gesamtpreisHnD: number; gesamtbetragAB: number; gesamtbetragHnD: number;
}

/** Exactly legacy buildAhData(body).AhBitrix — differential test: test/bitrix-deal.test.ts.
 *  `reading`: the zone and services reading of the offer's documents (ADR 028 addendum 2026-11-23; the caller decides). */
export function ahBitrixFromPayload(body: any, reading: AhZoneReading = "document"): AhBitrix {
  const raw = ahDocServices(body, reading);
  const { zoneNum, travelTimeH } = ahDocTravel(body, reading);
  const p = ahOfferTotals(ahDocumentInput(body, NO_FUNDING_CONFIG, reading)).detail;
  const hndSvc = raw.find((s) => s.type === "Haushaltsnahedienstleistungen");
  const abSvc = raw.find((s) => s.type === "Alltagsbegleitung");
  const totalMonatlichH = (p.totalMonatlichH || 0) + (p.abTotalMonatlichH || 0);
  const totalEinsaetze = (p.totalEinsaetze || 0) + p.abAnfahrtEinsaetze;
  const anfahrtGesamt = r2(p.anfahrtTotal + p.abAnfahrtTotal);
  const firstSched = (hndSvc?.schedules || []).find((s: any) => s.dauer) || (abSvc?.schedules || []).find((s: any) => s.dauer);
  return {
    zoneNum,
    hasHnD: raw.some((s) => s.type === "Haushaltsnahedienstleistungen"),
    hasAb: raw.some((s) => s.type === "Alltagsbegleitung"),
    stundenProEinsatz: firstSched ? ahDocHoursFor(firstSched.dauer, reading) : 0,
    tatsaechlicherStundenumfang: firstSched ? r2(ahDocHoursFor(firstSched.dauer, reading) + travelTimeH) : 0,
    regelmaessigkeit: firstSched?.regelmaessigkeit || "",
    monatlicherStundenumfang: r2(totalMonatlichH),
    anzahlAnfahrtspauschalen: r2(totalEinsaetze),
    anfahrtGesamt,
    gesamtpreisAB: p.abLeistungenTotal,
    gesamtpreisHnD: p.leistungenTotal,
    gesamtbetragAB: r2(p.abLeistungenTotal + anfahrtGesamt),
    gesamtbetragHnD: r2(p.leistungenTotal + anfahrtGesamt),
  };
}

/** Legacy buildAhBitrixFields: Anfahrtszone only filled once (never overwritten). */
export function buildAhBitrixFields(payload: unknown, currentZoneValue: unknown, reading: AhZoneReading = "document"): Record<string, unknown> {
  const b = ahBitrixFromPayload(payload || {}, reading);
  const f: Record<string, unknown> = {};
  if (!currentZoneValue) {
    const zoneId = AH_ZONE_ENUM[Math.min(5, Math.max(0, Math.round(b.zoneNum)))];
    if (zoneId) f[AH_FIELD.ANFAHRTSZONE] = zoneId;
  }
  if (b.stundenProEinsatz > 0) f[AH_FIELD.STUNDEN_PRO_EINSATZ] = b.stundenProEinsatz;
  const leistung = [b.hasHnD ? AH_LEISTUNG_ENUM.hnd : null, b.hasAb ? AH_LEISTUNG_ENUM.ab : null].filter(Boolean);
  if (leistung.length) f[AH_FIELD.ART_DER_LEISTUNG] = leistung;
  if (b.anzahlAnfahrtspauschalen > 0) f[AH_FIELD.ANZAHL_ANFAHRTSPAUSCHALEN] = b.anzahlAnfahrtspauschalen;
  if (b.monatlicherStundenumfang > 0) f[AH_FIELD.MONATLICHER_STUNDENUMFANG] = b.monatlicherStundenumfang;
  const regel = AH_REGELMAESSIGKEIT_ENUM[b.regelmaessigkeit];
  if (regel) f[AH_FIELD.REGELMAESSIGKEIT] = regel;
  if (b.gesamtpreisAB > 0) f[AH_FIELD.GESAMTPREIS_AB] = b.gesamtpreisAB;
  if (b.gesamtpreisHnD > 0) f[AH_FIELD.GESAMTPREIS_HND] = b.gesamtpreisHnD;
  if (b.anfahrtGesamt > 0) f[AH_FIELD.GESAMTPREIS_ANFAHRT] = b.anfahrtGesamt;
  if (b.gesamtbetragAB > 0) f[AH_FIELD.GESAMTBETRAG_AB] = b.gesamtbetragAB;
  if (b.gesamtbetragHnD > 0) f[AH_FIELD.GESAMTBETRAG_HND] = b.gesamtbetragHnD;
  if (b.tatsaechlicherStundenumfang > 0) f[AH_FIELD.TATSAECHLICHER_STUNDENUMFANG] = b.tatsaechlicherStundenumfang;
  return f;
}

export function resolveUmbautageEnumId(workDays: unknown, offerType: unknown): string {
  const type = String(offerType || "").toLowerCase();
  if (type === "bwt" || type === "hl") return UMBAUTAGE_ENUM.HALF_DAY;
  switch (Math.round(Number(workDays) || 0)) {
    case 1: return UMBAUTAGE_ENUM.ONE_DAY;
    case 2: return UMBAUTAGE_ENUM.TWO_DAYS;
    case 3: return UMBAUTAGE_ENUM.THREE_DAYS;
    default: return UMBAUTAGE_ENUM.NICHT_ZUTREFFEND;
  }
}

export interface DealStageUpdate {
  dealId: unknown; stageId: string; categoryId?: unknown; opportunity?: unknown; currencyId?: unknown; workDays?: unknown;
  offerType?: unknown; offerNumber?: unknown; finalTotal?: unknown; selfPayAmount?: unknown; extraFields?: Record<string, unknown> | undefined;
}

export const buildInternalNoteComment = (note: unknown) => {
  const text = String(note ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 5000);
  return text ? `🔒 INTERNE NOTIZ (nicht für Kunden)\n\n${text}` : null;
};

/** the signed offer for the stage move after a signature (ADR 027 A, step 3) */
export interface SignedOffer {
  total?: number | null; offerNumber?: string; currencyId?: string;
  /** AH: the payload AS SENT gives the AH fields (buildAhBitrixFields); null = not available → left out */
  ah?: boolean; ahPayload?: unknown;
  /** AH: the zone and services reading of the offer's documents (ADR 028 addendum 2026-11-23); absent = "document" */
  ahZoneReading?: AhZoneReading;
}
/** At a signature the Anfahrtszone is never written: it is filled once, by the first „ANG verschickt“
 *  move, which reads the deal for it — reading it here would cost a second Bitrix call. */
const AH_ZONE_KEEP = "keep";

/** a NEW deal (ADR 027 B, a second offer type for the same customer) */
export interface NewDeal {
  categoryId: number; stageId: string; title: string; sourceId: string; contactId: number;
  /** external id of the creation: lets a later retry find a deal whose create answer was lost */
  originatorId: string; originId: string;
  /** user fields by their original names (UF_CRM_…) */
  ufFields: Record<string, unknown>;
}
/** the create call returned without an error but also without an id — the deal may exist (outcome unknown) */
export class DealCreateNoIdError extends Error { override name = "DealCreateNoIdError"; }

export function dealWrites(bx: BitrixClient, opts: { offerLinkBase: string }) {
  async function updateDealStage(u: DealStageUpdate) {
    const numericId = Number(u.dealId);
    if (!Number.isFinite(numericId) || numericId <= 0) throw new Error("dealId must be a positive number");
    if (!u.stageId || !String(u.stageId).trim()) throw new Error("stageId is required");
    const fields: Record<string, unknown> = {};
    if (u.categoryId !== undefined && u.categoryId !== null && String(u.categoryId) !== "") fields.categoryId = Number(u.categoryId);
    fields.stageId = String(u.stageId).trim();
    const isAh = String(u.offerType || "").toLowerCase() === "ah";
    const amount = Number(u.opportunity);
    // AH too since ADR 028 (owner 2026-11-20): the monthly amount (gross Selbstzahler / net Kasse)
    if (Number.isFinite(amount) && amount > 0) {
      fields.opportunity = amount;
      fields.isManualOpportunity = "Y";
      fields.currencyId = String(u.currencyId || "EUR").trim() || "EUR";
    }
    if (!isAh && (u.workDays !== undefined || u.offerType !== undefined)) fields.UF_CRM_1775019866756 = resolveUmbautageEnumId(u.workDays, u.offerType);
    const finalTotal = Number(u.finalTotal);
    if (!isAh && Number.isFinite(finalTotal) && finalTotal > 0) fields.UF_CRM_1768391021079 = finalTotal;
    if (!isAh && u.offerNumber && String(u.offerNumber).trim()) fields.UF_CRM_1776156870205 = String(u.offerNumber).trim();
    const selfPay = Number(u.selfPayAmount);
    if (!isAh && Number.isFinite(selfPay) && selfPay >= 0) fields.UF_CRM_1757490052931 = selfPay;
    if (u.extraFields) Object.assign(fields, u.extraFields);
    return bx.post("crm.item.update", { entityTypeId: DEAL_ENTITY_TYPE_ID, id: numericId, fields, useOriginalUfNames: "Y" });
  }

  /**
   * Stage move after a completed signature (legacy fields unchanged). `signedOffer` (ADR 027 A,
   * step 3; the caller passes it for non-AH deals only): the signed offer's sent total, its number
   * and its link go into the SAME update — the deal shows the signed offer, also an older variant.
   */
  async function updateDealAfterSigning(a: {
    dealId: unknown; customerType?: unknown; categoryId?: number; stageId?: string; selfPayAmount?: unknown;
    signedOffer?: SignedOffer | undefined;
  }) {
    const numericId = Number(a.dealId);
    if (!Number.isFinite(numericId) || numericId <= 0) throw new Error("dealId must be a positive number");
    const isKasse = String(a.customerType || "").toUpperCase() === "KASSE";
    const fields: Record<string, unknown> = {
      categoryId: a.categoryId ?? STAGES.SIGNING_KASSE.categoryId,
      stageId: a.stageId ?? (isKasse ? STAGES.SIGNING_KASSE.stageId : STAGES.SIGNING_SZ.stageId),
    };
    if (isKasse && a.categoryId === undefined) Object.assign(fields, SIGNING_KASSE_FIELDS);
    const selfPay = Number(a.selfPayAmount);
    if (isKasse && Number.isFinite(selfPay) && selfPay >= 0) fields.UF_CRM_1757490052931 = selfPay;
    if (a.signedOffer) Object.assign(fields, signedOfferFields(a.signedOffer));
    return bx.post("crm.item.update", { entityTypeId: DEAL_ENTITY_TYPE_ID, id: numericId, fields, useOriginalUfNames: "Y" });
  }

  /** amount (as „ANG verschickt“ writes it), final total, offer number and offer link of one offer;
   *  AH (owner 2026-11-20): the AH fields of the „ANG verschickt“ move + the link + (ADR 028) the deal
   *  amount as the move writes it (opportunity, manual, currency) — no final total, no number, as the move */
  function signedOfferFields(o: SignedOffer): Record<string, unknown> {
    const f: Record<string, unknown> = {};
    if (o.ah) {
      if (o.ahPayload) Object.assign(f, buildAhBitrixFields(o.ahPayload, AH_ZONE_KEEP, o.ahZoneReading));
      const amount = Number(o.total);
      if (Number.isFinite(amount) && amount > 0) {
        f.opportunity = amount;
        f.isManualOpportunity = "Y";
        f.currencyId = String(o.currencyId || "EUR").trim() || "EUR";
      }
      const n = String(o.offerNumber || "").trim();
      if (n) f[OFFER_LINK_FIELD] = `${opts.offerLinkBase}/?offer=${encodeURIComponent(n)}`;
      return f;
    }
    const total = Number(o.total);
    if (Number.isFinite(total) && total > 0) {
      f.opportunity = total;
      f.isManualOpportunity = "Y";
      f.currencyId = String(o.currencyId || "EUR").trim() || "EUR";
      f.UF_CRM_1768391021079 = total;
    }
    const n = String(o.offerNumber || "").trim();
    if (n) {
      f.UF_CRM_1776156870205 = n;
      f[OFFER_LINK_FIELD] = `${opts.offerLinkBase}/?offer=${encodeURIComponent(n)}`;
    }
    return f;
  }

  async function addTimelineComment(a: { entityType: string; entityId: unknown; comment: unknown; attachments?: unknown }) {
    const numericId = Number(a.entityId);
    if (!a.entityType) throw new Error("entityType is required");
    if (!Number.isFinite(numericId) || numericId <= 0) throw new Error("entityId must be a positive number");
    if (!a.comment || !String(a.comment).trim()) throw new Error("comment is required");
    const files = (Array.isArray(a.attachments) ? a.attachments : [])
      .map((i: any) => ({ filename: String(i?.filename || "").trim(), base64: String(i?.base64 || i?.content || "").trim() }))
      .filter((i) => i.filename && i.base64)
      .map((i) => [i.filename, i.base64]);
    const fields: Record<string, unknown> = { ENTITY_ID: numericId, ENTITY_TYPE: a.entityType, COMMENT: String(a.comment).trim() };
    if (files.length) fields.FILES = files;
    return bx.post("crm.timeline.comment.add", { fields });
  }

  async function getDealContactId(dealId: unknown) {
    const d = await bx.get("crm.deal.get", { id: Number(dealId) });
    const id = Number(d?.result?.CONTACT_ID);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /** Never modifies an existing contact; >1 candidate → ambiguous (a human decides). */
  async function ensurePartnerContact(p: { dealId?: unknown; firstName?: unknown; lastName?: unknown; postalCode?: unknown; city?: unknown; street?: unknown; phone?: unknown; email?: unknown }, log?: (m: string) => void) {
    const first = String(p.firstName || "").trim(), last = String(p.lastName || "").trim();
    if (!first || !last) throw new Error("partner first/last name required");
    const plz = String(p.postalCode || "").trim();
    const found = await bx.post("crm.contact.list", { filter: { NAME: first, LAST_NAME: last }, select: ["ID", "ADDRESS_POSTAL_CODE"] });
    const candidates = (Array.isArray(found?.result) ? found.result : []).filter((c: any) => {
      const cp = String(c.ADDRESS_POSTAL_CODE || "").trim();
      return !plz || !cp || cp === plz;
    });
    if (candidates.length > 1) return { ambiguous: true, candidates: candidates.map((c: any) => c.ID) };
    let contactId: number, created = false;
    if (candidates.length === 1) contactId = Number(candidates[0].ID);
    else {
      const fields = {
        NAME: first, LAST_NAME: last, OPENED: "Y",
        ...(p.phone ? { PHONE: [{ VALUE: String(p.phone), VALUE_TYPE: "WORK" }] } : {}),
        ...(p.email ? { EMAIL: [{ VALUE: String(p.email), VALUE_TYPE: "WORK" }] } : {}),
        ...(p.street ? { ADDRESS: String(p.street) } : {}),
        ...(plz ? { ADDRESS_POSTAL_CODE: plz } : {}),
        ...(p.city ? { ADDRESS_CITY: String(p.city) } : {}),
      };
      const added = await bx.post("crm.contact.add", { fields });
      contactId = Number(added?.result);
      if (!Number.isFinite(contactId) || contactId <= 0) throw new Error("crm.contact.add returned no id");
      created = true;
    }
    if (p.dealId) {
      try { await bx.post("crm.deal.contact.add", { id: Number(p.dealId), fields: { CONTACT_ID: contactId, IS_PRIMARY: "N" } }); }
      catch (err) { log?.(`deal.contact.add: ${(err as Error)?.message || err}`); } // already linked is fine
    }
    return { contactId, created };
  }

  /** Best-effort: never throws, so a Bitrix hiccup can't fail an offer send. */
  async function setDealOfferLink(dealId: unknown, offerNumber: unknown) {
    const id = String(dealId || "").trim(), n = String(offerNumber || "").trim();
    if (!id || !n) return { skipped: true };
    try {
      await bx.post("crm.deal.update", { id, fields: { [OFFER_LINK_FIELD]: `${opts.offerLinkBase}/?offer=${encodeURIComponent(n)}` } });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error)?.message || String(err) };
    }
  }

  /**
   * A NEW deal in ONE call (ADR 027 B): crm.item.add (entityTypeId 2, original UF names) sets pipeline,
   * stage, title, source, the contact, the external id and the user fields together; Bitrix runs the
   * automation rules of the stage after saving. No responsible person is sent (the stage's rule sets it).
   * Returns the new deal's id; an answer without one throws DealCreateNoIdError (outcome unknown).
   */
  async function createDeal(d: NewDeal): Promise<number> {
    if (!(Number.isInteger(d.contactId) && d.contactId > 0)) throw new Error("contactId must be a positive number");
    const fields: Record<string, unknown> = {
      categoryId: d.categoryId, stageId: d.stageId, title: d.title, sourceId: d.sourceId,
      contactId: d.contactId, contactIds: [d.contactId],
      originatorId: d.originatorId, originId: d.originId,
      ...d.ufFields,
    };
    const r = await bx.post("crm.item.add", { entityTypeId: DEAL_ENTITY_TYPE_ID, fields, useOriginalUfNames: "Y" });
    const id = Number(r?.result?.item?.id);
    if (!Number.isFinite(id) || id <= 0) throw new DealCreateNoIdError("crm.item.add returned no id");
    return id;
  }

  /** the deal made with this external id (originatorId + originId), or null — one crm.item.list call */
  async function findDealByOrigin(originatorId: string, originId: string): Promise<number | null> {
    const r = await bx.post("crm.item.list", { entityTypeId: DEAL_ENTITY_TYPE_ID, filter: { originatorId, originId }, select: ["id"] });
    const items: any[] = Array.isArray(r?.result?.items) ? r.result.items : [];
    const id = Number(items[0]?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /** several timeline notes on deals in ONE request (batch); per-note failures are in `result_error` */
  async function addTimelineComments(notes: { dealId: number; comment: string }[]): Promise<BitrixBatchResult> {
    const cmd: Record<string, string> = {};
    notes.forEach((n, i) => { cmd[`c${i}`] = `crm.timeline.comment.add?${buildQS({ fields: { ENTITY_ID: n.dealId, ENTITY_TYPE: "deal", COMMENT: n.comment } })}`; });
    return bx.batch(cmd);
  }

  /** a Bitrix task (main PR #321: "Neuen Link anfordern" on an expired signing link) */
  const addTask = (fields: Record<string, unknown>) => bx.post("tasks.task.add", { fields });
  return { updateDealStage, updateDealAfterSigning, addTimelineComment, getDealContactId, ensurePartnerContact, setDealOfferLink, addTask, createDeal, findDealByOrigin, addTimelineComments };
}
export type DealWrites = ReturnType<typeof dealWrites>;
