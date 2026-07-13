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
