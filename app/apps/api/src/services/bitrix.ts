// Minimal Bitrix24 REST client (webhook-based) for the offer flow.
// The offer now BEGINS from a deal id (opened from Bitrix), so the first thing
// we need is: given a deal id, fetch the deal + its linked contact and map it
// to a Kundendaten prefill. Heavier Bitrix actions (timeline comment, stage
// move, signing comments) come in later phases.
import type { DealPrefill } from "@emc2/shared";
import { env } from "../config/env.js";

/** Encode params PHP-style (filter[X]=y, select[]=z) as Bitrix expects. */
function toQuery(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v == null) continue;
    if (Array.isArray(v)) {
      v.forEach((item) => parts.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(String(item))}`));
    } else if (typeof v === "object") {
      parts.push(toQuery(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export function bitrixConfigured(): boolean {
  return Boolean(env.bitrixWebhookBase);
}

async function bxGet(method: string, params: Record<string, unknown> = {}): Promise<any> {
  if (!env.bitrixWebhookBase) throw new Error("BITRIX_WEBHOOK_BASE is not configured");
  const qs = toQuery(params);
  const url = `${env.bitrixWebhookBase}/${method}.json${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  const data: any = await res.json().catch(() => null);
  if (!data) throw new Error("Invalid JSON response from Bitrix");
  if (data.error) throw new Error(`Bitrix ${method}: ${data.error_description || data.error}`);
  return data;
}

const first = (v: unknown): string =>
  Array.isArray(v) && v.length ? String((v[0] as any)?.VALUE ?? "").trim() : "";

const isEmpty = (v: unknown): boolean => v == null || String(v).trim() === "";

// Bitrix German honorific codes → salutation (explicit; avoids fuzzy matches).
function salutationFrom(honorific: unknown): string {
  const h = String(honorific || "").toUpperCase();
  if (h === "HNR_DE_1") return "Herr";
  if (h === "HNR_DE_2") return "Frau";
  return "";
}

// Deal custom fields (portal-specific enum ids) for the emc² pipeline.
const DEAL_ANREDE_UF = "UF_CRM_1721201238"; // 2578 Herr / 2576 Frau
const DEAL_PAYER_UF = "UF_CRM_1721204791"; // "Abrechnung über?"
const DEAL_PFLEGE_UF = "UF_CRM_1721202928"; // "Pflegestufe vorhanden?"
const PFLEGE_MAP: Record<string, string> = { "2654": "1", "2656": "2", "2658": "3", "2660": "4", "2662": "5" }; // 2652 = keine

function salutationFromDeal(deal: any): string {
  const v = String(deal?.[DEAL_ANREDE_UF] || "");
  if (v === "2578") return "Herr";
  if (v === "2576") return "Frau";
  return "";
}
function payerFromDeal(deal: any): string {
  const v = String(deal?.[DEAL_PAYER_UF] || "");
  if (v === "2780") return "Kassenkunde"; // Krankenkasse
  if (v === "2782" || v === "3074") return "Selbstzahler"; // Selbstzahler / Privat versichert
  return "";
}
function pflegegradFromDeal(deal: any): string {
  return PFLEGE_MAP[String(deal?.[DEAL_PFLEGE_UF] || "")] || "";
}

async function addressFromRequisite(contactId: string): Promise<Partial<DealPrefill>> {
  try {
    const reqList = await bxGet("crm.requisite.list", {
      filter: { ENTITY_TYPE_ID: 3, ENTITY_ID: Number(contactId) },
      select: ["ID"],
      order: { ID: "ASC" },
    });
    const reqId = reqList?.result?.[0]?.ID;
    if (!reqId) return {};
    const addrList = await bxGet("crm.address.list", {
      filter: { ENTITY_TYPE_ID: 8, ENTITY_ID: Number(reqId) },
      select: ["*"],
    });
    const a = addrList?.result?.[0];
    if (!a) return {};
    return {
      street: String(a.ADDRESS_1 || "").trim(),
      postalCode: String(a.POSTAL_CODE || "").trim(),
      city: String(a.CITY || "").trim(),
    };
  } catch {
    return {};
  }
}

export interface DealPrefillResult {
  dealId: string;
  title: string;
  contactId: string;
  prefill: DealPrefill;
}

/** Fetch a deal + its primary contact and map to a Kundendaten prefill. */
export async function getDealPrefill(dealId: string): Promise<DealPrefillResult> {
  const dealResp = await bxGet("crm.deal.get", { id: dealId });
  const deal = dealResp?.result;
  if (!deal) throw new Error("Deal not found");
  const contactId = String(deal.CONTACT_ID || "").trim();

  // Deal-level fields (payer / pflegegrad / Anrede) apply even without a contact.
  const dealPayer = payerFromDeal(deal);
  const dealPflege = pflegegradFromDeal(deal);
  const dealAnrede = salutationFromDeal(deal);

  const empty: DealPrefill = {
    salutation: dealAnrede, firstName: "", lastName: "", email: "", phone: "",
    street: "", postalCode: "", city: "", payer: dealPayer, pflegegrad: dealPflege,
  };
  if (!contactId) {
    return { dealId: String(deal.ID), title: String(deal.TITLE || "").trim(), contactId: "", prefill: empty };
  }

  const contactResp = await bxGet("crm.contact.get", { id: contactId });
  const c = contactResp?.result || {};
  const prefill: DealPrefill = {
    // Prefer the deal's Anrede field, else the contact honorific.
    salutation: dealAnrede || salutationFrom(c.HONORIFIC),
    firstName: String(c.NAME || "").trim(),
    lastName: String(c.LAST_NAME || "").trim(),
    email: first(c.EMAIL),
    phone: first(c.PHONE),
    street: String(c.ADDRESS || "").trim(),
    postalCode: String(c.ADDRESS_POSTAL_CODE || "").trim(),
    city: String(c.ADDRESS_CITY || "").trim(),
    payer: dealPayer,
    pflegegrad: dealPflege,
  };

  if (isEmpty(prefill.street) && isEmpty(prefill.postalCode) && isEmpty(prefill.city)) {
    Object.assign(prefill, await addressFromRequisite(contactId));
  }

  return { dealId: String(deal.ID), title: String(deal.TITLE || "").trim(), contactId, prefill };
}

function startMinutesOf(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
}

/** Today's Bitrix activities (meetings + calls) keyed by deal id (OWNER_ID). */
export async function getActivitiesToday(fromISO: string, toISO: string): Promise<Record<string, { startMinutes: number | null; endMinutes: number | null; startISO: string; endISO: string }>> {
  const select = ["ID", "SUBJECT", "START_TIME", "END_TIME", "OWNER_ID", "OWNER_TYPE_ID", "STATUS"];
  const query = (typeId: number) =>
    bxGet("crm.activity.list", { filter: { ">=START_TIME": fromISO, "<=START_TIME": toISO, TYPE_ID: typeId }, order: { START_TIME: "ASC" }, select });
  const [meetings, calls] = await Promise.all([query(3), query(1)]);
  const out: Record<string, { startMinutes: number | null; endMinutes: number | null; startISO: string; endISO: string }> = {};
  for (const a of [...(meetings?.result || []), ...(calls?.result || [])]) {
    const dealId = String(a.OWNER_ID || "").trim();
    if (!dealId) continue;
    out[dealId] = {
      startMinutes: startMinutesOf(a.START_TIME),
      endMinutes: startMinutesOf(a.END_TIME),
      startISO: a.START_TIME || "",
      endISO: a.END_TIME || "",
    };
  }
  return out;
}

/** Deals linked to a contact (for planning rows that carry only a contactId). */
export async function getContactDeals(contactId: string): Promise<{ id: string; title: string }[]> {
  const data = await bxGet("crm.deal.list", { filter: { CONTACT_ID: contactId }, select: ["ID", "TITLE"], order: { ID: "DESC" } });
  return (data?.result || []).map((d: any) => ({ id: String(d.ID), title: String(d.TITLE || "").trim() }));
}
