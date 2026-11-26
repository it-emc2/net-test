// „Angebotsart wechseln“ (ADR 030, owner 2026-11-26): a deal opened as one offer type gets an offer
// of ANOTHER type on the SAME deal — a new variant of that type with the customer data copied by
// the rule of „Weiteres Angebot“ (@oc/domain offerWithCustomerData, the same function; the second
// offer differs only in the deal number). The source variant is not touched. No Bitrix call.
//
// Exactly once per `creationId` (client-generated, one per opened dialog): the new variant's id is
// derived from (deal, creationId) — `v-` + 12 hex of a SHA-256 — so the unique index
// `uniq_deal_variant {dealId, variantId}` makes the creation atomic without a claim collection or
// a new index. A repeat (double tap, retry after a lost answer) finds that variant and answers it
// (`repeated: true`); the same id for another type or source: TYPE_SWITCH_ID_MISMATCH.
//
// Refused: a temporary key (no deal yet), a type outside SECOND_OFFER_TYPES (the same list as
// „Weiteres Angebot“), the source's own type (that is a variant), a deal with a SIGNED offer
// (its other variants are "not chosen", ADR 027 A step 3: a new one would be born unchosen).
import { createHash } from "node:crypto";
import { ERROR_CODES, type ErrorCode, type TypeSwitchResponse } from "@oc/api-contract";
import { isSecondOfferType, OFFER_TYPE_TITLES, offerWithCustomerData, type SecondOfferType } from "@oc/domain";
import { contactFieldsOf, type SecondOfferDeps } from "./second-offer.js";
import { DealDraft, getDealDraft, liveVariants, publicVariantId, RevisionConflictError, saveDealDraft, TEMP_KEY, variantFilter } from "./store.js";
import { berlinToday, dealSignature, variantNameOf } from "./variants.js";

export class TypeSwitchError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message: string) { super(message); }
}
const M = {
  temp: "Das Angebot hat noch keine Deal-Nummer. Bitte speichern Sie es zuerst unter einem Bitrix-Auftrag.",
  typeInvalid: "Unbekannte Angebotsart.",
  sameType: "Das Angebot hat bereits diese Angebotsart. Für ein weiteres Angebot derselben Art legen Sie bitte eine Variante an.",
  noDraft: "Für diesen Auftrag gibt es noch keinen Entwurf.",
  noVariant: "Diese Variante gibt es nicht (mehr).",
  signed: "Zu diesem Auftrag ist bereits ein Angebot unterschrieben. Die Angebotsart kann auf diesem Auftrag nicht mehr gewechselt werden – bitte legen Sie das Angebot als neuen Auftrag an („Weiteres Angebot“).",
  mismatch: "Diese Anfrage-Kennung wurde bereits für ein anderes Angebot verwendet. Bitte laden Sie die Seite neu.",
  gone: "Die Variante aus dieser Anfrage wurde inzwischen gelöscht.",
};
const err = (code: ErrorCode, status: number, message: string) => new TypeSwitchError(code, status, message);

/** the id of the variant a creation id makes on a deal (deterministic: the exactly-once key) */
export const switchVariantId = (dealId: string, creationId: string): string =>
  `v-${createHash("sha256").update(`type-switch|${dealId}|${creationId}`).digest("hex").slice(0, 12)}`;

/** the default name of the new variant: the target type's title as the app shows it (editable like any variant name) */
export const switchVariantName = (t: SecondOfferType): string => OFFER_TYPE_TITLES[t];

export interface TypeSwitchInput { dealId: string; offerType: unknown; creationId: string; variantId?: string | undefined; by: string; user?: { email?: string } | undefined }
export interface TypeSwitchDeps {
  resolveContact?: SecondOfferDeps["resolveContact"];
  pricingRules?: (() => Record<string, unknown>) | undefined;
}

