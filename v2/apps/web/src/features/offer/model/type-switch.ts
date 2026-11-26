// „Angebotsart wechseln“ (ADR 030, owner 2026-11-26): the same deal gets an offer of another type —
// a new variant of the deal with the customer data copied (the server applies the copy rule of
// „Weiteres Angebot“). The dialog of SecondOffer.tsx asks the type first, then HOW:
//  - „Auf diesem Deal (Angebotsart wechseln)“: POST /api/deals/:dealId/type-switch — no Bitrix call,
//    the open offer stays as its own variant; afterwards the new variant opens on its first step
//  - „Als neuer Deal (weiteres Angebot)“: today's path of ADR 027 B, unchanged
// Not on this deal when an offer of it is signed (its other variants are "not chosen"); the server
// refuses it too (TYPE_SWITCH_SIGNED).
//
// Exactly once: one `creationId` per opened dialog (the server derives the new variant's id from
// it, a repeat answers the same variant). Kept until success or a definite refusal; while the
// outcome is unknown (no answer) also on the device, so reopening the dialog continues it.
import { CREATION_ID_RE, type DealVariant } from "@oc/api-contract";
import { isNewOfferType, type SecondOfferType } from "@oc/domain";
import { ApiFailure } from "../../../shared/api/index.js";
import { firstStep } from "../steps.js";
import { variantSearch } from "./variants.js";

export type Way = "same-deal" | "new-deal";

export const SWITCH_TEXT = {
  howTitle: "Wo soll das Angebot entstehen?",
  howLead: (type: string) => `Angebotsart: ${type}`,
  sameDeal: "Auf diesem Deal (Angebotsart wechseln)",
  sameDealHint: (deal: string) => `Bleibt im Bitrix-Auftrag ${deal}: Das bisherige Angebot bleibt als eigene Variante erhalten, die neue Variante bekommt die Kundendaten. In Bitrix wird nichts angelegt.`,
  newDeal: "Als neuer Deal (weiteres Angebot)",
  newDealHint: "Legt in Bitrix einen neuen Auftrag in „Neue Anfragen“ an – für denselben Kunden, mit den Kundendaten. Beide Aufträge laufen danach getrennt.",
  signed: "Auf diesem Deal nicht möglich: Zu diesem Auftrag ist bereits ein Angebot unterschrieben. Legen Sie das Angebot bitte als neuen Deal an.",
  switching: "Wird angelegt …",
  switched: (name: string) => `Neue Variante „${name}“ auf diesem Auftrag angelegt – die Kundendaten sind übernommen.`,
  noAnswer: "Keine Antwort vom Server – ob die Variante angelegt wurde, ist nicht bekannt. „Erneut versuchen“ fragt mit derselben Anfrage nach; es entsteht keine zweite Variante.",
  retry: "Erneut versuchen",
  failedTitle: "Angebotsart nicht gewechselt",
} as const;

/** is an offer of this deal signed (as far as the list knows — the server checks again)? */
export const signedOnDeal = (variants: readonly Pick<DealVariant, "status">[] | null | undefined): boolean =>
  !!variants?.some((v) => v.status === "signed");

/** what the dialog shows after a switch that did not succeed */
export type SwitchOutcome =
  /** a refusal of the server (signed, same type, no draft …): its text, no retry */
  | { kind: "final"; message: string }
  /** no answer / an answer the app does not understand: a repeat with the same id is safe */
  | { kind: "no-answer"; message: string };

export function switchOutcomeOf(err: unknown): SwitchOutcome {
  if (err instanceof ApiFailure && err.status >= 400 && err.status < 500 && err.message) return { kind: "final", message: err.message };
  if (err instanceof ApiFailure && err.status !== 0) return { kind: "no-answer", message: `${err.message} ${SWITCH_TEXT.noAnswer}`.trim() };
  return { kind: "no-answer", message: SWITCH_TEXT.noAnswer };
}

/** where the new variant opens: its type, its first step, the variant in the address */
export function switchedPath(r: { dealId: string; offerType: string; variantId: string }): string {
  const step = isNewOfferType(r.offerType) ? `/${firstStep(r.offerType)}` : "";
  return `/deal/${encodeURIComponent(r.dealId)}/${r.offerType}${step}${variantSearch(r.variantId)}`;
}

// ---- an open switch kept on the device (per deal), while its outcome is unknown ----
export interface SwitchPending { creationId: string; dealId: string; offerType: SecondOfferType; message: string }
const KEY = (deal: string) => `oc.typeSwitch.${deal}`;
export function readSwitchPending(deal: string): SwitchPending | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY(deal)) ?? "null") as SwitchPending | null;
    return p && CREATION_ID_RE.test(p.creationId) && p.dealId === deal ? p : null;
  } catch { return null; }
}
export function keepSwitchPending(p: SwitchPending): void { try { localStorage.setItem(KEY(p.dealId), JSON.stringify(p)); } catch { /* private mode: kept while the dialog is open */ } }
export function dropSwitchPending(deal: string): void { try { localStorage.removeItem(KEY(deal)); } catch { /* ignore */ } }
