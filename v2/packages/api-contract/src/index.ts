// Request and response shapes shared by the server routes and the web client (ADR 026): one
// source, so both sides are typed from the same definition and a change breaks the build of
// the side that was not updated. Covers the endpoints the React app needs first; the others
// are added when their screen is rebuilt.
//
// Schemas are lenient where the server passes legacy data through (unknown keys are kept).
import { z } from "zod";

// ---------- errors: every v2 error answer ----------
export const ApiErrorSchema = z.looseObject({
  error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
export const isApiError = (v: unknown): v is ApiError => ApiErrorSchema.safeParse(v).success;

/**
 * Stable, machine-readable codes of the failures that are recorded for the error log (server:
 * platform/error-events.ts writes them; web: each feature maps them to a German message). Never
 * rename a code — a later error-log view and stored records rely on them.
 */
export const ERROR_CODES = {
  /** Bitrix answered "too many requests" (QUERY_LIMIT_EXCEEDED / HTTP 503) even after the retries */
  BITRIX_RATE_LIMITED: "BITRIX_RATE_LIMITED",
  /** Bitrix did not answer in time */
  BITRIX_TIMEOUT: "BITRIX_TIMEOUT",
  /** Bitrix could not be reached, is not configured, or refused the call */
  BITRIX_UNAVAILABLE: "BITRIX_UNAVAILABLE",
  /** a command inside a Bitrix batch failed (the single calls were used instead) */
  BITRIX_BATCH_PARTIAL: "BITRIX_BATCH_PARTIAL",
  /** the batch answer did not have the documented shape, or batch was refused (the single calls were used instead) */
  BITRIX_BATCH_MALFORMED: "BITRIX_BATCH_MALFORMED",
  /** the deal does not exist in Bitrix */
  DEAL_NOT_FOUND: "DEAL_NOT_FOUND",
  /** the deal number is not a number */
  INVALID_DEAL_ID: "INVALID_DEAL_ID",
  /** „Kunde suchen“: the search in the local customer list failed */
  CUSTOMER_SEARCH_FAILED: "CUSTOMER_SEARCH_FAILED",
  /** „Kunde suchen“: the picked customer could not be read */
  CUSTOMER_LOAD_FAILED: "CUSTOMER_LOAD_FAILED",
  /** variants (ADR 027 A): the deal has no variant with this id (or it was deleted) */
  VARIANT_NOT_FOUND: "VARIANT_NOT_FOUND",
  /** variants: delete refused — the variant was sent (send record, legacy log or signing request for its number) */
  VARIANT_SENT: "VARIANT_SENT",
  /** variants: delete refused — the only variant of a deal stays */
  VARIANT_LAST: "VARIANT_LAST",
  /** variants: the name is empty or longer than 60 characters */
  VARIANT_NAME_INVALID: "VARIANT_NAME_INVALID",
  /** variants: all variants of a deal have the same offer type; a save with another one is refused */
  VARIANT_TYPE_MISMATCH: "VARIANT_TYPE_MISMATCH",
  /** variants: creating a variant failed (e.g. migration 005 has not run: the old one-draft-per-deal index is still there) */
  VARIANT_CREATE_FAILED: "VARIANT_CREATE_FAILED",
  /** variants (step 3): a send (mail, post, signing hand-over) of a variant marked "not chosen" is refused */
  VARIANT_NOT_CHOSEN: "VARIANT_NOT_CHOSEN",
  /** signing: a variant was signed after another variant of the deal had been signed — Bitrix keeps the first (warn) */
  VARIANT_SECOND_SIGNATURE: "VARIANT_SECOND_SIGNATURE",
  /** signing: the open link of another variant had documents signed already and was closed by the signature (warn) */
  VARIANT_PARTIAL_SIGNING_CLOSED: "VARIANT_PARTIAL_SIGNING_CLOSED",
  /** signing: the signed offer number belongs to no variant of the deal — nothing was marked or closed (warn) */
  VARIANT_OF_SIGNATURE_UNKNOWN: "VARIANT_OF_SIGNATURE_UNKNOWN",
  /** signing: no sent total was found for the signed offer — the deal's amount was left as it was (warn) */
  SIGNING_AMOUNT_MISSING: "SIGNING_AMOUNT_MISSING",
  /** signing: the Bitrix deal update after a completed signature failed (the signature is kept) */
  SIGNING_DEAL_UPDATE_FAILED: "SIGNING_DEAL_UPDATE_FAILED",
  /** signing: the completion of a fully signed request failed (signed PDFs, mail, Bitrix) — the signatures are stored (U-071) */
  SIGNING_COMPLETION_FAILED: "SIGNING_COMPLETION_FAILED",
  /** signing: a customer's submit of a document failed on the server before an answer (U-071) */
  SIGNING_SUBMIT_FAILED: "SIGNING_SUBMIT_FAILED",
  /** second offer (ADR 027 B): the target type is the type of the open offer — that is a variant */
  SECOND_OFFER_SAME_TYPE: "SECOND_OFFER_SAME_TYPE",
  /** second offer: the target type is not one of NEW_OFFER_TYPES */
  SECOND_OFFER_TYPE_INVALID: "SECOND_OFFER_TYPE_INVALID",
  /** second offer: the open offer has no deal number yet (temporary key) — there is no first deal */
  SECOND_OFFER_TEMP_DEAL: "SECOND_OFFER_TEMP_DEAL",
  /** second offer: neither the offer nor the first deal names a Bitrix contact */
  SECOND_OFFER_NO_CONTACT: "SECOND_OFFER_NO_CONTACT",
  /** second offer: the deal (or the given variant) has no draft to copy the customer from */
  SECOND_OFFER_SOURCE_MISSING: "SECOND_OFFER_SOURCE_MISSING",
  /** second offer: Bitrix is not configured, not reachable or refused the call — no deal was created, a retry is allowed */
  SECOND_OFFER_BITRIX_FAILED: "SECOND_OFFER_BITRIX_FAILED",
  /** second offer: the create call's outcome is unknown (timeout, connection lost) — check Bitrix before a retry */
  SECOND_OFFER_UNCLEAR: "SECOND_OFFER_UNCLEAR",
  /** second offer: the deal was created in Bitrix but its draft could not be written — a repeat finishes it without a new deal */
  SECOND_OFFER_DRAFT_FAILED: "SECOND_OFFER_DRAFT_FAILED",
  /** second offer: the same creation id is being processed right now */
  SECOND_OFFER_RUNNING: "SECOND_OFFER_RUNNING",
  /** second offer: the creation id was used before for another deal or type */
  SECOND_OFFER_ID_MISMATCH: "SECOND_OFFER_ID_MISMATCH",
  /** second offer: the timeline notes (one batch) failed — the creation itself succeeded (warn) */
  SECOND_OFFER_COMMENT_FAILED: "SECOND_OFFER_COMMENT_FAILED",
  /** Hauptmenü „Öffnen“: the search in the stored drafts and offers failed */
  OFFER_SEARCH_FAILED: "OFFER_SEARCH_FAILED",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
/** the areas a recorded failure belongs to (where in the app it happened) */
export const ERROR_AREAS = { kundendatenBitrixLoad: "kundendaten.bitrix-load", kundendatenCustomerSearch: "kundendaten.customer-search", dealVariants: "deal-drafts.variants", signingCompletion: "signing.completion", secondOffer: "deals.second-offer", homeSearch: "home.search" } as const;
export type ErrorArea = (typeof ERROR_AREAS)[keyof typeof ERROR_AREAS];

// ---------- the customer of a Bitrix deal (Kundendaten) ----------
/** the contact as Kundendaten fields — today's mapping (script.js, IntegrationsManager.js) */
export const DealCustomerSchema = z.object({
  bitrixContactId: z.string(), customerNumber: z.string(), salutation: z.string(), firstName: z.string(), lastName: z.string(),
  company: z.string(), email: z.string(), phone: z.string(), street: z.string(), city: z.string(), postalCode: z.string(),
  state: z.string(), country: z.string(),
});
export type DealCustomer = z.infer<typeof DealCustomerSchema>;
/** today's mapping of a Bitrix contact (crm.contact.get) to Kundendaten fields — script.js loadDeal,
 *  loadBitrixContact and IntegrationsManager.js do exactly this */
export function customerOfContact(contact: Record<string, any>): DealCustomer {
  const first = (list: unknown) => (Array.isArray(list) && list[0] ? String((list[0] as { VALUE?: unknown }).VALUE ?? "") : "");
  const honorific = String(contact?.HONORIFIC?.STATUS_ID ?? contact?.HONORIFIC ?? contact?.HONORIFIC_ID ?? "").trim();
  const s = (v: unknown) => (v == null || v === false ? "" : String(v));
  return {
    bitrixContactId: s(contact.ID), customerNumber: s(contact.ID),
    salutation: ({ HNR_DE_1: "Frau", HNR_DE_2: "Herr", "1": "Familie" } as Record<string, string>)[honorific] || "",
    firstName: s(contact.NAME), lastName: s(contact.LAST_NAME), company: s(contact.COMPANY_TITLE),
    email: first(contact.EMAIL), phone: first(contact.PHONE),
    street: s(contact.ADDRESS), city: s(contact.ADDRESS_CITY), postalCode: s(contact.ADDRESS_POSTAL_CODE),
    state: s(contact.ADDRESS_REGION || contact.ADDRESS_PROVINCE), country: s(contact.ADDRESS_COUNTRY),
  };
}
export const DealCustomerResponseSchema = z.object({
  dealId: z.string(),
  dealTitle: z.string(),
  /** null: the deal has no contact (a normal answer, not an error) */
  customer: DealCustomerSchema.nullable(),
  /** the landlord fields of the deal, as GET /api/bitrix/deal/:id gives them */
  vermieter: z.object({ erforderlich: z.boolean().nullable(), liegtVor: z.boolean().nullable() }),
  /** how the answer was made: one batch request, or the single calls after a failed batch */
  source: z.enum(["batch", "fallback"]),
  /** when Bitrix was asked (ISO); the server keeps the answer about a minute */
  loadedAt: z.string(),
});
export type DealCustomerResponse = z.infer<typeof DealCustomerResponseSchema>;
/** how long the server keeps a deal's customer, and the web app treats it as fresh */
export const DEAL_CUSTOMER_TTL_MS = 60_000;

// ---------- auth ----------
export const PublicUserSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.string().optional(),
});
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const LoginRequestSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export const LoginResponseSchema = z.object({ token: z.string(), user: PublicUserSchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export const MeResponseSchema = z.object({ user: PublicUserSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// ---------- version ----------
export const VersionResponseSchema = z.object({ buildId: z.string() });
export type VersionResponse = z.infer<typeof VersionResponseSchema>;

// ---------- pricing ----------
/** What the browser needs to compute prices itself: the business settings and the price list. */
export const PriceInputsResponseSchema = z.object({
  buildId: z.string(),
  config: z.record(z.string(), z.unknown()),
  products: z.array(z.looseObject({ productId: z.string(), price: z.number().nullish(), name: z.string().nullish() })),
});
export type PriceInputsResponse = z.infer<typeof PriceInputsResponseSchema>;

/** POST /api/price: the request is the offer itself; the answer keeps every legacy field. */
export const PriceResponseSchema = z.looseObject({ total: z.number().nullish(), selfPayAmount: z.number().nullish() });
export type PriceResponse = z.infer<typeof PriceResponseSchema>;

// ---------- deal drafts (ADR 007): one draft per deal, versioned ----------
export const DealDraftResponseSchema = z.object({
  dealId: z.string(),
  offerType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  revision: z.number().int(),
  updatedAt: z.union([z.string(), z.date()]),
  updatedBy: z.string().nullish(),
  /** the variant this draft is (ADR 027 A); older servers did not send it */
  variantId: z.string().optional(),
  variantName: z.string().optional(),
  /** the other deals of the same customer made with „Weiteres Angebot“ (ADR 027 B), all variants of this deal; older servers did not send it */
  related: z.array(z.lazy(() => DealRelationSchema)).optional(),
});
export type DealDraftResponse = z.infer<typeof DealDraftResponseSchema>;

export const SaveDealDraftRequestSchema = z.object({
  offerType: z.string(),
  payload: z.record(z.string(), z.unknown()),
  /** the revision this change is based on (0 = no draft yet); a newer one on the server → 409 */
  baseRevision: z.number().int().min(0),
});
export type SaveDealDraftRequest = z.infer<typeof SaveDealDraftRequestSchema>;
/** `changed: false` — the payload equals the stored one, no new revision was written. */
export const SaveDealDraftResponseSchema = z.object({ dealId: z.string(), revision: z.number().int(), changed: z.boolean() });
export type SaveDealDraftResponse = z.infer<typeof SaveDealDraftResponseSchema>;

/** One saved version of a deal's draft (variant): what the „Versionen“ list shows. Newest first. */
export const DealDraftRevisionSchema = z.object({
  revision: z.number().int(),
  at: z.union([z.string(), z.date()]),
  /** e-mail of who saved it — shown as initials only */
  by: z.string().nullish(),
  kind: z.enum(["save", "restore", "import", "copy"]),
  /** top-level offer fields this version changed */
  sections: z.array(z.string()).default([]),
  /** e.g. „Version 2 wiederhergestellt“, „Übernommen aus Angebot …“ */
  note: z.string().nullish(),
  offerType: z.string().nullish(),
});
export type DealDraftRevision = z.infer<typeof DealDraftRevisionSchema>;
export const DealDraftRevisionsResponseSchema = z.object({ dealId: z.string(), variantId: z.string().optional(), revisions: z.array(DealDraftRevisionSchema) });
export type DealDraftRevisionsResponse = z.infer<typeof DealDraftRevisionsResponseSchema>;
/** „Wiederherstellen“: the content of `revision` becomes a NEW version (history is never rewritten); `baseRevision` as for a save (409 when the draft moved on) */
export const RestoreDealDraftRequestSchema = z.object({ revision: z.number().int().min(1), baseRevision: z.number().int().min(0) });
export type RestoreDealDraftRequest = z.infer<typeof RestoreDealDraftRequestSchema>;

/** A deal number, or the temporary key of an offer started without one ("t-" + 24 hex). */
export const DEAL_NUMBER_RE = /^\d{1,12}$/;
export const TEMP_DRAFT_KEY_RE = /^t-[0-9a-f]{24}$/;
export const isDraftKey = (v: unknown): v is string => typeof v === "string" && (DEAL_NUMBER_RE.test(v) || TEMP_DRAFT_KEY_RE.test(v));

// ---------- variants of a deal's offer (ADR 027 A) ----------
// A variant is a separate offer under the same deal: its own draft (with its own history), its
// own offer number (given at the first send), its own sends. Every draft call takes an optional
// query parameter `variant=<id>`; without it the call acts on the variant opened last (today's
// UI has no selector). The first variant of a deal has the id "v1" (drafts saved before variants
// existed are this variant); later ones "v-" + 12 hex.
export const FIRST_VARIANT_ID = "v1";
export const VARIANT_ID_RE = /^(v1|v-[0-9a-f]{12})$/;
export const isVariantId = (v: unknown): v is string => typeof v === "string" && VARIANT_ID_RE.test(v);
export const VARIANT_NAME_MAX = 60;
/** derived, never stored twice: draft → sent → signed; "not-chosen" when another variant was signed */
export const VariantStatusSchema = z.enum(["draft", "sent", "signed", "not-chosen"]);
export type VariantStatus = z.infer<typeof VariantStatusSchema>;
const When = z.union([z.string(), z.date()]);
export const DealVariantSchema = z.object({
  variantId: z.string(),
  /** internal only — never on customer documents or mails (owner 2026-11-19) */
  name: z.string(),
  offerType: z.string(),
  /** the variant's current offer number, "" before its first send */
  offerNumber: z.string(),
  status: VariantStatusSchema,
  /** the last send that reached the customer (not "only filed in Bitrix") */
  sentAt: When.nullable(),
  sentChannel: z.string().nullable(),
  signedAt: When.nullable(),
  /** gross total of the last completed send, null when never sent */
  total: z.number().nullable(),
  revision: z.number().int(),
  updatedAt: When,
  notChosenAt: When.nullable(),
  /** the variant calls without `variant` act on */
  isDefault: z.boolean(),
});
export type DealVariant = z.infer<typeof DealVariantSchema>;
export const DealVariantsResponseSchema = z.object({ dealId: z.string(), defaultVariantId: z.string().nullable(), variants: z.array(DealVariantSchema) });
export type DealVariantsResponse = z.infer<typeof DealVariantsResponseSchema>;
/** a copy of `from` (default: the variant opened last); `name` empty → "Variante N" */
export const CreateVariantRequestSchema = z.object({ from: z.string().regex(VARIANT_ID_RE).optional(), name: z.string().max(VARIANT_NAME_MAX).optional() });
export type CreateVariantRequest = z.infer<typeof CreateVariantRequestSchema>;
export const CreateVariantResponseSchema = z.object({ dealId: z.string(), variant: DealVariantSchema, revision: z.number().int() });
export type CreateVariantResponse = z.infer<typeof CreateVariantResponseSchema>;
export const RenameVariantRequestSchema = z.object({ name: z.string().min(1).max(VARIANT_NAME_MAX) });
export type RenameVariantRequest = z.infer<typeof RenameVariantRequestSchema>;
export const RenameVariantResponseSchema = z.object({ dealId: z.string(), variant: DealVariantSchema });
export const DeleteVariantResponseSchema = z.object({ ok: z.literal(true), dealId: z.string(), variantId: z.string(), defaultVariantId: z.string().nullable() });

// ---------- a second offer type for the same customer (ADR 027 B) ----------
// From an open offer the user starts an offer of ANOTHER type for the same customer: the server
// creates a new Bitrix deal („Neue Anfragen“) and a draft under it with the customer data copied.
// `creationId` (client-generated, 8–64 of [A-Za-z0-9_-]) makes it exactly-once: a repeat answers the
// stored result without a Bitrix call.
export const CREATION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const SecondOfferRequestSchema = z.object({
  offerType: z.string(),
  creationId: z.string().regex(CREATION_ID_RE),
  /** the source variant (default: the variant opened last) */
  variantId: z.string().regex(VARIANT_ID_RE).optional(),
  /** after SECOND_OFFER_UNCLEAR: look in Bitrix for a deal made by this creation id first, create only if there is none */
  checkBitrix: z.boolean().optional(),
});
export type SecondOfferRequest = z.infer<typeof SecondOfferRequestSchema>;
export const SecondOfferResponseSchema = z.object({
  ok: z.literal(true),
  creationId: z.string(),
  sourceDealId: z.string(),
  sourceVariantId: z.string(),
  /** the NEW deal's number; its draft is its first variant */
  dealId: z.string(),
  offerType: z.string(),
  variantId: z.string(),
  revision: z.number().int(),
  /** the two timeline notes (one batch); "failed" does not undo the creation */
  comments: z.enum(["ok", "failed"]),
  /** true: answered from the stored result of an earlier request with the same creationId */
  repeated: z.boolean(),
});
export type SecondOfferResponse = z.infer<typeof SecondOfferResponseSchema>;
/** one relation, stored on both drafts (outside the payload); symmetric, not transitive */
export const DealRelationSchema = z.object({
  dealId: z.string(),
  offerType: z.string(),
  /** "created": this deal's offer started the other one; "source": this deal was started from the other one */
  role: z.enum(["created", "source"]),
  createdAt: When,
  creationId: z.string(),
});
export type DealRelation = z.infer<typeof DealRelationSchema>;
export const DealRelatedResponseSchema = z.object({
  dealId: z.string(),
  related: z.array(DealRelationSchema.extend({
    /** the other deal's state from its variants: signed > sent > draft; null when it has no draft (yet) */
    status: VariantStatusSchema.nullable(),
  })),
});
export type DealRelatedResponse = z.infer<typeof DealRelatedResponseSchema>;

// ---------- Hauptmenü „Öffnen“: legacy drafts and stored offers (search, a deal's list) ----------
// Today's UI (script.js renderGlobalOfferSearchResults, openDealActionDialog) gets the whole stored
// documents from GET /api/offers/search-all and /api/offers/by-deal/:dealId and derives what a row
// shows in the browser. The React app asks the lean routes (/api/offers/v2/…), which derive the
// same row on the server with homeSearchRow — one function, so a row looks exactly like today's.
/** today's matching: 220 ms after the last key, up to 20 rows, no minimum length */
export const HOME_SEARCH_DELAY_MS = 220;
export const HOME_SEARCH_LIMIT = 20;
export const HomeSearchRowSchema = z.object({
  kind: z.enum(["draft", "offer"]),
  /** the stored document's id (a draft is opened by it) */
  id: z.string(),
  title: z.string(),
  /** as stored, lower or upper case; "" when none */
  offerType: z.string(),
  /** the bold reference: the offer number, else (search only) the draft's id — as today */
  ref: z.string(),
  offerNumber: z.string(),
  /** ISO time of the last change (today's date column), null when unknown */
  at: z.string().nullable(),
  snippet: z.string(),
  /** the deal number the document belongs to (its `auftragId`), "" when it has none */
  deal: z.string(),
});
export type HomeSearchRow = z.infer<typeof HomeSearchRowSchema>;
export const HomeSearchResponseSchema = z.object({ rows: z.array(HomeSearchRowSchema) });
export type HomeSearchResponse = z.infer<typeof HomeSearchResponseSchema>;

const text = (v: unknown) => (v == null ? "" : String(v));
const isoOf = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
/**
 * One row of today's lists from a search-all / by-deal result (mapSearchResult on the server).
 * `list`: "search" = the Hauptmenü search (renderGlobalOfferSearchResults), "deal" = the list of a
 * deal (openDealActionDialog) — they name a row differently, as today. Verbatim rules, quirks kept:
 * a search row's title is the customer name only if the document has a `customerName` (none has),
 * so drafts show their name and offers their number; a draft without number shows its id.
 */
export function homeSearchRow(item: Record<string, any>, list: "search" | "deal" = "search"): HomeSearchRow {
  const source = String(item.source || item.collection || item.kind || "").toLowerCase();
  const draftId = text(item._id || item.id || item.draftId);
  const offerNumber = text(item.offerNumber || item.angNumber || item.number || item.angebotNummer);
  const isDraft = list === "deal" ? item._type === "draft" :
    item._type === "draft" || source.includes("draft") || source.includes("entwurf") || item.isDraft === true || item.type === "draft" ||
    item.kind === "draft" || item.collection === "drafts" || (!!draftId && !offerNumber);
  const title = list === "deal"
    ? [item.firstName, item.lastName].filter(Boolean).join(" ").trim() || text(item.name) || text(item.offerNumber) || "Ohne Titel"
    : text(item.customerName || item.name || item.title || item.offerNumber || item.angNumber) || (isDraft ? "Entwurf ohne Titel" : "Ohne Titel");
  const deal = text(item.payload?.auftragId || item.payload?.postal?.auftragId || item.auftragId).trim();
  return {
    kind: isDraft ? "draft" : "offer",
    id: draftId,
    title,
    offerType: text(list === "deal" ? item.offerType : item.offerType || item.activeOffer || item.type),
    ref: list === "deal" ? text(item.offerNumber) : offerNumber || draftId,
    offerNumber: list === "deal" ? text(item.offerNumber) : offerNumber,
    at: isoOf(list === "deal" ? item.updatedAt : item.updatedAt || item.createdAt || item.date),
    snippet: list === "deal" ? "" : text(item.snippet || item.summary || item.preview),
    deal: DEAL_NUMBER_RE.test(deal) ? deal : "",
  };
}
/** a legacy draft (GET /api/drafts/:id) */
export const LegacyDraftResponseSchema = z.looseObject({ id: z.unknown(), name: z.string().nullish(), offerType: z.string().nullish(), offerNumber: z.string().nullish(), payload: z.record(z.string(), z.unknown()).nullish() });
/** a stored offer (GET /api/offers/:offerNumber) */
export const StoredOfferResponseSchema = z.looseObject({ ok: z.boolean().nullish(), offer: z.looseObject({ offerNumber: z.string(), offerType: z.string().nullish(), payload: z.record(z.string(), z.unknown()).nullish() }) });
/** copies a legacy draft or a stored offer into the deal's draft (a new version; the source is only read) */
export const ImportDealDraftRequestSchema = z.object({ kind: z.enum(["draft", "offer"]), id: z.string().optional(), offerNumber: z.string().optional(), baseRevision: z.number().int() });

// ---------- route suggestion (distance and travel time to the customer's address) ----------
/** `offerType` "ah" starts the route at the Alltagshilfe address; without it (or any other type) at the company address */
export const SuggestDistanceRequestSchema = z.looseObject({ Kundendaten: z.looseObject({}).optional(), offerType: z.string().optional() });
export const SuggestDistanceResponseSchema = z.looseObject({
  ok: z.boolean(),
  oneWayKm: z.number().nullish(), roundTripKm: z.number().nullish(), oneWaySeconds: z.number().nullish(),
  from: z.looseObject({ address: z.string().nullish() }).nullish(),
  to: z.looseObject({ address: z.string().nullish() }).nullish(),
});
export type SuggestDistanceResponse = z.infer<typeof SuggestDistanceResponseSchema>;

// ---------- shower trays that fit a size ----------
export const TraySchema = z.looseObject({
  productId: z.string(), name: z.string().nullish(), price: z.number().nullish(),
  widthCm: z.number().nullish(), lengthCm: z.number().nullish(), heightCm: z.number().nullish(),
  articleNumber: z.string().nullish(), stockQuantity: z.number().nullish(), stockSymbol: z.number().nullish(), stockText: z.string().nullish(),
});
export type Tray = z.infer<typeof TraySchema>;
export const TraySuggestResponseSchema = z.looseObject({ results: z.array(TraySchema) });

// ---------- price list ----------
export const ProductSchema = z.looseObject({ productId: z.string(), name: z.string().nullish(), price: z.number().nullish(), source: z.string().nullish() });
export type Product = z.infer<typeof ProductSchema>;

// ---------- the endpoints: method, path and shapes in one place ----------
export const endpoints = {
  login: { method: "POST", path: "/api/auth/login", request: LoginRequestSchema, response: LoginResponseSchema },
  logout: { method: "POST", path: "/api/auth/logout", response: z.object({ ok: z.literal(true) }) },
  me: { method: "GET", path: "/api/auth/me", response: MeResponseSchema },
  version: { method: "GET", path: "/api/version", response: VersionResponseSchema },
  price: { method: "POST", path: "/api/price", response: PriceResponseSchema },
  priceInputs: { method: "GET", path: "/api/price/inputs", response: PriceInputsResponseSchema },
  dealDraft: { method: "GET", path: "/api/deals/:dealId/draft", response: DealDraftResponseSchema },
  /** the deal's contact as Kundendaten fields, with the landlord fields: ONE Bitrix request (batch), kept ~60 s on the server; query fresh=1 asks Bitrix again */
  dealCustomer: { method: "GET", path: "/api/deals/:dealId/customer", response: DealCustomerResponseSchema },
  /** „Kunde suchen“ in the local customer list (no Bitrix); query: q, limit */
  customerSearch: { method: "GET", path: "/api/customers/search", response: z.looseObject({ items: z.array(z.looseObject({})).nullish() }) },
  /** one saved customer with the whole saved Kundendaten page */
  customer: { method: "GET", path: "/api/customers/:id", response: z.looseObject({ customer: z.looseObject({}).nullish() }) },
  /** the business settings every signed-in user may read (free limits, bonus values, task minutes) */
  publicConfig: { method: "GET", path: "/admin/api/config/public", response: z.record(z.string(), z.unknown()) },
  /** query: ids=<article>,<article> → net purchase price per article */
  vigorPrices: { method: "GET", path: "/api/vigor-prices", response: z.record(z.string(), z.unknown()) },
  /** the shower-curtain catalogue: curtains, rods, the mandatory rosettes and the other fittings, with net prices and stock */
  vorhangProducts: { method: "GET", path: "/api/vorhang/products", response: z.looseObject({ curtains: z.array(z.unknown()), rods: z.array(z.unknown()), mandatory: z.array(z.unknown()), optional: z.array(z.unknown()) }) },
  /** the people who can be the contact person of an offer (active, with a signature), sorted by name */
  /** today's planning (appointments of the week); the Hauptmenü shows today's */
  planningCurrent: { method: "GET", path: "/api/planning/current", response: z.looseObject({ planning: z.looseObject({}).nullish() }) },
  /** planning panel: the times of today's Bitrix calendar entries per deal, { byDealId: { <deal>: { startMinutes, endMinutes } } } */
  bitrixActivitiesToday: { method: "GET", path: "/api/bitrix/activities/today", response: z.looseObject({ byDealId: z.record(z.string(), z.looseObject({})).nullish() }) },
  /** planning panel: the deal with its contact (Anrede, e-mail, phone, address) — fills a new offer from an appointment */
  bitrixDeal: { method: "GET", path: "/api/bitrix/deal/:id", response: z.looseObject({ contact: z.looseObject({}).nullish() }) },
  bitrixContact: { method: "GET", path: "/api/bitrix/contact/:id", response: z.looseObject({ result: z.looseObject({}).nullish() }) },
  /** the deals of a Bitrix contact: { deals: [{ id, title }] } */
  bitrixContactDeals: { method: "GET", path: "/api/bitrix/contact/:id/deals", response: z.looseObject({ deals: z.array(z.looseObject({ id: z.string() })).nullish() }) },
  /** a saved offer exists for this deal? (the list is empty if not) */
  offersByDeal: { method: "GET", path: "/api/offers/by-deal/:dealId", response: z.array(z.unknown()) },
  /** Hauptmenü „Öffnen“: legacy drafts + stored offers matching q (today's matching), as today's rows; query: q, limit */
  homeSearch: { method: "GET", path: "/api/offers/v2/search", response: HomeSearchResponseSchema },
  /** the legacy drafts + stored offers of a deal (up to 20 + 20), as today's rows of the deal dialog */
  homeByDeal: { method: "GET", path: "/api/offers/v2/by-deal/:dealId", response: HomeSearchResponseSchema },
  legacyDraft: { method: "GET", path: "/api/drafts/:id", response: LegacyDraftResponseSchema },
  storedOffer: { method: "GET", path: "/api/offers/:offerNumber", response: StoredOfferResponseSchema },
  /** a legacy draft / stored offer becomes a new version of the deal's draft (query variant=…); REVISION_CONFLICT when the draft moved on */
  importDealDraft: { method: "POST", path: "/api/deals/:dealId/draft/import", request: ImportDealDraftRequestSchema, response: SaveDealDraftResponseSchema },
  /** „Termin hat nicht stattgefunden“: the deal goes back to „Besichtigungstermin vereinbaren“; body: comment, reason */
  moveBesichtigung: { method: "POST", path: "/api/bitrix/deal/:id/move-besichtigung", response: z.looseObject({ commentFailed: z.boolean().nullish(), plannerSynced: z.boolean().nullish() }) },
  /** the lean planning API (route-plannung #35) through our server, which holds the key: one day, ~3 KB; query: date=YYYY-MM-DD (default today) → { ok, updatedAt, plan } */
  planningToday: { method: "GET", path: "/api/planning/v2/today", response: z.looseObject({ ok: z.boolean().nullish(), plan: z.looseObject({}).nullish() }) },
  /** the lean week, 7 days of short entries; query: from=YYYY-MM-DD → { ok, from, days } */
  planningWeek: { method: "GET", path: "/api/planning/v2/week", response: z.looseObject({ ok: z.boolean().nullish(), days: z.array(z.looseObject({})).nullish() }) },
  users: { method: "GET", path: "/api/users", response: z.array(z.looseObject({ email: z.string(), name: z.string() })) },
  /** a finished offer is kept under its number (after a PDF was made); body: offerNumber, offerType, payload, pricing, savedAt, clientSaveId */
  saveOffer: { method: "POST", path: "/api/offers", response: z.looseObject({}) },
  /** audit trail of milestones on the page; the answer is always { ok: true } */
  logAction: { method: "POST", path: "/api/bitrix/log-action", response: z.looseObject({ ok: z.boolean().nullish() }) },
  /** the shower-enclosure model of a supplier (vigour: from the catalogue database, about 10 MB; badolux: a fixed list) */
  daModel: { method: "GET", path: "/api/da-config/model/:supplier", response: z.looseObject({ params: z.array(z.unknown()), leaves: z.array(z.unknown()) }) },
  product: { method: "GET", path: "/api/products/:productId", response: ProductSchema },
  /** the bathtubs and Wannenaufsätze of the Wanne picker (Optionale Produkte), sorted by type and net price */
  bathtubCatalog: { method: "GET", path: "/api/bathtubs/catalog", response: z.looseObject({ count: z.number().nullish(), items: z.array(z.looseObject({ articleNumber: z.string(), type: z.string() })) }) },
  /** query: e.g. prefix=BP&source=badolux&limit=200 */
  products: { method: "GET", path: "/api/products", response: z.array(ProductSchema) },
  /** query: w, l (cm) and either series=SLA (Premium) or source=badolux (Standard) */
  traySuggest: { method: "GET", path: "/api/trays/suggest", response: TraySuggestResponseSchema },
  suggestDistance: { method: "POST", path: "/api/routing/suggest-distance", request: SuggestDistanceRequestSchema, response: SuggestDistanceResponseSchema },
  saveDealDraft: { method: "PUT", path: "/api/deals/:dealId/draft", request: SaveDealDraftRequestSchema, response: SaveDealDraftResponseSchema },
  /** the saved versions of the deal's draft (query variant=…), newest first */
  dealDraftRevisions: { method: "GET", path: "/api/deals/:dealId/draft/revisions", response: DealDraftRevisionsResponseSchema },
  /** an earlier version becomes the newest one (query variant=…); REVISION_CONFLICT when the draft moved on */
  restoreDealDraft: { method: "POST", path: "/api/deals/:dealId/draft/restore", request: RestoreDealDraftRequestSchema, response: SaveDealDraftResponseSchema },
  /** the variants of a deal (ADR 027 A) with their derived status */
  dealVariants: { method: "GET", path: "/api/deals/:dealId/variants", response: DealVariantsResponseSchema },
  /** a new variant: a copy of another one without offer number and send status; it becomes the variant opened last */
  createDealVariant: { method: "POST", path: "/api/deals/:dealId/variants", request: CreateVariantRequestSchema, response: CreateVariantResponseSchema },
  renameDealVariant: { method: "PATCH", path: "/api/deals/:dealId/variants/:variantId", request: RenameVariantRequestSchema, response: RenameVariantResponseSchema },
  /** only a variant that was never sent; never the only one (VARIANT_SENT, VARIANT_LAST) */
  deleteDealVariant: { method: "DELETE", path: "/api/deals/:dealId/variants/:variantId", response: DeleteVariantResponseSchema },
  /** a second offer type for the same customer (ADR 027 B): a NEW Bitrix deal + its draft with the customer data; exactly once per creationId */
  createSecondOffer: { method: "POST", path: "/api/deals/:dealId/second-offer", request: SecondOfferRequestSchema, response: SecondOfferResponseSchema },
  /** the other deals of the same customer made with „Weiteres Angebot“, with their status */
  dealRelated: { method: "GET", path: "/api/deals/:dealId/related", response: DealRelatedResponseSchema },
  /** the state of one send (ADR 023): status running | done | failed, and the answer of a finished send */
  send: { method: "GET", path: "/api/sends/:sendId", response: z.looseObject({ send: z.looseObject({ status: z.string() }).nullish(), result: z.unknown().nullish() }) },
  /** files a sent offer again in Bitrix from the stored files — nothing is sent again */
  retryBitrix: { method: "POST", path: "/api/sends/:sendId/retry-bitrix", response: z.looseObject({ ok: z.boolean().nullish() }) },
  /** after sending: the deal goes to "ANG verschickt" with the offer's own total; body: opportunity, finalTotal, workDays, offerType, offerNumber … */
  moveSent: { method: "POST", path: "/api/bitrix/deal/:id/move-ang-verschickt", response: z.looseObject({}) },
  /** audit: the dialog after sending was shown / closed without moving the deal; body: event, offerNumber, offerType */
  logDialogEvent: { method: "POST", path: "/api/bitrix/deal/:id/log-dialog-event", response: z.looseObject({}) },
  /** the printer's mode: "test" (the letter only lands in the basket) or "live" */
  postConfig: { method: "GET", path: "/api/post/config", response: z.looseObject({ mode: z.string().nullish() }) },
  /** the credit at the printer (shown in the binding question, never blocks) */
  postBalance: { method: "GET", path: "/api/post/balance", response: z.looseObject({ ok: z.boolean().nullish(), balance: z.union([z.number(), z.string()]).nullish(), currency: z.string().nullish() }) },
  /** the signed-in user's own password once more (release of a letter without deal number); body: password */
  confirmPassword: { method: "POST", path: "/api/auth/confirm-password", response: z.looseObject({ email: z.string().nullish() }) },
  /** how an offer was sent before (newest first) */
  /** registers an offer number for this device; `changed`: it was taken, `offerNumber` is the one to use (audit F12) */
  claimOfferNumber: { method: "POST", path: "/api/offer-numbers/claim", response: z.looseObject({ offerNumber: z.string().nullish(), changed: z.boolean().nullish() }) },
  offerSends: { method: "GET", path: "/api/offers/:offerNumber/sends", response: z.looseObject({ sends: z.array(z.looseObject({ status: z.string().nullish(), channel: z.string().nullish() })).nullish() }) },
  /** the sends of a deal across its offer numbers (newest first) */
  dealSends: { method: "GET", path: "/api/deals/:dealId/sends", response: z.looseObject({ sends: z.array(z.looseObject({ status: z.string().nullish(), channel: z.string().nullish() })).nullish() }) },
  /** the signatures asked for an offer (newest first): status, and "post" when started from the Post tab */
  signingStatus: { method: "GET", path: "/api/signing/status/:offerNumber", response: z.array(z.looseObject({ status: z.string().nullish(), via: z.string().nullish() })) },
  /** the signed documents of an offer as files (base64) */
  signedDocuments: { method: "GET", path: "/api/signing/status/:offerNumber/signed", response: z.looseObject({ documents: z.array(z.looseObject({ key: z.string().nullish(), filename: z.string(), base64: z.string() })) }) },
  /** a photo or file for the Bitrix deal (type: kasse | vermieter): into the deal's file field and as a timeline note; body: filename, base64. kept false: the field holds only the newest file */
  dealUpload: { method: "POST", path: "/api/bitrix/deal/:id/upload/:type", response: z.looseObject({ ok: z.boolean().nullish(), kept: z.boolean().nullish() }) },
  // ---------- admin area (role admin; the server checks it on every route, ADR 015) ----------
  /** every business setting with label, type, section, default and current value */
  adminConfig: { method: "GET", path: "/admin/api/config", response: z.array(z.looseObject({ key: z.string(), type: z.string().nullish(), section: z.string().nullish() })) },
  /** body: { <key>: value, … } — unknown keys are dropped by the server */
  adminConfigSave: { method: "PUT", path: "/admin/api/config", response: z.looseObject({ ok: z.boolean().nullish() }) },
  /** body: { key } → the default value is stored again */
  adminConfigReset: { method: "POST", path: "/admin/api/config/reset", response: z.looseObject({ key: z.string().nullish(), value: z.unknown() }) },
  /** every user (never a password hash or the signature itself) */
  adminUsers: { method: "GET", path: "/admin/api/users", response: z.array(z.looseObject({ email: z.string(), role: z.string().nullish(), active: z.boolean().nullish(), hasSignature: z.boolean().nullish() })) },
  /** create or update by e-mail; body: firstName, lastName, email, password (empty = keep), role, active (false = deactivated) */
  adminUserSave: { method: "POST", path: "/admin/api/users", response: z.looseObject({ email: z.string().nullish() }) },
  /** body: { dataUrl } (PNG/JPEG as data URL) */
  adminUserSignature: { method: "POST", path: "/admin/api/users/:email/signature", response: z.looseObject({ hasSignature: z.boolean().nullish() }) },
  /** failed Bitrix calls (newest first, up to 500) */
  adminBitrixLogs: { method: "GET", path: "/admin/api/bitrix-logs", response: z.looseObject({ items: z.array(z.looseObject({})) }) },
  /** the failed call once more with its stored parameters */
  adminBitrixRetry: { method: "POST", path: "/admin/api/bitrix-logs/:id/retry", response: z.looseObject({}) },
  /** query: days (1–180) → per kind/engine counts, time saved, last failures */
  adminPdfStats: { method: "GET", path: "/admin/api/pdf-stats", response: z.looseObject({ rows: z.array(z.looseObject({})), failures: z.array(z.looseObject({})) }) },
  /** query: event, dealId → the newest 500 entries */
  adminUserLogs: { method: "GET", path: "/admin/api/user-action-logs", response: z.looseObject({ items: z.array(z.looseObject({})) }) },
  /** query: q, status → signing links with counts per status */
  adminSigning: { method: "GET", path: "/admin/api/signing", response: z.looseObject({ items: z.array(z.looseObject({ token: z.string() })) }) },
  /** files the signed documents of a link in the Bitrix deal again */
  adminSigningSendBitrix: { method: "POST", path: "/admin/api/signing/:token/send-bitrix", response: z.looseObject({ sent: z.array(z.unknown()).nullish() }) },
  /** query: q → services of the catalogue (sorted by id) */
  services: { method: "GET", path: "/api/services", response: z.array(z.looseObject({ serviceId: z.string() })) },
  /** admins only (ADR 018): body = array of products, upserted by productId */
  productsBulk: { method: "POST", path: "/api/products/bulk", response: z.looseObject({ ok: z.boolean().nullish() }) },
  /** admins only (ADR 018): body = array of services, upserted by serviceId */
  servicesBulk: { method: "POST", path: "/api/services/bulk", response: z.looseObject({ ok: z.boolean().nullish() }) },
} as const;
export type EndpointName = keyof typeof endpoints;

/** "/api/deals/:dealId/draft" + { dealId: "4711" } → "/api/deals/4711/draft" */
export function pathOf(name: EndpointName, params: Record<string, string | number> = {}): string {
  return endpoints[name].path.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
    if (!(key in params)) throw new Error(`pathOf(${name}): missing parameter "${key}"`);
    return encodeURIComponent(String(params[key]));
  });
}
