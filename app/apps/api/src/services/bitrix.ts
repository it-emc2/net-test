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

// Bitrix German honorific codes → salutation.
function salutationFrom(honorific: unknown): string {
  const h = String(honorific || "");
  if (/1|HERR/i.test(h)) return "Herr";
  if (/2|FRAU/i.test(h)) return "Frau";
  return "";
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

  const empty: DealPrefill = {
    salutation: "", firstName: "", lastName: "", email: "", phone: "",
    street: "", postalCode: "", city: "",
  };
  if (!contactId) {
    return { dealId: String(deal.ID), title: String(deal.TITLE || "").trim(), contactId: "", prefill: empty };
  }

  const contactResp = await bxGet("crm.contact.get", { id: contactId });
  const c = contactResp?.result || {};
  const prefill: DealPrefill = {
    salutation: salutationFrom(c.HONORIFIC),
    firstName: String(c.NAME || "").trim(),
    lastName: String(c.LAST_NAME || "").trim(),
    email: first(c.EMAIL),
    phone: first(c.PHONE),
    street: String(c.ADDRESS || "").trim(),
    postalCode: String(c.ADDRESS_POSTAL_CODE || "").trim(),
    city: String(c.ADDRESS_CITY || "").trim(),
  };

  if (isEmpty(prefill.street) && isEmpty(prefill.postalCode) && isEmpty(prefill.city)) {
    Object.assign(prefill, await addressFromRequisite(contactId));
  }

  return { dealId: String(deal.ID), title: String(deal.TITLE || "").trim(), contactId, prefill };
}
