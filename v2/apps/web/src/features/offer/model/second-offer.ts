// A second offer type for the same customer (ADR 027 B, step 2: the React app; UX-CHANGES U-046).
// From an open offer (or the planning) the user starts an offer of ANOTHER type for the same
// customer: the server creates a new Bitrix deal in „Neue Anfragen“ and a draft under it with the
// customer data copied. The rules here are pure; the screens are SecondOffer.tsx (dialog, button,
// relation list), VariantSwitch.tsx (header panel), the Versand page and the planning picker.
//
// Exactly once: one `creationId` per opened dialog. It is kept until success, or until the
// dialog is closed after a DEFINITE failure (nothing was created). While the outcome is open
// (unclear, deal created but draft not saved, still running, no answer) it is also kept on the
// device for the source deal, so closing and reopening the dialog continues the same creation
// instead of starting a second one. The server answers a repeat of the same id from its record.
import { CREATION_ID_RE, type DealRelatedResponse, type DealRelation, type VariantStatus } from "@oc/api-contract";
import { SECOND_OFFER_TYPES, type NewOfferType, type SecondOfferType } from "@oc/domain";
import { ApiFailure } from "../../../shared/api/index.js";
import { OFFER_TITLES } from "../steps.js";

/** a new creation id: 32 hex characters (CREATION_ID_RE) */
export function newCreationId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** the types a second offer can be of: every type except the open one */
/** the types a „Weiteres Angebot“ can be (SECOND_OFFER_TYPES: not Winterdienst / Hausmeister-Service) */
export const otherTypes = (open: string): SecondOfferType[] => SECOND_OFFER_TYPES.filter((t) => t !== open);
export const typeTitle = (t: string): string => OFFER_TITLES[t as NewOfferType] ?? t;