/** the answer for an existing variant of this creation id (a repeat) */
function repeatOf(doc: any, input: TypeSwitchInput, offerType: SecondOfferType): TypeSwitchResponse {
  const ts = doc.typeSwitch ?? {};
  if (ts.creationId !== input.creationId || doc.offerType !== offerType || (input.variantId && ts.fromVariantId !== input.variantId)) {
    throw err(ERROR_CODES.TYPE_SWITCH_ID_MISMATCH, 409, M.mismatch);
  }
  if (doc.deletedAt) throw err(ERROR_CODES.VARIANT_NOT_FOUND, 404, M.gone);
  return {
    ok: true, creationId: input.creationId, dealId: input.dealId, sourceVariantId: String(ts.fromVariantId), variantId: publicVariantId(doc),
    variantName: variantNameOf(doc), offerType, revision: doc.revision, repeated: true,
  };
}

export function typeSwitch(deps: TypeSwitchDeps) {
  async function run(input: TypeSwitchInput): Promise<TypeSwitchResponse> {
    const { dealId, creationId } = input;
    if (TEMP_KEY.test(dealId)) throw err(ERROR_CODES.TYPE_SWITCH_TEMP_DEAL, 409, M.temp);
    if (!isSecondOfferType(input.offerType)) throw err(ERROR_CODES.TYPE_SWITCH_TYPE_INVALID, 400, M.typeInvalid);
    const offerType = input.offerType;
    const newId = switchVariantId(dealId, creationId);
    const findMine = () => DealDraft.findOne(variantFilter(dealId, newId), { payload: 0 }).lean();

    // ---- an earlier request with this creation id ----
    const prior = await findMine();
    if (prior) return repeatOf(prior, input, offerType);

    // ---- check ----
    const variants = await liveVariants(dealId);
    if (!variants.length) throw err(ERROR_CODES.TYPE_SWITCH_SOURCE_MISSING, 404, M.noDraft);
    if (input.variantId && !variants.some((v) => publicVariantId(v) === input.variantId)) throw err(ERROR_CODES.TYPE_SWITCH_SOURCE_MISSING, 404, M.noVariant);
    const src: any = await getDealDraft(dealId, input.variantId);
    if (!src) throw err(ERROR_CODES.TYPE_SWITCH_SOURCE_MISSING, 404, M.noDraft);
    if (src.offerType === offerType) throw err(ERROR_CODES.TYPE_SWITCH_SAME_TYPE, 409, M.sameType);
    if (await dealSignature(dealId)) throw err(ERROR_CODES.TYPE_SWITCH_SIGNED, 409, M.signed);

    // ---- the new variant: the customer data only, by the rule of „Weiteres Angebot“ ----
    const kd = (src.payload?.Kundendaten ?? {}) as Record<string, unknown>;
    const today = berlinToday();
    const contact = await contactFieldsOf(deps.resolveContact, kd, input.user);
    const payload = offerWithCustomerData({ offerType, sourceKundendaten: kd, dealId, today, contact, pricingRules: deps.pricingRules?.() });
    const sourceVariantId = publicVariantId(src);
    const variantName = switchVariantName(offerType);
    let revision: number;
    try {
      const res = await saveDealDraft({
        dealId, variantId: newId, offerType, payload, baseRevision: 0, by: input.by, kind: "import",
        note: `Angebotsart gewechselt: ${OFFER_TYPE_TITLES[src.offerType as SecondOfferType] ?? src.offerType} → ${OFFER_TYPE_TITLES[offerType]} (Kundendaten aus „${variantNameOf(src)}“)`,
        create: {
          variantName, openedAt: new Date(),
          typeSwitch: { creationId, fromVariantId: sourceVariantId, fromOfferType: src.offerType, at: new Date() },
        },
      });
      revision = res.revision;
    } catch (e) {
      // the same creation id at the same moment (double tap): the other request made it
      if (e instanceof RevisionConflictError) {
        const mine = await findMine();
        if (mine) return repeatOf(mine, input, offerType);
      }
      throw e;
    }
    return { ok: true, creationId, dealId, sourceVariantId, variantId: newId, variantName, offerType, revision, repeated: false };
  }
  return { run };
}
