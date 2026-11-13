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

/** A deal number, or the temporary key of an offer started without one ("t-" + 24 hex). */
export const DEAL_NUMBER_RE = /^\d{1,12}$/;
export const TEMP_DRAFT_KEY_RE = /^t-[0-9a-f]{24}$/;
export const isDraftKey = (v: unknown): v is string => typeof v === "string" && (DEAL_NUMBER_RE.test(v) || TEMP_DRAFT_KEY_RE.test(v));

// ---------- route suggestion (distance and travel time to the customer's address) ----------
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
  /** the business settings every signed-in user may read (free limits, bonus values, task minutes) */
  publicConfig: { method: "GET", path: "/admin/api/config/public", response: z.record(z.string(), z.unknown()) },
  product: { method: "GET", path: "/api/products/:productId", response: ProductSchema },
  /** query: e.g. prefix=BP&source=badolux&limit=200 */
  products: { method: "GET", path: "/api/products", response: z.array(ProductSchema) },
  /** query: w, l (cm) and either series=SLA (Premium) or source=badolux (Standard) */
  traySuggest: { method: "GET", path: "/api/trays/suggest", response: TraySuggestResponseSchema },
  suggestDistance: { method: "POST", path: "/api/routing/suggest-distance", response: SuggestDistanceResponseSchema },
  saveDealDraft: { method: "PUT", path: "/api/deals/:dealId/draft", request: SaveDealDraftRequestSchema, response: SaveDealDraftResponseSchema },
} as const;
export type EndpointName = keyof typeof endpoints;

/** "/api/deals/:dealId/draft" + { dealId: "4711" } → "/api/deals/4711/draft" */
export function pathOf(name: EndpointName, params: Record<string, string | number> = {}): string {
  return endpoints[name].path.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
    if (!(key in params)) throw new Error(`pathOf(${name}): missing parameter "${key}"`);
    return encodeURIComponent(String(params[key]));
  });
}
