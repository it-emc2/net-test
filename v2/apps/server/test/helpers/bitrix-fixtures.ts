// Canned Bitrix24 answers for the contract test. Synthetic data only (no real customers).
import type { Handler } from "./bitrix-stub.js";

const rateLimited = new Set<string>();
const todayAt = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };

const CONTACTS: Record<string, unknown> = {
  "101": { ID: "101", NAME: "Vorname0101", LAST_NAME: "Kunde0101", ADDRESS: "Teststr. 1", ADDRESS_CITY: "Ort1", ADDRESS_POSTAL_CODE: "10000" },
  "102": { ID: "102", NAME: "Vorname0102", LAST_NAME: "Kunde0102", ADDRESS: "", ADDRESS_CITY: null, ADDRESS_POSTAL_CODE: " " },
  "103": { ID: "103", NAME: "Vorname0103", LAST_NAME: "Kunde0103" },
};

const DEALS: Record<string, unknown> = {
  "9001": { ID: "9001", TITLE: "Badumbau Test", STAGE_ID: "C38:NEW", CONTACT_ID: "102", UF_CRM_1791270927983: "8540", UF_CRM_1741678430123: [{ id: 1 }] },
  "9002": { ID: "9002", TITLE: "Ohne Kontakt", STAGE_ID: "C52:NEW", CONTACT_ID: null, UF_CRM_1741678430123: [], UF_CRM_1711018687: "Kunde: x\nWohnsituation:  Mietwohnung\nEinverständnis des Vermieters: Eigentümer" },
  "9010": { ID: "9010", TITLE: "Upload", STAGE_ID: "C38:NEW", UF_CRM_1741678405915: [{ id: 11, showUrl: "/x/11" }, { name: "ohne id" }], OPPORTUNITY: "0", CURRENCY_ID: "" },
  "9011": { ID: "9011", TITLE: "BU", STAGE_ID: "C38:NEW", OPPORTUNITY: "4652.34", CURRENCY_ID: "EUR" },
  "9012": { ID: "9012", TITLE: "AH ohne Zone", STAGE_ID: "C52:NEW", UF_CRM_1711019971: "" },
  "9013": { ID: "9013", TITLE: "AH mit Zone", STAGE_ID: "C52:NEW", UF_CRM_1711019971: "1930" },
  "9004": { ID: "9004", TITLE: "Nach Rate-Limit", STAGE_ID: "C72:PREPARATION", CONTACT_ID: "101", UF_CRM_1791270927983: "8542" },
};

