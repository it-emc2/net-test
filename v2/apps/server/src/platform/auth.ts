// Password hashing + session tokens, wire-compatible with the legacy app
// (src/services/authService.js): scrypt "salt:hash" and "<base64url(exp:email)>.<hmac-sha256>".
// With the same AUTH_SECRET, a session created by either app is valid in the other.
import crypto from "node:crypto";

export const SESSION_COOKIE = "net_session";
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(password), salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | undefined | null): boolean {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(password), salt, 64).toString("hex");
  try { return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex")); } catch { return false; }
}

export function createToken(email: string, secret: string, now = Date.now()): string {
  const payload = `${now + TOKEN_TTL_MS}:${String(email).toLowerCase()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

function parse(token: string): { exp: number; email: string; payload: string; sig: string } | null {
  const dot = String(token || "").indexOf(".");
  if (dot < 1) return null;
  let payload: string;
  try { payload = Buffer.from(token.slice(0, dot), "base64url").toString(); } catch { return null; }
  const sep = payload.indexOf(":");
  if (sep < 1) return null;
  const exp = Number(payload.slice(0, sep));
  const email = payload.slice(sep + 1);
  if (!Number.isFinite(exp) || exp <= 0 || !email) return null;
  return { exp, email, payload, sig: token.slice(dot + 1) };
}

export function verifyToken(token: string, secret: string, now = Date.now()): { email: string } | null {
  const t = parse(token);
  if (!t || now > t.exp) return null;
  const expected = crypto.createHmac("sha256", secret).update(t.payload).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(t.sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch { return null; }
  return { email: t.email };
}

/** Sliding refresh once past half of the lifetime (legacy shouldRefresh). */
export function shouldRefresh(token: string, now = Date.now()): boolean {
  const t = parse(token);
  if (!t) return false;
  const remaining = t.exp - now;
  return remaining > 0 && remaining < TOKEN_TTL_MS / 2;
}

export function tokenFromHeaders(headers: Record<string, unknown>): string {
  const auth = String(headers.authorization || "");
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  for (const part of String(headers.cookie || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) { try { return decodeURIComponent(v.join("=")); } catch { return ""; } }
  }
  return "";
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", `Max-Age=${TOKEN_TTL_MS / 1000}`, "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
