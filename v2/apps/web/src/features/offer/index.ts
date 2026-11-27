// The offer being edited: store, draft, price, step lists and the frame around the steps.
export { LegacyLink, NewOffer, OfferShell, StepInLegacy } from "./OfferShell.js";
export { SaveState } from "./SaveState.js";
export { AUTOSAVE_MS, flushDraft, flushNow, legacyAddress, newTempKey, prefillNextOffer, reloadDraft, type SaveStatus } from "./model/draft.js";
export { useOfferField, useOfferStore, useOfferType, type OfferState } from "./model/store.js";
export { usePrice } from "./model/usePrice.js";
export { BUILT_STEPS, OFFER_TITLES, STEPS, askBeforeLeaving, checkStep, firstStep, flowSteps, isReferenzStep, isStepOf, setStepCheck, setStepLeave, setStepStatuses, stepLabel, stepStatuses, type StepLeave, type StepProblem, type StepStatus } from "./steps.js";
export { CreateVariantButton, openVariantPanel } from "./VariantSwitch.js";
export { useVariants, variantsKey } from "./model/useVariants.js";
export { TEXT as VARIANT_TEXT, nextVariantName, sendVariantOf, statusText as variantStatusText, variantError, variantOfSend, variantSearch } from "./model/variants.js";
export { SecondOfferButton, SecondOfferHost, openSecondOffer, relatedKey, useRelated, type SecondOfferSource } from "./SecondOffer.js";
export { TEXT as SECOND_OFFER_TEXT, customerName, relatedOfType, typeTitle } from "./model/second-offer.js";
export { AH_CONFIG_DEFAULT, ahConfigOf, ahTotalsOf, getAhConfig, useAhConfig, useAhPrice, type AhConfig } from "./model/ah-price.js";