export const BITRIX_HANDLERS: Record<string, Handler> = {
  "crm.contact.get": (p) => {
    const id = p.get("id") ?? "";
    return CONTACTS[id] ? { result: structuredClone(CONTACTS[id]) } : { result: null };
  },
  "crm.requisite.list": (p) => ({ result: p.get("filter[ENTITY_ID]") === "102" ? [{ ID: "501" }] : [] }),
  "crm.address.list": (p) => ({ result: p.get("filter[ENTITY_ID]") === "501" ? [{ ADDRESS_1: " Reqstr. 5 ", POSTAL_CODE: "20000", CITY: "Ort2" }] : [] }),
  "crm.deal.list": () => ({ result: [{ ID: 7001, TITLE: "  Badumbau  " }, { ID: "7002", TITLE: null }] }),
  "crm.deal.get": (p, app) => {
    const id = p.get("id") ?? "";
    if (id === "9005") return { error: "ACCESS_DENIED", error_description: "Access denied" };
    if (id === "9004" && !rateLimited.has(app)) { rateLimited.add(app); return { error: "QUERY_LIMIT_EXCEEDED", error_description: "Too many requests" }; }
    return { result: DEALS[id] ?? null };
  },
  "crm.item.update": (p) => ({ result: { item: { id: Number(p.get("id")), stageId: p.get("fields[stageId]") } } }),
  "crm.timeline.comment.add": () => ({ result: 4711 }),
  "plan:/api/planning/termin-not-held": () => ({ found: true }),
  // onlinebrief24: a letter whose notice contains "FAIL" is rejected like the real API does
  "ob24:/printjobs": (_p, _app, raw) => {
    const letter = JSON.parse(raw || "{}").letter ?? {};
    if (String(letter.notice || "").includes("FAIL")) return { __status: 422, body: { status: 422, message: "Das PDF ist verschlüsselt oder liegt nicht im richtigen Format vor" } };
    return { status: 200, data: { id: 555001, status: "cart", items: [{ pages: 3, status: "cart" }] } };
  },
  "plan:/api/planning/current": () => ({ ok: true, days: [{ date: "2026-11-05", entries: [{ dealId: "9001", startMinutes: 600 }] }] }),
  "plan:/api/planning/stream": () => ({ __sse: ["event: plan\ndata: {\"v\":1}\n\n", "event: plan\ndata: {\"v\":2}\n\n"] }),
  // geocoders/routers: the display name echoes the query, so the postcode/city check passes
  "ext:photon/api/": (q) => {
    const text = q.get("q") ?? "";
    if (/Nirgendwo/.test(text)) return { features: [] };
    if (/Falschort/.test(text)) return { features: [{ geometry: { coordinates: [11.1, 49.4] }, properties: { name: "Ganz woanders", city: "Andersstadt" } }] };
    const coords = /OSRM/.test(text) ? [12.0, 50.0] : [11.9, 50.3];
    return { features: [{ geometry: { coordinates: coords }, properties: { name: text, country: "Deutschland" } }] };
  },
  "ext:ors/geocode/search": () => ({ features: [] }),
  "ext:ors/v2/directions/driving-car/geojson": (_q, _app, raw) => JSON.parse(raw || "{}").coordinates?.[1]?.[0] === 12.0
    ? { __status: 500, body: { error: "route not found" } }
    : { features: [{ properties: { summary: { distance: 12345.6, duration: 987.4 } } }] },
  "ext:osrm/route/v1/driving/11.9,50.3;12,50": () => ({ code: "Ok", routes: [{ distance: 20111, duration: 1500.6 }] }),
  "ext:nominatim/search": () => [],
  // today's customers (POST, form-encoded)
  "crm.item.list": (p) => p.get("filter[stageId]") === "C72:LEER" ? { result: { items: [] } } : { result: { items: [
    { id: 8001, title: "Termin A", stageId: "C72:UC_YOESDE", contactId: 101, createdTime: "2026-11-05T08:00:00+01:00", ufCrm_1711018687: "" },
    { id: 8002, title: "Termin B", stageId: "C72:UC_YOESDE", contactId: 102, createdTime: "2026-11-05T07:00:00+01:00", ufCrm_1711018687: "Name: Herr Vorname0102 Kunde0102\nMobil: 0000 222\nBedarfsort: 95028 Hof-DE\nPflegegrad: 3\nWohnsituation: Miete" },
    { id: 8003, title: "Termin C", stageId: "C72:UC_YOESDE", contactId: 103, createdTime: "2026-11-04T09:00:00+01:00", ufCrm_1711018687: "Anschrift: Musterweg 3 DE-95030 Ort3" },
    { id: 8004, title: "Ohne Kontakt", stageId: "C72:UC_YOESDE", contactId: null, createdTime: "2026-11-04T08:00:00+01:00" },
  ] } },
  "calendar.event.get": () => ({ result: [{ ID: "1", NAME: "Teamtermin", DATE_FROM: "05.11.2026 09:00:00" }] }),
  "ob24:/balance": () => ({ status: 200, data: { balance: 12.34, currency: "EUR" } }),
  "crm.activity.list": (p) => p.get("filter[TYPE_ID]") === "3"
    ? { result: [
        { ID: "1", SUBJECT: "Besichtigung", START_TIME: todayAt(10), END_TIME: todayAt(11, 30), OWNER_ID: "9001", STATUS: "0", TYPE_ID: "3", DESCRIPTION: "Teststr. 1", COMMUNICATIONS: [{ VALUE: "0000 111", EMAIL: "" }, { EMAIL: "kunde@test.local" }] },
        { ID: "2", SUBJECT: "", START_TIME: "kaputt", OWNER_ID: "9002", STATUS: "2", TYPE_ID: "3" },
      ] }
    : { result: [{ ID: "3", SUBJECT: "Rückruf", START_TIME: todayAt(8, 15), END_TIME: null, OWNER_ID: "", STATUS: "1", TYPE_ID: "1" }] },
};
