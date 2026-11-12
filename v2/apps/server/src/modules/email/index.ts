// Offer e-mail: send, templates, duplicate lock. Other code imports from here only (ADR 026).
export { UNAVAILABLE_DOCUMENTS } from "./ports.js";
export type { OfferDocuments, SigningPort } from "./ports.js";
export { registerEmail } from "./routes.js";
export { claimSendLock } from "./send-lock.js";
export { buildEmailHtml } from "./template.js";
