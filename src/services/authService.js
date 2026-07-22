// src/services/authService.js
// Password hashing (scrypt) + signed session tokens (HMAC), no external deps.

import crypto from "crypto";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE = "net_session";

function secret() {
  return process.env.AUTH_SECRET || process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "insecure-fallback";
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const h = crypto.scryptSync(String(password), salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

export function createToken(email) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${exp}:${String(email).toLowerCase()}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

// Returns { email } if valid, else null.
export function verifyToken(token) {
  if (!token) return null;
  const dot = String(token).indexOf(".");
  if (dot < 1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload;
  try {
    payload = Buffer.from(b64, "base64url").toString();
  } catch {
    return null;
  }
  const sep = payload.indexOf(":");
  if (sep < 1) return null;
  const exp = payload.slice(0, sep);
  const email = payload.slice(sep + 1);
  if (!exp || !email || Date.now() > Number(exp)) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return { email };
}

// Parse the session token from a request: Bearer header or the session cookie.
export function tokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.headers.cookie || "";
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join("="));
  }
  return "";
}
