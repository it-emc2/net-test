// Checkliste (Badumbau) — the rules of today's UI (src/public/checkliste.js; reference:
// test/fixtures/checkliste.json, v2/scripts/capture-checkliste.cjs):
//  - four required items in two groups. Two follow from the offer and cannot be ticked by hand:
//    the Angebotscheck has nothing missing (yellow rows are hints, not gaps), and the offer was
//    sent. Two are ticked by hand: Magicplan sketch and photos
//  - stored: `zusammenfassung.checkliste` { skizzeErstellt, fotosErstellt }
//  - an open required item is marked; the line on top counts what is done
import { check, STATUS_TEXT, type Price, type Status } from "../angebotscheck/rules.js";

type Fields = Record<string, unknown>;
export type BoxKey = "skizzeErstellt" | "fotosErstellt";
export interface Item { id: string; label: string; note: string; auto: boolean; checked: boolean; key?: BoxKey }
export interface Group { title: string; items: Item[] }
export interface View { groups: Group[]; done: number; total: number; complete: boolean; summary: string }

const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const MARK: Record<Status, string> = { gruen: "🟢", gelb: "🟡", rot: "🔴" };
const VERSAND_LABEL: Record<string, string> = { mail: "E-Mail", post: "Post" };

/** "Ja — Versendet per E-Mail am 16.11.2026 um 10:30 Uhr." or "Nein" */
export function sentText(versand: unknown): string {
  const v = obj(versand), art = VERSAND_LABEL[String(v.art ?? "")];
  if (!art || !v.versendetAm) return "Nein";
  const at = new Date(String(v.versendetAm));
  const when = Number.isNaN(at.getTime()) ? "" : ` am ${at.toLocaleDateString("de-DE")} um ${at.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
  return `Ja — Versendet per ${art}${when}.`;
}
export const isSent = (versand: unknown): boolean => { const v = obj(versand); return !!(v.art && v.versendetAm); };

/** What the checklist shows for an offer and its price. */
export function checklist(offer: Fields | null | undefined, price: Price | null | undefined): View {
  const zf = obj(obj(offer).zusammenfassung), boxes = obj(zf.checkliste), status = check(offer, price).status;
  const groups: Group[] = [
    { title: "1. Angebot", items: [
      { id: "check", label: "Angebotscheck ohne fehlende Punkte", note: `${MARK[status]} ${STATUS_TEXT[status]}`, auto: true, checked: status !== "rot" },
      { id: "versendet", label: "Angebot versendet", note: sentText(zf.versand), auto: true, checked: isSent(zf.versand) },
    ] },
    { title: "2. Aufmaß & Dokumentation", items: [
      { id: "skizze", label: "Magicplan Skizze erstellt", note: "", auto: false, checked: boxes.skizzeErstellt === true, key: "skizzeErstellt" },
      { id: "fotos", label: "Fotoaufnahmen erstellt", note: "", auto: false, checked: boxes.fotosErstellt === true, key: "fotosErstellt" },
    ] },
  ];
  const all = groups.flatMap((g) => g.items), done = all.filter((i) => i.checked).length, complete = done === all.length;
  return { groups, done, total: all.length, complete, summary: complete ? "✅ Alle Pflichtpunkte erledigt." : `${done} von ${all.length} Pflichtpunkten erledigt.` };
}

/** a box ticked or taken back → the new `zusammenfassung.checkliste` */
export function ticked(offer: Fields, key: BoxKey, on: boolean): Fields {
  const now = obj(obj(offer.zusammenfassung).checkliste);
  return { checkliste: { skizzeErstellt: now.skizzeErstellt === true, fotosErstellt: now.fotosErstellt === true, [key]: on } };
}