/** one related deal as the screens show it; `status` undefined: not asked yet */
export interface RelatedRow { dealId: string; offerType: string; role: DealRelation["role"]; createdAt: string; status?: VariantStatus | null }
type WithStatus = DealRelatedResponse["related"][number];
/** the relations of the draft (no status) and of GET /related (with status), once per deal, oldest first */
export function mergeRelated(fromDraft: readonly DealRelation[], fromServer?: readonly WithStatus[] | null): RelatedRow[] {
  const out = new Map<string, RelatedRow>();
  const put = (r: DealRelation | WithStatus) => {
    const was = out.get(r.dealId);
    const status = "status" in r ? r.status : was?.status;
    out.set(r.dealId, { dealId: r.dealId, offerType: r.offerType, role: r.role, createdAt: String(r.createdAt), ...(status !== undefined ? { status } : {}) });
  };
  fromDraft.forEach(put);
  (fromServer ?? []).forEach(put);
  return [...out.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
/** the related deal of `type`, if there is one (the newest) */
export const relatedOfType = (rows: readonly RelatedRow[], type: string): RelatedRow | undefined => [...rows].reverse().find((r) => r.offerType === type);

/** „Entwurf“ / „Gesendet“ / „Unterschrieben“ / „Nicht gewählt“; nothing without a draft or before the status is known */
export function relatedStatusText(s: VariantStatus | null | undefined): string {
  switch (s) {
    case "draft": return "Entwurf";
    case "sent": return "Gesendet";
    case "signed": return "Unterschrieben";
    case "not-chosen": return "Nicht gewählt";
    default: return "";
  }
}

/** the customer as a sentence names them: „Erika Muster“ */
export const customerName = (kd: Record<string, unknown> | null | undefined): string =>
  [kd?.firstName, kd?.lastName].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ");

export const TEXT = {
  /** the entry (header panel, deal overview): it leads to both ways — „Angebotsart wechseln“ on this deal or a new deal (owner 2026-11-26) */
  button: "Andere Angebotsart / weiteres Angebot",
  tempReason: "Erst möglich, wenn das Angebot einem Bitrix-Auftrag zugeordnet ist.",
  title: "Weiteres Angebot für diesen Kunden",
  chooseLead: "Welche Angebotsart soll das weitere Angebot haben?",
  sameTypeHint: (t: string) => `Ein weiteres Angebot derselben Art (${t}) ist eine Variante.`,
  createVariant: "Variante erstellen",
  exists: (id: string) => `bereits vorhanden: Auftrag ${id}`,
  open: "Öffnen",
  createAnyway: "Trotzdem neu anlegen",
  confirmTitle: "Weiteres Angebot anlegen?",
  confirmDeal: (name: string) => `In Bitrix wird ein neuer Auftrag in „Neue Anfragen“ angelegt – für denselben Kunden${name ? ` (${name})` : ""}.`,
  confirmType: (t: string) => `Angebotsart: ${t}`,
  confirmAuto: "Titel und verantwortliche Person setzt Bitrix automatisch.",
  confirmCopy: "Die Kundendaten werden übernommen (Adresse, Kontakt, Pflegegrad, Kasse usw.). Produkte und Preise werden nicht übernommen.",
  confirmSource: (id: string) => `Das bisherige Angebot bleibt unverändert unter Auftrag ${id}.`,
  yes: "Ja, anlegen",
  cancel: "Abbrechen",
  back: "Zurück",
  close: "Schließen",
  creating: "Wird angelegt …",
  checking: "Wird in Bitrix geprüft …",
  offline: "Dafür wird eine Internetverbindung benötigt.",
  notSaved: (why: string) => `Es wurde nichts angelegt, weil das geöffnete Angebot nicht gespeichert werden konnte. ${why}`.trim(),
  created: (id: string) => `Neuer Auftrag ${id} in Bitrix angelegt.`,
  commentsFailed: "Der Hinweis in der Bitrix-Timeline konnte nicht geschrieben werden.",
  unclearTitle: "Nicht sicher, ob der Auftrag angelegt wurde",
  unclear: "Es ist nicht sicher, ob Bitrix den neuen Auftrag angelegt hat. „In Bitrix prüfen“ sucht den Auftrag zu genau dieser Anfrage und legt ihn nur an, wenn es ihn noch nicht gibt – es entsteht kein zweiter Auftrag.",
  checkBitrix: "In Bitrix prüfen",
  draftFailed: (id: string) => `Der Auftrag ${id} wurde in Bitrix angelegt, das Angebot dazu konnte aber nicht gespeichert werden. „Erneut versuchen“ speichert es – es wird kein weiterer Auftrag angelegt.`,
  retry: "Erneut versuchen",
  running: "Bitte kurz warten und erneut prüfen.",
  checkAgain: "Erneut prüfen",
  noAnswer: "Keine Antwort vom Server – ob der Auftrag angelegt wurde, ist nicht bekannt. „Erneut versuchen“ fragt mit derselben Anfrage nach; es entsteht kein zweiter Auftrag.",
  relatedTitle: "Weitere Angebote dieses Kunden",
  relatedDeal: (id: string) => `Auftrag ${id}`,
  relatedFailed: "Der Stand der weiteren Angebote konnte nicht geladen werden.",
  notSavedOpen: "Das Angebot wurde nicht gewechselt, weil das geöffnete Angebot nicht gespeichert werden konnte.",
  markerLabel: (n: number) => `${n} weitere${n === 1 ? "s" : ""} Angebot${n === 1 ? "" : "e"} dieses Kunden`,
  otherTypeNotice: (deal: string, has: string, asked: string) => `Auftrag ${deal} hat bereits ein Angebot ${has} – dieses wurde geöffnet. Ein Angebot ${asked} legen Sie über „Andere Angebotsart / weiteres Angebot“ an.`,
} as const;

/** what the dialog shows after a call that did not succeed, and which action it offers */
export type Outcome =
  /** SECOND_OFFER_UNCLEAR: only „In Bitrix prüfen“ (same id, checkBitrix) */
  | { kind: "unclear" }
  /** SECOND_OFFER_DRAFT_FAILED: the deal exists; „Erneut versuchen“ (same id) */
  | { kind: "draft-failed"; newDealId: string; message: string }
  /** SECOND_OFFER_RUNNING: „Erneut prüfen“ (same id) */
  | { kind: "running"; message: string }
  /** definite failure, nothing created, a retry is allowed (SECOND_OFFER_BITRIX_FAILED) — same id */
  | { kind: "retry"; message: string }
  /** no answer / an unexpected answer: the outcome is not known; a repeat with the same id is safe */
  | { kind: "no-answer"; message: string }
  /** definite refusal, nothing created, no retry (NO_CONTACT, SAME_TYPE, TEMP_DEAL, SOURCE_MISSING, TYPE_INVALID, ID_MISMATCH) */
  | { kind: "final"; message: string };

/** may the creation id be given up when the dialog closes after this outcome? */
export const isDefinite = (o: Outcome | null): boolean => !o || o.kind === "final" || o.kind === "retry";

/** a failed call in the dialog's terms */
export function outcomeOf(err: unknown): Outcome {
  if (!(err instanceof ApiFailure)) return { kind: "no-answer", message: TEXT.noAnswer };
  switch (err.code) {
    case "SECOND_OFFER_UNCLEAR": return { kind: "unclear" };
    case "SECOND_OFFER_DRAFT_FAILED": {
      const id = String(err.detail.newDealId ?? "");
      return { kind: "draft-failed", newDealId: id, message: id ? TEXT.draftFailed(id) : err.message };
    }
    case "SECOND_OFFER_RUNNING": return { kind: "running", message: err.message };
    case "SECOND_OFFER_BITRIX_FAILED": return { kind: "retry", message: err.message };
    case "SECOND_OFFER_NO_CONTACT": case "SECOND_OFFER_SAME_TYPE": case "SECOND_OFFER_TEMP_DEAL": case "SECOND_OFFER_SOURCE_MISSING":
    case "SECOND_OFFER_TYPE_INVALID": case "SECOND_OFFER_ID_MISMATCH": case "BAD_REQUEST":
      return { kind: "final", message: err.message };
    default:
      // no connection, a proxy error, an answer the app does not understand: the request may have
      // reached the server — the outcome is unknown, and a repeat with the same id is safe
      return { kind: "no-answer", message: err.status === 0 ? TEXT.noAnswer : `${err.message} ${TEXT.noAnswer}` };
  }
}

// ---- an open creation kept on the device (per source deal) ----
export interface Pending { creationId: string; sourceDealId: string; offerType: SecondOfferType; outcome: Outcome }
const KEY = (deal: string) => `oc.secondOffer.${deal}`;
export function readPending(deal: string): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY(deal)) ?? "null") as Pending | null;
    return p && CREATION_ID_RE.test(p.creationId) && p.sourceDealId === deal ? p : null;
  } catch { return null; }
}
export function keepPending(p: Pending): void { try { localStorage.setItem(KEY(p.sourceDealId), JSON.stringify(p)); } catch { /* private mode: kept while the dialog is open */ } }
export function dropPending(deal: string): void { try { localStorage.removeItem(KEY(deal)); } catch { /* ignore */ } }
