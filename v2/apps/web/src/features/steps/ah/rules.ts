// Alltagshilfe · Leistungen (UX-CHANGES U-048: a redesign of today's page, approved by the owner
// 2026-11-20). What is stored and how it is priced are exactly today's:
//  - stored (today's buildPayload / serialize(), src/public/script.js initAhServicesPage):
//    ah.ahServicesJson = JSON string of [all Alltagsbegleitung cards, then all Haushaltsnahe-
//    Dienstleistungen cards], each {type, schedules:[{dauer:"H:MM", regelmaessigkeit}], tasks:[ids],
//    combinedVisit} (combinedVisit = the "Gleicher Termin wie HnD" tick of the AB card; always false
//    for HnD, which has no such tick); ah.services = the same array parsed; ah.ahNote;
//    ah.ahEntlastungAuto = "on" while the budget tick is set, absent otherwise
//  - read back as today's restore does (restoreAh): ahServicesJson, else the old single service of
//    ah.ahArt; an empty type is an Alltagsbegleitung; the older format with the time rows inside
//    the task objects is read as ahInputFromPayload reads it (v2 fix of FINDINGS-AH #2)
//  - price: @oc/pricing computeAhPricing(ahInputFromPayload(offer)) — no formula here
//  - budget mode: @oc/pricing fitAhToBudget (today's ⚡ optimiser + the v2 fill step)
// Opening an offer writes nothing: the stored services change only when the user changes them —
// then in today's format (as today's page rewrites them on its first change, too).
import {
  AH_CONSTANTS, ahDauer, ahInputFromPayload, computeAhPricing, fitAhToBudget, parseDurationMinutes,
  type AhOfferTotals, type AhPricingInput, type AhPricingResult, type AhService,
} from "@oc/pricing";
import type { AhConfig } from "../../offer/index.js";

export const HND = "Haushaltsnahedienstleistungen";
export const AB = "Alltagsbegleitung";
export type Kind = "hnd" | "ab";
export const KINDS: readonly Kind[] = ["hnd", "ab"];
export const TYPE_OF: Record<Kind, string> = { hnd: HND, ab: AB };
/** today's section names (index.html "Haushaltsnahe Dienstleistungen", "Alltagsbegleitung") */
export const TITLE: Record<Kind, string> = { hnd: "Haushaltsnahe Dienstleistungen", ab: "Alltagsbegleitung" };
export const RATE: Record<Kind, number> = { hnd: AH_CONSTANTS.STUNDENSATZ_HND, ab: AH_CONSTANTS.STUNDENSATZ_AB };

/** today's ALLTAGSTASKS (HnD) and BEGLEITUNG_TASKS (AB): ids and labels unchanged */
export const TASKS: Record<Kind, readonly { id: string; label: string }[]> = {
  hnd: [
    { id: "wohnungsreinigung", label: "Wohnungsreinigung (Staubsaugen, Wischen, Bad, Küche)" },
    { id: "fensterputzen", label: "Fenster putzen" },
    { id: "waeschewaschen", label: "Wäsche waschen, aufhängen, bügeln" },
    { id: "einkaufen", label: "Einkaufen (Lebensmittel, Drogerie, Apotheke)" },
    { id: "kochen", label: "Kochen / Mahlzeiten zubereiten" },
    { id: "geschirrspuelen", label: "Geschirr spülen / Küche aufräumen" },
    { id: "muell", label: "Müll rausbringen / Mülltrennung" },
    { id: "waeschereinigung", label: "Wäsche zum Reinigungsdienst bringen/abholen" },
    { id: "post", label: "Post holen und sortieren" },
    { id: "haustiere", label: "Haustierversorgung (Füttern, Gassi gehen)" },
  ],
  ab: [
    { id: "arzttermine", label: "Begleitung zu Arztterminen" },
    { id: "behoerdengaenge", label: "Begleitung zu Behördengängen" },
    { id: "einkaufen_begl", label: "Begleitung zum Einkaufen (gemeinsam)" },
    { id: "spaziergaenge", label: "Spaziergänge / Bewegung an der frischen Luft" },
    { id: "gesellschaft", label: "Gesellschaft leisten / Gespräche führen" },
    { id: "vorlesen", label: "Vorlesen (Zeitung, Bücher)" },
    { id: "aktivitaeten", label: "Gemeinsame Aktivitäten (Spiele, Basteln, Kochen)" },
    { id: "gedaechtnis", label: "Gedächtnistraining / kognitive Aktivierung" },
    { id: "korrespondenz", label: "Unterstützung bei Korrespondenz (Briefe, Formulare)" },
    { id: "fahrdienste", label: "Fahrdienste (zum Friedhof, Friseur, Veranstaltungen)" },
    { id: "entlastung", label: "Entlastung pflegender Angehöriger (stundenweise Betreuung)" },
  ],
};

