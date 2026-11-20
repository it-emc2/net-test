// Deal drafts (ADR 007): drafts per deal and variant (ADR 027 A) with versions. Other code imports from here only (ADR 026).
export { registerDealDrafts } from "./routes.js";
export type { DealDraftDeps } from "./routes.js";
export { DealDraft, migrateDealDraftIndexes } from "./store.js";
export {
  NOT_CHOSEN_MESSAGE, claimVariantChoice, dealSignature, closedByChoice, isNotChosen, listVariants, markOthersNotChosen, recordClosedLinks, resolveSendVariant, signedElsewhere, signedVariantOf,
  variantNumbers, variantOfNumber, variantWasSent,
} from "./variants.js";
export type { VariantChoice, VariantNumbers } from "./variants.js";
