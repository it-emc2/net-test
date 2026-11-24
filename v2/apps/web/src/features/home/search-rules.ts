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
//    is asked first (open.ts).
//  - U-063: a deal opened from an appointment (offer picker) or by its number lists its stored drafts
//    and offers FIRST when it has any — before a new empty offer is started and also when the deal
//    already has an autosaved draft (which before hid them). The list waits for the lookup at most
//    DEAL_DOCS_WAIT_MS after the draft answered; failing or slow → the deal opens as before. An
//    offer row with the autosaved draft's own offer number does not count (it IS that draft).
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
  // U-063
  storedTitle: "Gespeicherte Entwürfe und Angebote",
  storedOr: "Oder ohne gespeichertes Dokument weiter:",
  back: "Zurück",
} as const;

/** how long a deal's opening waits for its stored drafts/offers after the draft answered (U-063) */
export const DEAL_DOCS_WAIT_MS = 1500;

/** the deal's autosaved draft as the texts name it */
export interface AutosavedInfo { offerType: string; updatedAt: string | Date; revision: number }
/** „23.11.2026, 10:15“ — the date of an autosaved state (as the question of U-057) */
export const savedWhen = (at: string | Date): string =>
  new Date(at).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
/** the button that continues with the autosaved draft (same words as U-057) */
export const autosavedButton = (d: AutosavedInfo): string => `Automatisch gespeicherten Stand öffnen (${savedWhen(d.updatedAt)}, Version ${d.revision})`;

/**
 * U-063: are there stored drafts/offers to show before the deal opens? `rows` null = unknown
 * (lookup failed or too slow) → no. An offer with the autosaved draft's own number is that draft.
 */
export function storedFirst(rows: readonly HomeSearchRow[] | null | undefined, draftOfferNumber = ""): boolean {
  const own = draftOfferNumber.trim();
  return !!rows?.some((r) => !(own && r.kind === "offer" && r.offerNumber === own));
}

/** the sentence above the list (U-063) */
export function storedIntro(dealId: string, draft: (AutosavedInfo & { title: string }) | null): string {
  return draft
    ? `Zu Auftrag ${dealId} gibt es einen automatisch gespeicherten Stand (${draft.title}, ${savedWhen(draft.updatedAt)}, Version ${draft.revision}) und gespeicherte Entwürfe oder Angebote. Öffnen Sie eines davon oder arbeiten Sie mit dem automatisch gespeicherten Stand weiter.`
    : `Zu Auftrag ${dealId} gibt es gespeicherte Entwürfe oder Angebote. Öffnen Sie eines davon oder beginnen Sie ein neues Angebot.`;
}

/** resolves with the answer, or null when it fails or takes longer than `ms` (never rejects) */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

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

/** the offer type of a row in the React app, or null: it opens in today's view (unknown types) */
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