/** rhythm chips: stored value (today's select options) → label. "Einmalig" is not offered (priced 0 € today). */
export const RHYTHMS_MAIN: readonly (readonly [string, string])[] = [["Wöchentlich", "Wöchentlich"], ["14-tägig", "14-tägig"], ["alle drei Wochen", "Alle drei Wochen"], ["Monatlich", "Monatlich"]];
export const RHYTHMS_MORE: readonly (readonly [string, string])[] = [["Vierteljährlich", "Vierteljährlich"], ["Halbjährlich", "Halbjährlich"], ["Jährlich", "Jährlich"]];
export const isMoreRhythm = (r: string) => RHYTHMS_MORE.some(([v]) => v === r);
/** a stored rhythm that is not offered any more ("Einmalig") — shown as an extra chip so nothing is hidden */
export const isOtherRhythm = (r: string) => !!r && ![...RHYTHMS_MAIN, ...RHYTHMS_MORE].some(([v]) => v === r);

export const DAUER_STEP = 15, DAUER_MIN = 15, DAUER_MAX = 480;
/** "1:30" → "1:30 Std."; nothing → "–" */
export const dauerText = (dauer: string) => (parseDurationMinutes(dauer) ? `${dauer} Std.` : "–");
/** − / + : to the next 15-minute step, within 0:15–8:00 (a value off the 15-minute grid goes to the next grid value) */
export function stepDauer(dauer: string, dir: 1 | -1): string {
  const m = parseDurationMinutes(dauer);
  const next = dir > 0 ? Math.floor(m / DAUER_STEP) * DAUER_STEP + DAUER_STEP : Math.ceil(m / DAUER_STEP) * DAUER_STEP - DAUER_STEP;
  return ahDauer(Math.min(Math.max(DAUER_MAX, m), Math.max(DAUER_MIN, Math.min(next, DAUER_MAX))));
}
export const canStep = (dauer: string, dir: 1 | -1) => { const m = parseDurationMinutes(dauer); return dir > 0 ? m < DAUER_MAX : m > DAUER_MIN; };

// ---- stored services ----
export interface Row { dauer: string; regelmaessigkeit: string }
export interface Item { type: string; schedules: Row[]; tasks: string[]; combinedVisit: boolean }
type F = Record<string, any>;
const obj = (v: unknown): F => (v && typeof v === "object" ? (v as F) : {});

