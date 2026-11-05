// Bitrix deal WRITES — port of the legacy helpers in src/routes/bitrix.js (updateDealStage,
// updateDealAfterSigning, addTimelineComment, ensurePartnerContact, setDealOfferLink, AH fields).
// Field ids, enum ids, stage ids and the exact request shapes are unchanged: the contract test
// records the outgoing calls of legacy and v2 against the same stub and requires them identical.
import type { BitrixClient } from "./bitrix.js";

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
const AH_FREQ: Record<string, number> = {
  "Wöchentlich": 52 / 12, "14-tägig": 26 / 12, "alle drei Wochen": 52 / 3 / 12, "Monatlich": 1,
  "Vierteljährlich": 4 / 12, "Halbjährlich": 2 / 12, "Jährlich": 1 / 12,
};
const AH_ANFAHRT_PER_EINSATZ = 7.96, AH_STUNDENSATZ_HND = 40.56, AH_STUNDENSATZ_AB = 53.04;
const AH_SERVICE_ORDER: Record<string, number> = { Haushaltsnahedienstleistungen: 0, Alltagsbegleitung: 1 };
const r2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function parseHHMM(str: unknown): number {
  if (!str) return 0;
  const s = String(str).trim();
  const i = s.indexOf(":");
  if (i !== -1) return (parseInt(s.slice(0, i), 10) || 0) + (parseInt(s.slice(i + 1), 10) || 0) / 60;
  return parseFloat(s) || 0;
}

export interface AhBitrix {
  zoneNum: number; hasHnD: boolean; hasAb: boolean; stundenProEinsatz: number; tatsaechlicherStundenumfang: number;
  regelmaessigkeit: string; monatlicherStundenumfang: number; anzahlAnfahrtspauschalen: number; anfahrtGesamt: number;
  gesamtpreisAB: number; gesamtpreisHnD: number; gesamtbetragAB: number; gesamtbetragHnD: number;
}

/** Exactly legacy buildAhData(body).AhBitrix — differential test: test/bitrix-deal.test.ts. */
export function ahBitrixFromPayload(body: any): AhBitrix {
  const ah = body?.ah || {};
  const raw: any[] = (Array.isArray(ah.services) ? ah.services : []).slice()
    .sort((a: any, b: any) => (AH_SERVICE_ORDER[a.type] ?? 99) - (AH_SERVICE_ORDER[b.type] ?? 99));
  const zoneNum = parseInt(body?.Arbeitszeit?.ahTravelZone || "0") || 0;
  const travelTimeH = zoneNum > 0 ? ((zoneNum - 1) * 10 + 10) / 60 : parseHHMM(body?.Arbeitszeit?.travelTimeHHMM || "");
  const svcTotals = (svc: any) => {
    let totalEinsaetze = 0, totalMonatlichH = 0;
    if (!svc) return { totalEinsaetze, totalMonatlichH };
    for (const sched of Array.isArray(svc.schedules) ? svc.schedules : []) {
      const dauerH = parseHHMM(sched.dauer);
      const freq = AH_FREQ[sched.regelmaessigkeit] || 0;
      if (!dauerH || !freq) continue;
      totalEinsaetze += freq;
      totalMonatlichH += (dauerH + travelTimeH) * freq;
    }
    return { totalEinsaetze, totalMonatlichH };
  };
  const hndSvc = raw.find((s) => s.type === "Haushaltsnahedienstleistungen");
  const abSvc = raw.find((s) => s.type === "Alltagsbegleitung");
  const hnd = svcTotals(hndSvc), ab = svcTotals(abSvc);
  const abShared = abSvc && abSvc.combinedVisit ? Math.min(hnd.totalEinsaetze, ab.totalEinsaetze) : 0;
  ab.totalMonatlichH = Math.max(0, ab.totalMonatlichH - abShared * travelTimeH);
  const abAnfahrtEinsaetze = ab.totalEinsaetze - abShared;
  const totalMonatlichH = (hnd.totalMonatlichH || 0) + (ab.totalMonatlichH || 0);
  const totalEinsaetze = (hnd.totalEinsaetze || 0) + abAnfahrtEinsaetze;
  const anfahrtTotal = r2(hnd.totalEinsaetze * AH_ANFAHRT_PER_EINSATZ);
  const leistungenTotal = r2(hnd.totalMonatlichH * AH_STUNDENSATZ_HND);
  const abAnfahrtTotal = r2(abAnfahrtEinsaetze * AH_ANFAHRT_PER_EINSATZ);
  const abLeistungenTotal = r2(ab.totalMonatlichH * AH_STUNDENSATZ_AB);
  const anfahrtGesamt = r2(anfahrtTotal + abAnfahrtTotal);
  const firstSched = (hndSvc?.schedules || []).find((s: any) => s.dauer) || (abSvc?.schedules || []).find((s: any) => s.dauer);
  return {
    zoneNum,
    hasHnD: raw.some((s) => s.type === "Haushaltsnahedienstleistungen"),
    hasAb: raw.some((s) => s.type === "Alltagsbegleitung"),
    stundenProEinsatz: firstSched ? parseHHMM(firstSched.dauer) : 0,
    tatsaechlicherStundenumfang: firstSched ? r2(parseHHMM(firstSched.dauer) + travelTimeH) : 0,
    regelmaessigkeit: firstSched?.regelmaessigkeit || "",
    monatlicherStundenumfang: r2(totalMonatlichH),
    anzahlAnfahrtspauschalen: r2(totalEinsaetze),
    anfahrtGesamt,
    gesamtpreisAB: abLeistungenTotal,
    gesamtpreisHnD: leistungenTotal,
    gesamtbetragAB: r2(abLeistungenTotal + anfahrtGesamt),
    gesamtbetragHnD: r2(leistungenTotal + anfahrtGesamt),
  };
}

/** Legacy buildAhBitrixFields: Anfahrtszone only filled once (never overwritten). */
export function buildAhBitrixFields(payload: unknown, currentZoneValue: unknown): Record<string, unknown> {
  const b = ahBitrixFromPayload(payload || {});
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
    if (!isAh && Number.isFinite(amount) && amount > 0) {
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

  async function updateDealAfterSigning(a: { dealId: unknown; customerType?: unknown; categoryId?: number; stageId?: string; selfPayAmount?: unknown }) {
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
    return bx.post("crm.item.update", { entityTypeId: DEAL_ENTITY_TYPE_ID, id: numericId, fields, useOriginalUfNames: "Y" });
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

  return { updateDealStage, updateDealAfterSigning, addTimelineComment, getDealContactId, ensurePartnerContact, setDealOfferLink };
}
export type DealWrites = ReturnType<typeof dealWrites>;
