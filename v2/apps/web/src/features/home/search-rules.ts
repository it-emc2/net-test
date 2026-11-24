// „Öffnen“ on the Hauptmenü: the search in stored drafts and offers, as today's UI
// (script.js initGlobalOfferSearchUI, renderGlobalOfferSearchResults, loadGlobalOfferSearchResult;
// ux.js P7-1; recorded in test/fixtures/home-entwurf.json):
//  - every key starts a 220 ms timer; then ONE search (no minimum length, up to 20 rows); an empty
//    field closes the list. Matching on the server (GET /api/offers/v2/search, today's search-all):
//    the text (accents folded, any case) inside one field — offer/customer/deal number, first or last
//    name, e-mail, phone, street, postcode, city, company, the request details; NOT a first + last name
//    together. Order: best match first (offer number > deal number > last name > city > others), then
//    the newest.
//  - while asking: „Suche läuft…“; nothing found: „Keine Treffer in Entwürfen oder Angeboten.“
//  - a row: title · badge „Entwurf“/„Angebot“ · badge type in capitals · bold reference (the offer
//    number, else the draft's id) · „ · “ · date and time (de-DE); the first row is active;
//    arrows move, Enter opens the active row, Escape closes the list; a deal number / ANG number +
//    Enter opens that deal / offer instead (P7-1).
//  - opening (React): a row of a type the React app has (bu, bwt, hl, bl, ah) becomes the draft of its
//    deal — the stored document is copied into it as a new version (POST …/draft/import). Without a
//    deal number: under a new temporary key. When the deal already has a draft that differs, the user
//    is asked first (open.ts). hms / wd: today's view.
import type { HomeSearchRow } from "@oc/api-contract";
import { isNewOfferType, type NewOfferType } from "@oc/domain";

export const TEXT = {
  label: "Öffnen",
  placeholder: "Name, Ort, Telefon, Angebots- oder Deal-Nummer",
  loading: "Suche läuft…",
  empty: "Keine Treffer in Entwürfen oder Angeboten.",
  failed: "Die Suche hat gerade nicht geklappt. Bitte versuchen Sie es erneut.",
  retry: "Erneut versuchen",
  draft: "Entwurf",
  offer: "Angebot",
  legacy: "In der bisherigen Ansicht öffnen",
  dealList: "Vorhandene Entwürfe / Angebote für diesen Deal",
  notFound: "Angebot wurde nicht gefunden.",
  openFailed: "Der Treffer konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.",
} as const;

/** today's date column: `new Date(…).toLocaleString("de-DE")` */
export const dateText = (iso: string | null): string => (iso ? new Date(iso).toLocaleString("de-DE") : "");

export interface RowView { title: string; badges: string[]; meta: string; snippet: string }
/** what a row shows, exactly today's texts */
export function rowView(r: HomeSearchRow): RowView {
  const date = dateText(r.at);
  return {
    title: r.title,
    badges: [r.kind === "draft" ? TEXT.draft : TEXT.offer, ...(r.offerType ? [r.offerType.toUpperCase()] : [])],
    meta: [r.ref, date].filter(Boolean).join(" · "),
    snippet: r.snippet,
  };
}

/** the offer type of a row in the React app, or null: it opens in today's view (hms, wd, unknown) */
export const reactTypeOf = (r: HomeSearchRow): NewOfferType | null => {
  const t = r.offerType.trim().toLowerCase();
  return isNewOfferType(t) ? t : null;
};

/** what a source is called in the question (today's import note: Entwurf „…“ / Angebot ANG…) */
export const sourceLabel = (r: HomeSearchRow): string => (r.kind === "draft" ? `Entwurf „${r.title}“` : `Angebot ${r.offerNumber}`);

/** key-order independent JSON of a stored state (a copy that is already the deal's draft is not asked about) */
export function sameState(a: unknown, b: unknown): boolean {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(a)) === JSON.stringify(sort(b));
}

/** the active row after an arrow key (today: clamps at both ends) */
export const moveActive = (active: number, key: "ArrowDown" | "ArrowUp", count: number): number =>
  key === "ArrowDown" ? Math.min(active + 1, count - 1) : Math.max(active - 1, 0);