/** the services as today's restore reads them (ahServicesJson, else the old single service of ahArt) */
export function storedServices(ah: F): F[] {
  let services: unknown = null;
  if (ah.ahServicesJson) { try { services = JSON.parse(String(ah.ahServicesJson)); } catch { services = null; } }
  if (!Array.isArray(services) && ah.ahArt) {
    services = [{ type: ah.ahArt || "", einsatzUmfang: ah.ahEinsatzUmfang || "", monatUmfang: ah.ahMonatUmfang || "", regelmaessigkeit: ah.ahRegelmaessigkeit || "" }];
  }
  return Array.isArray(services) ? services.map(obj) : [];
}
const row = (r: unknown): Row => ({ dauer: String(obj(r).dauer ?? ""), regelmaessigkeit: String(obj(r).regelmaessigkeit ?? "") });
/** one stored service as the page shows it (today's createCard: schedules, else schedule, else one empty row) */
export function itemOf(s: F): Item {
  let tasks: unknown[] = Array.isArray(s.tasks) ? s.tasks : [];
  let rows: unknown[] = Array.isArray(s.schedules) && s.schedules.length ? s.schedules : s.schedule && (s.schedule.dauer || s.schedule.regelmaessigkeit) ? [s.schedule] : [];
  if (!rows.length && !s.schedules && !s.schedule) { // older format: time rows inside the task objects
    const nested = tasks.filter((t) => Array.isArray(obj(t).schedules));
    if (nested.length) { rows = nested.flatMap((t) => obj(t).schedules); tasks = tasks.map((t) => (t && typeof t === "object" ? obj(t).id : t)); }
  }
  return {
    type: String(s.type || AB),
    schedules: (rows.length ? rows : [{}]).map(row),
    tasks: tasks.filter((t): t is string => typeof t === "string"),
    combinedVisit: !!s.combinedVisit,
  };
}
export const kindOf = (type: string): Kind => (type === HND ? "hnd" : "ab");
export interface Items { hnd?: Item; ab?: Item; /** further cards of a type (old offers only) — kept as they are */ extra: Item[] }
export function itemsOf(ah: F): Items {
  const out: Items = { extra: [] };
  for (const s of storedServices(ah)) {
    const it = itemOf(s), k = kindOf(it.type);
    if (out[k]) out.extra.push(it); else out[k] = it;
  }
  return out;
}
/** in today's order: all Alltagsbegleitung cards, then all HnD cards; each with exactly today's keys */
export function serviceList(items: Items): Item[] {
  const all = [items.ab, items.hnd, ...items.extra].filter((x): x is Item => !!x);
  const clean = (it: Item): Item => ({ type: it.type, schedules: it.schedules.map((r) => ({ dauer: r.dauer, regelmaessigkeit: r.regelmaessigkeit })), tasks: [...it.tasks], combinedVisit: it.type === AB ? !!it.combinedVisit : false });
  return [...all.filter((x) => x.type !== HND), ...all.filter((x) => x.type === HND)].map(clean);
}
/** the stored fields for these services (string AND parsed array, as buildPayload stores them) */
export function servicesFields(items: Items): { ahServicesJson: string; services: Item[] } {
  const json = JSON.stringify(serviceList(items));
  return { ahServicesJson: json, services: JSON.parse(json) as Item[] };
}
/** a service as it is when it is ticked for the first time */
export const newItem = (kind: Kind): Item => ({ type: TYPE_OF[kind], schedules: [{ dauer: "1:00", regelmaessigkeit: "Wöchentlich" }], tasks: [], combinedVisit: false });
export const hasAnyService = (ah: F) => storedServices(ah).length > 0;
/** step status: done once one service has a time row with a duration and a rhythm */
export const hasContent = (ah: F) => storedServices(ah).some((s) => itemOf(s).schedules.some((r) => parseDurationMinutes(r.dauer) > 0 && !!r.regelmaessigkeit));

// ---- business settings, budget, price ----
const isOn = (v: unknown) => v === true || v === "on" || v === "true" || v === 1 || v === "1";
export const isSelbstzahler = (offer: F) => String(obj(offer.Kundendaten).payer || "Kassenkunde") === "Selbstzahler";
export const entlastungApplied = (offer: F) => isOn(obj(offer.Finanzierung).ahEntlastungsbetragNutzen);
/** what the Pflegekasse pays per month, per source (as ticked on Finanzierung) */
export interface BudgetParts { eb: number; vp: number; um: number }
const cents = (n: number) => Math.round(n * 100) / 100;
/**
 * The monthly budget — ALL sources ticked on Finanzierung (Entlastungsbetrag, × 2 for two persons;
 * Verhinderungspflege; Umwidmung), so the card says the same as the offer document's Eigenanteil —
 * or why there is none.
 */
