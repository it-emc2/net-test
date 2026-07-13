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
