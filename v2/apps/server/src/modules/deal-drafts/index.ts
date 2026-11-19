// Deal drafts (ADR 007): drafts per deal and variant (ADR 027 A) with versions. Other code imports from here only (ADR 026).
export { registerDealDrafts } from "./routes.js";
export type { DealDraftDeps } from "./routes.js";
export { DealDraft, migrateDealDraftIndexes } from "./store.js";
export { markOthersNotChosen, resolveSendVariant, listVariants, variantWasSent } from "./variants.js";