export function budgetOf(offer: F, cfg: AhConfig): { budget: number | null; parts: BudgetParts; none?: "selbstzahler" | "nicht-angerechnet" } {
  if (isSelbstzahler(offer)) return { budget: null, parts: { eb: 0, vp: 0, um: 0 }, none: "selbstzahler" };
  const fin = obj(offer.Finanzierung);
  const parts: BudgetParts = {
    eb: entlastungApplied(offer) ? cfg.entlastungsbetragMonat * (isOn(obj(offer.Kundendaten).ahZweiPersonen) ? 2 : 1) : 0,
    vp: Math.max(0, Number(fin.ahVerhinderungspflegeMonat) || 0),
    um: isOn(fin.ahUmwidmungBeantragt) ? Math.max(0, Number(fin.ahUmwidmungBetrag) || 0) : 0,
  };
  const budget = cents(parts.eb + parts.vp + parts.um);
  return budget > 0 ? { budget, parts } : { budget: null, parts, none: "nicht-angerechnet" };
}
/** budget mode as stored */
export const autoStored = (offer: F) => obj(offer.ah).ahEntlastungAuto === "on";
/** the tick "Im Budget bleiben": stored "on" — or a new offer (no service yet, never set) where it starts on (U-048) */
export const autoShown = (offer: F, touched: boolean) => autoStored(offer) || (obj(offer.ah).ahEntlastungAuto === undefined && !touched && !hasAnyService(obj(offer.ah)) && !isSelbstzahler(offer));
/** budget mode is in force: ticked and there is a budget */
export const isActive = (offer: F, cfg: AhConfig) => autoStored(offer) && budgetOf(offer, cfg).budget !== null;

export const pricingInput = (offer: F, cfg: AhConfig): AhPricingInput => ahInputFromPayload(offer, cfg);
export const priceOf = (offer: F, cfg: AhConfig): AhPricingResult => computeAhPricing(pricingInput(offer, cfg));

/**
 * The summary of Leistungen AND Finanzierung (one function — both pages show the same block; ADR 028):
 *  - Kassenkunde (also no payer): „Leistungen und Anfahrt pro Monat“ net, one minus line per applied
 *    source (capped so the lines add up to the Eigenanteil; none for a source nothing is left for),
 *    „Eigenanteil pro Monat“; a note
 *    „Steuerlich absetzbar: etwa … pro Jahr“ (§ 35a, today's rule) or „Vollständig gedeckt“
 *  - Selbstzahler: net, „zzgl. 7 % MwSt.“, „Gesamt pro Monat“ gross
 *  - both: the Servicepauschale (HnD) as a note only, in today's words of the Kosten page
 */
export interface Summary {
  lines: { label: string; value: number; minus?: boolean }[];
  total: { label: string; value: number };
  notes: { kind: "steuer" | "gedeckt" | "pauschale"; text: string }[];
}
export const PAUSCHALE_NOTE = (amount: string) => `Separate Direktrechnung — nicht im Gesamtbetrag. Servicepauschale Reinigungsutensilien für HnD: ${amount} / Monat · inkl. MwSt. Jährliche Abrechnung, direkt mit dem Kunden.`;
export function summaryOf(t: AhOfferTotals, fmt: (n: number) => string): Summary {
  const notes: Summary["notes"] = [];
  const pauschale = () => { if (t.servicepauschaleNote.show) notes.push({ kind: "pauschale", text: PAUSCHALE_NOTE(fmt(t.servicepauschaleNote.amount)) }); };
  if (t.payer === "Selbstzahler") {
    pauschale();
    return { lines: [{ label: "Leistungen und Anfahrt pro Monat", value: t.net }, { label: "zzgl. 7 % MwSt.", value: t.vat }], total: { label: "Gesamt pro Monat", value: t.gross }, notes };
  }
  const lines: Summary["lines"] = [{ label: "Leistungen und Anfahrt pro Monat", value: t.net }];
  let rest = t.net;
  // a source that nothing is left for (the others already cover the total) gets no „− 0,00 €“ line
  const take = (label: string, amount: number) => { const v = Math.round(Math.min(amount, rest) * 100) / 100; if (amount > 0 && v > 0) { lines.push({ label, value: v, minus: true }); rest = Math.round((rest - v) * 100) / 100; } };
  take("Entlastungsbetrag", t.deductions.entlastungsbetrag);
  take("Verhinderungspflege", t.deductions.verhinderungspflege);
  take("Umwidmung", t.deductions.umwidmung);
  if (t.net > 0 && t.eigenanteil === 0) notes.push({ kind: "gedeckt", text: "Vollständig gedeckt" });
  else if (t.steuerabsetzJahr > 0) notes.push({ kind: "steuer", text: `Steuerlich absetzbar: etwa ${fmt(t.steuerabsetzJahr)} pro Jahr` });
  pauschale();
  return { lines, total: { label: "Eigenanteil pro Monat", value: t.eigenanteil }, notes };
}

