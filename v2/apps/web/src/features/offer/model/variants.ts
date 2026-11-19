// Variants of a deal's offer (ADR 027 A, step 2: the React app). A variant is a separate offer
// under the same deal — its own draft, number and sends. The rules here are pure; the screens
// are VariantSwitch.tsx (header) and the Versand page.
//
// Where the open variant lives:
//  - the store (`variantId`, `variantName`, `variantKnown`) — what is open now
//  - the address: `?variante=<id>` on /deal/:dealId/:type[/:step] (the path stays as before, so
//    every link and bookmark of a deal keeps working); an address without it opens the variant
//    the server opened last and then shows it
//  - the device snapshot: `oc.snapshot.<deal>` for the first variant (today's key, so snapshots
//    already on devices stay valid), `oc.snapshot.<deal>#<variantId>` for every other one
// Draft calls and sends name the variant once the server has named it (`variantKnown`); before
// that (a new offer, an older server) they act on the server's default — for a deal without
// variants that is the same draft, and the revision check refuses anything else.
import { FIRST_VARIANT_ID, type DealVariant } from "@oc/api-contract";
import { ApiFailure } from "../../../shared/api/index.js";

export const VARIANT_PARAM = "variante";
const SNAP = "oc.snapshot.";

/** the device snapshot's key: the first variant keeps today's key */
export const snapshotKey = (dealId: string, variantId: string | null | undefined): string =>
  !variantId || variantId === FIRST_VARIANT_ID ? SNAP + dealId : `${SNAP}${dealId}#${variantId}`;

/** the address part of a variant */
export const variantSearch = (variantId: string | null | undefined): string => (variantId ? `?${VARIANT_PARAM}=${encodeURIComponent(variantId)}` : "");
export const variantInSearch = (search: string): string | undefined => new URLSearchParams(search).get(VARIANT_PARAM) || undefined;

interface Open { dealId: string | null; variantId: string | null; variantKnown: boolean }
/** the query of a draft call: the variant, once the server named it */
export const variantQuery = (s: Open): string | undefined => (s.variantKnown && s.variantId ? `variant=${encodeURIComponent(s.variantId)}` : undefined);
/** the variant a send names: only when the server named it and the send goes to the deal the draft is saved under */
export const sendVariantOf = (s: Open, deal: string): string | undefined => (s.variantKnown && s.variantId && deal && deal === s.dealId ? s.variantId : undefined);

const day = (d: unknown): string => { const t = new Date(String(d ?? "")); return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); };
/** „Entwurf“, „Gesendet am TT.MM.JJJJ“, „Unterschrieben“, „Nicht gewählt“ */
export function statusText(v: Pick<DealVariant, "status" | "sentAt">): string {
  if (v.status === "signed") return "Unterschrieben";
  if (v.status === "not-chosen") return "Nicht gewählt";
  if (v.status === "sent") return day(v.sentAt) ? `Gesendet am ${day(v.sentAt)}` : "Gesendet";
  return "Entwurf";
}

/** the name a new variant gets when the user keeps the suggestion — the server's fallback rule
 *  („Variante N“, N = variants + 1, a name in use is skipped; the server also counts deleted ones) */
export function nextVariantName(variants: readonly Pick<DealVariant, "name">[]): string {
  const used = new Set(variants.map((v) => v.name));
  let n = Math.max(variants.length, 1) + 1;
  while (used.has(`Variante ${n}`)) n++;
  return `Variante ${n}`;
}

/** the variant a send belongs to: its `variantId`; an older record by its number, else the first variant (the server's rule) */
export function variantOfSend(send: Record<string, unknown>, variants: readonly DealVariant[]): DealVariant | undefined {
  const id = String(send.variantId ?? "");
  if (id) return variants.find((v) => v.variantId === id);
  const nr = String(send.offerNumber ?? "").trim();
  return (nr ? variants.find((v) => v.offerNumber && v.offerNumber === nr) : undefined) ?? variants.find((v) => v.variantId === FIRST_VARIANT_ID);
}

export const TEXT = {
  create: "Variante erstellen",
  creating: "Wird erstellt …",
  createTitle: "Neue Variante",
  createLead: "Die neue Variante ist eine Kopie der geöffneten – ohne Angebotsnummer und Versandstatus. Der Name ist nur intern sichtbar.",
  name: "Name der Variante",
  rename: "Umbenennen",
  renameTitle: "Variante umbenennen",
  remove: "Löschen",
  removeTitle: "Variante löschen?",
  removeText: (name: string) => `„${name}“ wird gelöscht. Eine versendete Variante kann nicht gelöscht werden.`,
  removeYes: "Ja, löschen",
  cancel: "Abbrechen",
  save: "Speichern",
  close: "Schließen",
  list: "Varianten",
  open: "geöffnet",
  notChosen: "Diese Variante wurde nicht gewählt.",
  notChosenNoSend: "Sie bleibt lesbar und kann Vorlage für eine neue Variante sein; versendet wird sie nicht.",
  listFailed: "Die Liste der Varianten konnte nicht geladen werden.",
  notSaved: "Die Variante wurde nicht gewechselt, weil das Angebot nicht gespeichert werden konnte.",
  notSavedCreate: "Die Variante wurde nicht erstellt, weil das Angebot nicht gespeichert werden konnte.",
  gone: "Diese Variante gibt es nicht mehr. Geöffnet ist die zuletzt bearbeitete.",
  sentRefused: "Eine versendete Variante kann nicht gelöscht werden.",
  lastRefused: "Die einzige Variante eines Auftrags kann nicht gelöscht werden.",
  created: "Variante erstellt",
  deleted: "Variante gelöscht",
  failed: "Das hat nicht geklappt.",
} as const;

/** a refusal of the server in the user's words (otherwise the server's own German message, the app's failure pattern) */
export function variantError(err: unknown): string {
  if (err instanceof ApiFailure) {
    if (err.code === "VARIANT_SENT") return TEXT.sentRefused;
    if (err.code === "VARIANT_LAST") return TEXT.lastRefused;
    return err.message;
  }
  return err instanceof Error && err.message ? err.message : TEXT.failed;
}
