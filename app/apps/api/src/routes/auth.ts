// login/logout/me for named users. Behaviour matches the legacy route.
import { Router, type Request, type Response } from "express";
import type { LoginResponse, MeResponse, PublicUser, UserRole } from "@emc2/shared";
import User from "../models/User.js";
import {
  verifyPassword,
  createToken,
  verifyToken,
  tokenFromReq,
  SESSION_COOKIE,
} from "../services/authService.js";
import { env } from "../config/env.js";

const router = Router();

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    maxAge: 12 * 60 * 60 * 1000,
    path: "/",
  });
}

function toPublicUser(u: {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}): PublicUser {
  return {
    email: u.email,
    name: u.name ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    role: (u.role as UserRole) ?? "user",
  };
}

// POST /api/auth/login  { email, password }
router.post("/login", async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "E-Mail und Passwort erforderlich" });
    }

    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "E-Mail oder Passwort falsch" });
    }

    const token = createToken(email);
    setSessionCookie(res, token);
    user.lastLoginAt = new Date();
    await user.save();

    const body: LoginResponse = { token, user: toPublicUser(user) };
    return res.json(body);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("POST /api/auth/login failed:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/auth/logout
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", async (req: Request, res: Response) => {
  const t = verifyToken(tokenFromReq(req));
  if (!t) return res.status(401).json({ error: "Unauthorized" });
  const user = await User.findOne({ email: t.email, active: true }).lean();
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const body: MeResponse = { user: toPublicUser(user) };
  return res.json(body);
});

export default router;
