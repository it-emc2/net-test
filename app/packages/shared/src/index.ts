// Shared contracts used by both the API and the web client.
// Keep this framework-free: plain TypeScript types only.

export type UserRole = "user" | "admin";

/** A logged-in user as exposed to the client (never includes the password hash). */
export interface PublicUser {
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

// --- Auth DTOs ---

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export interface MeResponse {
  user: PublicUser;
}

export interface LogoutResponse {
  ok: true;
}

/** Uniform error envelope returned by the API on failure. */
export interface ApiError {
  error: string;
}

/** Theme identifiers mirrored from the legacy CSS-variable system. */
export type ThemeName = "base" | "wohnen" | "gesundheit" | "pflege" | "kfz";
export type ColorMode = "light" | "dark";

// --- Admin: user management ---

/** A user record as shown in the admin table (never includes the password hash). */
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface UsersListResponse {
  users: AdminUser[];
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  password: string;
  active: boolean;
}

/** All fields optional; password only re-hashed when a non-empty value is sent. */
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: UserRole;
  active?: boolean;
  password?: string;
}

// --- Customers (Kundendaten) ---

/** Core customer fields for the list/search table. */
export interface CustomerListItem {
  id: string;
  customerNumber: string;
  salutation: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  sourceOfferType: string;
  updatedAt: string | null;
  createdAt: string | null;
}

/** Full customer record, including the free-form kundendaten snapshot. */
export interface CustomerDetail extends CustomerListItem {
  state: string;
  bitrixContactId: string;
  kundendaten: Record<string, unknown>;
}

export interface CustomersListResponse {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// --- Products (Vigor catalog) ---

/** Core product fields for the catalog list. Prices in EUR. */
export interface ProductListItem {
  articleNumber: string;
  name: string;
  netPrice: number;
  grossPrice: number;
  currency: string;
  unit: string;
  finish: string;
  category: string | null;
  image: string | null;
  /** Live stock snapshot from the daily Vigor refresh. */
  stockQuantity: number | null;
  stockText: string;
  inStock: boolean;
  isSpecialOffer: boolean;
}

/** Full product detail. */
export interface ProductDetail extends ProductListItem {
  materialNumber: string;
  images: string[];
  packageUnits: number | null;
  discountGroup: string;
  originalPrice: number | null;
  sourceUrl: string;
  lastSeenAt: string | null;
  priceUpdatedAt: string | null;
}

export interface ProductsListResponse {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductCategoriesResponse {
  categories: string[];
}

export interface ProductBrandsResponse {
  brands: string[];
}

// --- Shower trays (Duschwanne search) ---

export interface TraySuggestItem {
  productId: string;
  name: string;
  sizeLabel: string; // e.g. "120 x 90 cm"
  widthCm: number | null;
  lengthCm: number | null;
  heightCm: number | null;
  netPrice: number; // Badolux already discounted for display
  family: "sla" | "badolux";
  image: string | null;
  inStock: boolean;
  stockQuantity: number | null;
}

export interface TraySuggestResponse {
  sla: TraySuggestItem[];
  badolux: TraySuggestItem[];
}

/** Batch product image/name lookup (Vigor), keyed by article number. */
export interface ProductImagesResponse {
  images: Record<string, { image: string | null; name: string }>;
}

// --- Optional catalog (data-driven, admin-managed) ---

export interface OptionalCompanion {
  productId: string;
  qtyRatio: number; // companion qty = round(qtyRatio × item qty)
}

export interface OptionalItemDef {
  productId: string;
  /** For products not in Vigor or the legacy table — carries its own name/price. */
  manual?: { name: string; price: number } | null;
  /** Extra static image paths appended to the resolved Vigor images (e.g. legacy assets). */
  extraImages?: string[];
  defaultQty?: number;
  companions?: OptionalCompanion[];
}

export interface OptionalCategoryDef {
  id: string;
  label: string;
  order: number;
  selection: "single" | "multi";
  /** "sonder" = free-text custom-product category; "wc" = WC montage panel. */
  special?: "sonder" | "wc";
  items: OptionalItemDef[];
}

/** Item enriched with resolved name/price/image for the configurator. */
export interface OptionalItemView {
  productId: string;
  name: string;
  netPrice: number;
  image: string | null;
  /** All images (for the WC panel's scrollable strip); first entry equals `image`. */
  images: string[];
  defaultQty: number;
  companions: { productId: string; qtyRatio: number; name: string; netPrice: number; image: string | null }[];
}

export interface OptionalCategoryView {
  id: string;
  label: string;
  order: number;
  selection: "single" | "multi";
  special?: "sonder" | "wc";
  items: OptionalItemView[];
}

export interface OptionalCatalogResponse {
  categories: OptionalCategoryView[];
}

/** Admin editor payload: raw definitions + a resolved name/price/image map for display. */
export interface OptionalCatalogAdminResponse {
  categories: OptionalCategoryDef[];
  resolved: Record<string, { name: string; netPrice: number; image: string | null }>;
  /** true when served from the code seed (DB collection empty). */
  fromSeed: boolean;
}
