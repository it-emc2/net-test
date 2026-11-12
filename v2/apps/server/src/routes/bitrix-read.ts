// Bitrix routes, part 1 (read + local audit logging). Ported 1:1 from legacy
// src/routes/bitrix.js; responses and OUTGOING Bitrix calls identical (contract test with a
// recording Bitrix stub). Writes to Bitrix (stage moves, timeline, uploads) follow in part 2.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { BitrixClient } from "../integrations/bitrix.js";
import { UserActionLog } from "../platform/models.js";

const OWNER_TYPE = { contact: 3, company: 4 };
const VERMIETER_FIELD = "UF_CRM_1791270927983";
const VERMIETER_VALUES: Record<string, { erforderlich: boolean; liegtVor: boolean | null }> = {
  "8540": { erforderlich: true, liegtVor: false },
  "8546": { erforderlich: true, liegtVor: true },
  "8542": { erforderlich: false, liegtVor: null },
};
const VERMIETER_FILE_FIELD = "UF_CRM_1741678430123";
const AUFTRAGSBESCHREIBUNG_FIELD = "UF_CRM_1711018687";

const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
// legacy error body was { error: err.message } with status 500 — message kept, v2 envelope
const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

function vermieterFromDeal(deal: any) {
  const result: { erforderlich: boolean | null; liegtVor: boolean | null } = { erforderlich: null, liegtVor: null };
  const fromField = VERMIETER_VALUES[String(deal[VERMIETER_FIELD] || "")];
  if (fromField) Object.assign(result, fromField);
  const files = deal[VERMIETER_FILE_FIELD];
  if (Array.isArray(files) ? files.length > 0 : !!files) result.liegtVor = true;
  if (result.erforderlich === null) {
    const text = String(deal[AUFTRAGSBESCHREIBUNG_FIELD] || "");
    const wohn = (text.match(/^\s*Wohnsituation:[ \t]*(.*)$/im)?.[1] || "").trim();
    if (/miet/i.test(wohn)) result.erforderlich = true;
    else if (/eigent/i.test(wohn)) result.erforderlich = false;
  }
  return result;
}

export function bitrixHelpers(bx: BitrixClient) {
  const getRequisiteIdForContact = async (contactId: unknown) => {
    const data = await bx.get("crm.requisite.list", {
      filter: { ENTITY_TYPE_ID: OWNER_TYPE.contact, ENTITY_ID: Number(contactId) }, select: ["ID"], order: { ID: "ASC" },
    });
    const arr = data.result;
    return Array.isArray(arr) && arr.length ? Number(arr[0].ID) : null;
  };
  const getAddressForRequisite = async (reqId: number) => {
    const data = await bx.get("crm.address.list", { filter: { ENTITY_TYPE_ID: 8, ENTITY_ID: Number(reqId) }, select: ["*"] });
    const arr = data.result;
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  };
  const patchContactAddressFromReq = (contact: any, reqAddr: any) => {
    const street = String(reqAddr?.ADDRESS_1 || "").trim();
    const zip = String(reqAddr?.POSTAL_CODE || "").trim();
    const city = String(reqAddr?.CITY || "").trim();
    if (street) contact.ADDRESS = street;
    if (zip) contact.ADDRESS_POSTAL_CODE = zip;
    if (city) contact.ADDRESS_CITY = city;
    return contact;
  };
  return { getRequisiteIdForContact, getAddressForRequisite, patchContactAddressFromReq };
}

/** Activity → minutes since local midnight (legacy uses the server's local time zone). */
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