// ---- budget mode: settle the durations after a change ----
/** base minutes per kind (the user's own durations; the ratio is kept between these) */
export type Base = Partial<Record<Kind, number[]>>;
const minutesOf = (it: Item | undefined) => (it ? it.schedules.map((r) => parseDurationMinutes(r.dauer)) : undefined);
export const baseOf = (items: Items): Base => ({ ...(items.hnd ? { hnd: minutesOf(items.hnd)! } : {}), ...(items.ab ? { ab: minutesOf(items.ab)! } : {}) });
const withMinutes = (it: Item, mins: number[] | undefined): Item => ({ ...it, schedules: it.schedules.map((r, j) => (mins?.[j] ? { ...r, dauer: ahDauer(mins[j]!) } : r)) });
const sameLength = (b: number[] | undefined, it: Item | undefined) => !!b && !!it && b.length === it.schedules.length;

/**
 * What the durations have to be after a change. Budget mode in force → fitted from the base;
 * budget mode just left (untick, Selbstzahler, no source applied) → back to the base.
 * Returns the stored fields to change (or null), the base to remember, whether it is in force, and
 * whether the services fit.
 */
export function settle(offer: F, base: Base | undefined, wasActive: boolean, cfg: AhConfig): { changes: ReturnType<typeof servicesFields> | null; base: Base; active: boolean; fits: boolean } {
  const items = itemsOf(obj(offer.ah));
  const active = isActive(offer, cfg);
  const kinds = KINDS.filter((k) => items[k]);
  const b: Base = {};
  for (const k of kinds) b[k] = sameLength(base?.[k], items[k]) ? base![k] : minutesOf(items[k]);
  let next: Items = items, fits = true;
  if (active && kinds.length) {
    const list = serviceList(items);
    const input = { ...pricingInput(offer, cfg), services: list as AhService[] };
    const r = fitAhToBudget(input, budgetOf(offer, cfg).budget!, list.map((s) => (s === list.find((x) => x.type === s.type) ? b[kindOf(s.type)] : undefined)));
    fits = r.fits;
    const fitted = r.services.map((s) => itemOf(s as F));
    next = { extra: items.extra };
    for (const k of kinds) next[k] = { ...items[k]!, schedules: fitted.find((x) => x.type === TYPE_OF[k])!.schedules };
    next.extra = fitted.filter((x, n) => fitted.findIndex((y) => y.type === x.type) !== n);
  } else if (!active && wasActive && base) {
    next = { extra: items.extra };
    for (const k of kinds) next[k] = withMinutes(items[k]!, b[k]);
  }
  const changed = JSON.stringify(serviceList(next)) !== JSON.stringify(serviceList(items));
  return { changes: changed ? servicesFields(next) : null, base: active ? b : baseOf(next), active, fits };
}

/** which inputs decide the durations in budget mode (a change of one of these re-fits) */
export function settleKey(offer: F, cfg: AhConfig): string {
  const p = pricingInput(offer, cfg);
  return JSON.stringify([obj(offer.ah).ahServicesJson ?? null, obj(offer.ah).ahArt ?? null, p.zone, p.payer, p.zweiPersonen, p.entlastungsbetragNutzen, p.verhinderungspflegeMonat, p.umwidmungBeantragt, p.umwidmungBetrag, autoStored(offer), cfg.entlastungsbetragMonat]);
}

