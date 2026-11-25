// U-073: a deal that has an offer in the React app (a draft, 1..n variants), opened from the
// Hauptmenü — from an appointment (offer picker, the deal's own type) or by its number — shows ONE
// overview before anything opens (DealOverview.tsx, both entry points):
//  - its variants (GET /api/deals/:dealId/variants): name, offer type, status („Entwurf“, „Gesendet
//    am …“, „Unterschrieben“, „Nicht gewählt“), offer number, last change; a tap opens that variant
//    (`?variante=<id>`), the variant opened last is marked;
//  - its stored Entwürfe/Angebote from the old app (GET /api/offers/v2/by-deal, U-063) — only those:
//    an offer row whose number any variant carries or carried (current number + its send records,
//    `numbers` of the list) IS that variant and is not listed again;
//  - „Neue Variante beginnen“: the existing variant creation (POST …/variants — a copy of a variant
//    without offer number and send status, a name the user may change; the server's refusals as in
//    the variant panel), then the new variant opens.
// A deal without a draft is unchanged (tiles / „Neues leeres Angebot“, U-063). The lookups run in
// parallel with the draft request and are waited for at most DEAL_DOCS_WAIT_MS after it answered;
// the variant list unknown (failed or slow) → exactly as before (U-063: the stored list with
// „Automatisch gespeicherten Stand öffnen“, or straight into the draft).
import type { DealVariant, HomeSearchRow } from "@oc/api-contract";
import { typeTitle, variantSearch, variantStatusText } from "../offer/index.js";
import { savedWhen } from "./search-rules.js";

export const OVERVIEW_TEXT = {
  title: "Varianten und Angebote",
  variants: "Varianten dieses Auftrags",
  stored: "Gespeicherte Entwürfe / Angebote aus der bisherigen Ansicht",
  lastOpened: "zuletzt geöffnet",
  newVariant: "Neue Variante beginnen",
  newLead: (from: string) => `Die neue Variante ist eine Kopie von „${from}“ – ohne Angebotsnummer und Versandstatus. Der Name ist nur intern sichtbar.`,
  from: "Kopie von",
  create: "Variante erstellen",
  creating: "Wird erstellt …",
  cancel: "Abbrechen",
  opening: "Wird geöffnet …",
  back: "Zurück",
} as const;

/** every offer number a variant carries or carried */
export const numbersOf = (v: Pick<DealVariant, "offerNumber" | "numbers">): string[] =>
  [v.offerNumber, ...(v.numbers ?? [])].map((n) => String(n ?? "").trim()).filter(Boolean);

/** the stored documents that are NOT one of the deal's variants (only the old app's own documents count) */
export function oldDocuments(rows: readonly HomeSearchRow[] | null | undefined, variants: readonly Pick<DealVariant, "offerNumber" | "numbers">[]): HomeSearchRow[] {
  const own = new Set(variants.flatMap(numbersOf));
  return (rows ?? []).filter((r) => !(r.kind === "offer" && own.has(String(r.offerNumber ?? "").trim())));
}

/** the sentence above the overview */
export function overviewIntro(dealId: string, variants: readonly Pick<DealVariant, "offerType">[], docs: number): string {
  const type = typeTitle(variants[0]?.offerType ?? "");
  const what = variants.length === 1 ? `ein Angebot ${type}` : `ein Angebot ${type} in ${variants.length} Varianten`;
  return `Zu Auftrag ${dealId} gibt es ${what}${docs ? " und gespeicherte Entwürfe oder Angebote aus der bisherigen Ansicht" : ""}. Tippen Sie auf eine Variante, um sie zu öffnen, oder beginnen Sie eine neue Variante.`;
}

export interface VariantRowView { name: string; badges: string[]; meta: string }
/** what a variant row shows */
export function variantRowView(v: DealVariant): VariantRowView {
  const changed = v.updatedAt && !Number.isNaN(new Date(v.updatedAt).getTime()) ? `zuletzt geändert ${savedWhen(v.updatedAt)}` : "";
  return {
    name: v.name,
    badges: [typeTitle(v.offerType), variantStatusText(v)],
    meta: [v.offerNumber, changed].filter(Boolean).join(" · "),
  };
}

/** the address of a variant in the React app */
export const variantPath = (dealId: string, v: Pick<DealVariant, "variantId" | "offerType">): string =>
  `/deal/${encodeURIComponent(dealId)}/${v.offerType}${variantSearch(v.variantId)}`;

/** the variant a new one is copied from by default: the one opened last, else the first */
export const defaultSource = (variants: readonly DealVariant[]): DealVariant | undefined => variants.find((v) => v.isDefault) ?? variants[0];