export async function registerBitrixRead(app: FastifyInstance, bx: BitrixClient) {
  const { getRequisiteIdForContact, getAddressForRequisite, patchContactAddressFromReq } = bitrixHelpers(bx);

  app.get("/api/bitrix/contact/:id", async (req, reply) => {
    const id = String((req.params as { id: string }).id || "").trim();
    if (!id) return fail(req, reply, 400, "BAD_REQUEST", "id is required");
    try {
      const contactResp = await bx.get("crm.contact.get", { id });
      const contact = contactResp?.result;
      if (!contact) return fail(req, reply, 404, "NOT_FOUND", "Contact not found");
      const hasAnyAddress = !isEmpty(contact.ADDRESS) || !isEmpty(contact.ADDRESS_CITY) || !isEmpty(contact.ADDRESS_POSTAL_CODE);
      if (!hasAnyAddress) {
        const reqId = await getRequisiteIdForContact(contact.ID || id);
        if (reqId) {
          const reqAddr = await getAddressForRequisite(reqId);
          if (reqAddr) { patchContactAddressFromReq(contact, reqAddr); contactResp.__addressSource = `REQUISITE:${reqId}`; }
        }
      }
      return contactResp;
    } catch (err) {
      req.log.error({ err }, "bitrix contact lookup failed");
      return fail(req, reply, 500, "BITRIX_ERROR", (err as Error)?.message || String(err));
    }
  });

  app.get("/api/bitrix/contact/:id/deals", async (req, reply) => {
    const contactId = String((req.params as { id: string }).id || "").trim();
    if (!contactId) return fail(req, reply, 400, "BAD_REQUEST", "Missing contact id");
    try {
      const data = await bx.get("crm.deal.list", { filter: { CONTACT_ID: contactId }, select: ["ID", "TITLE"] });
      return { deals: (data?.result || []).map((d: any) => ({ id: String(d.ID), title: String(d.TITLE || "").trim() })) };
    } catch (err) {
      req.log.error({ err }, "bitrix contact deals failed");
      return fail(req, reply, 500, "BITRIX_ERROR", (err as Error)?.message || String(err));
    }
  });

  app.get("/api/bitrix/deal/:id", async (req, reply) => {
    const dealId = String((req.params as { id: string }).id || "").trim();
    if (!dealId) return fail(req, reply, 400, "BAD_REQUEST", "id is required");
    try {
      const dealResp = await bx.get("crm.deal.get", { id: dealId });
      const deal = dealResp?.result;
      if (!deal) return fail(req, reply, 404, "NOT_FOUND", "Deal not found");
      let contact: any = null;
      if (deal.CONTACT_ID) {
        const contactResp = await bx.get("crm.contact.get", { id: deal.CONTACT_ID });
        contact = contactResp?.result || null;
        if (contact) {
          const hasAnyAddress = !isEmpty(contact.ADDRESS) || !isEmpty(contact.ADDRESS_CITY) || !isEmpty(contact.ADDRESS_POSTAL_CODE);
          if (!hasAnyAddress) {
            const reqId = await getRequisiteIdForContact(contact.ID || deal.CONTACT_ID);
            if (reqId) { const reqAddr = await getAddressForRequisite(reqId); if (reqAddr) patchContactAddressFromReq(contact, reqAddr); }
          }
        }
      }
      return {
        deal: { id: Number(dealId), title: deal.TITLE || "", stageId: deal.STAGE_ID || "" },
        contact,
        vermieter: vermieterFromDeal(deal),
      };
    } catch (err) {
      req.log.error({ err }, "bitrix deal lookup failed");
      return fail(req, reply, 500, "BITRIX_ERROR", (err as Error)?.message || String(err));
    }
  });

  app.post("/api/bitrix/log-action", async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const event = String(b.event || "");
    if (!["termin_opened", "configurator_opened", "duschabtrennung_leaf_selected"].includes(event)) return fail(req, reply, 400, "BAD_REQUEST", "invalid event");
    try { await UserActionLog.create({ event, dealId: b.dealId, offerNumber: b.offerNumber, offerType: b.offerType }); }
    catch (e) { req.log.warn({ err: e }, "user action log failed"); }
    return { ok: true };
  });

  app.post("/api/bitrix/deal/:id/log-dialog-event", async (req, reply) => {
    const dealId = String((req.params as { id: string }).id || "").trim();
    const b = (req.body ?? {}) as Record<string, any>;
    const event = String(b.event || "");
    if (!dealId || !["move_dialog_shown", "move_dialog_dismissed"].includes(event)) return fail(req, reply, 400, "BAD_REQUEST", "invalid event");
    try { await UserActionLog.create({ event, dealId, offerNumber: b.offerNumber, offerType: b.offerType }); }
    catch (e) { req.log.warn({ err: e }, "dialog event log failed"); }
    return { ok: true };
  });

  const activityList = (from: string, to: string, typeId: number, select: string[]) =>
    bx.get("crm.activity.list", {
      filter: { ">=START_TIME": from, "<=START_TIME": to, TYPE_ID: typeId }, select, order: { START_TIME: "ASC" },
    }).catch(() => ({ result: [] }));

  app.get("/api/bitrix/activities/today", async () => {
    const now = new Date();
    const from = new Date(now); from.setHours(0, 0, 0, 0);
    const to = new Date(now); to.setHours(23, 59, 59, 999);
    const sel = ["ID", "SUBJECT", "START_TIME", "END_TIME", "OWNER_ID", "OWNER_TYPE_ID", "STATUS"];
    const [m, c] = await Promise.all([activityList(from.toISOString(), to.toISOString(), 3, sel), activityList(from.toISOString(), to.toISOString(), 1, sel)]);
    const byDealId: Record<string, unknown> = {};
    for (const act of [...(m.result || []), ...(c.result || [])]) {
      const ownerId = String(act.OWNER_ID || "");
      if (!ownerId) continue;
      const start = new Date(act.START_TIME);
      const end = act.END_TIME ? new Date(act.END_TIME) : null;
      byDealId[ownerId] = {
        startMinutes: isNaN(start.getTime()) ? null : minutesOf(start),
        endMinutes: end && !isNaN(end.getTime()) ? minutesOf(end) : null,
        startISO: isNaN(start.getTime()) ? null : start.toISOString(),
        endISO: end && !isNaN(end.getTime()) ? end.toISOString() : null,
      };
    }
    return { byDealId };
  });

  app.get("/api/bitrix/calendar/week", async () => {
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const [m, c] = await Promise.all([
      activityList(monday.toISOString(), sunday.toISOString(), 3, ["ID", "SUBJECT", "START_TIME", "END_TIME", "STATUS", "RESPONSIBLE_ID", "COMMUNICATIONS", "DESCRIPTION"]),
      activityList(monday.toISOString(), sunday.toISOString(), 1, ["ID", "SUBJECT", "START_TIME", "END_TIME", "STATUS", "RESPONSIBLE_ID", "COMMUNICATIONS"]),
    ]);
    const activities = [...(m.result || []), ...(c.result || [])]
      .sort((a: any, b: any) => new Date(a.START_TIME).getTime() - new Date(b.START_TIME).getTime());
    const dayInfo = (d: Date) => ({
      date: d.toLocaleDateString("sv-SE"),
      label: d.toLocaleDateString("de-DE", { weekday: "long" }),
      shortLabel: d.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "").slice(0, 2),
      dateLabel: d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      locked: false,
      customers: [] as any[],
    });
    const dayMap = new Map<string, ReturnType<typeof dayInfo>>();
    for (const act of activities) {
      const start = new Date(act.START_TIME);
      if (isNaN(start.getTime())) continue;
      const key = start.toLocaleDateString("sv-SE");
      if (!dayMap.has(key)) dayMap.set(key, dayInfo(start));
      const end = act.END_TIME ? new Date(act.END_TIME) : null;
      const comms = Array.isArray(act.COMMUNICATIONS) ? act.COMMUNICATIONS : [];
      const cancelled = String(act.STATUS) === "2";
      const completed = String(act.STATUS) === "1";
      dayMap.get(key)!.customers.push({
        id: String(act.ID),
        name: act.SUBJECT || "Termin",
        address: act.DESCRIPTION || "",
        email: comms.map((x: any) => x.EMAIL || "").find(Boolean) || "",
        phone: comms.map((x: any) => x.VALUE || x.PHONE || "").find(Boolean) || "",
        locked: !cancelled && !completed,
        lockedSlot: null,
        cancelled,
        duration: end && !isNaN(end.getTime()) ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000)) : 0,
        manualStartMinutes: minutesOf(start),
        priority: "medium",
        _type: Number(act.TYPE_ID) === 1 ? "call" : "meeting",
      });
    }
    const days = [];
    const cursor = new Date(monday);
    for (let i = 0; i < 5; i++) {
      days.push(dayMap.get(cursor.toLocaleDateString("sv-SE")) ?? dayInfo(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return { planning: { days } };
  });
}
