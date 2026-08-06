// src/routes/auth.js — login/logout/me for named users.
import express from "express";
import User from "../models/User.js";
import {
  verifyPassword,
  createToken,
  verifyToken,
  tokenFromReq,
  SESSION_COOKIE,
} from "../services/authService.js";

const router = express.Router();

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

// POST /api/auth/login  { email, password }
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!email || !password) return res.status(400).json({ error: "E-Mail und Passwort erforderlich" });

    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "E-Mail oder Passwort falsch" });
    }

    const token = createToken(email);
    setSessionCookie(res, token);
    user.lastLoginAt = new Date();
    await user.save();

    return res.json({
      token,
      user: {
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("POST /api/auth/login failed:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", async (req, res) => {
  const t = verifyToken(tokenFromReq(req));
  if (!t) return res.status(401).json({ error: "Unauthorized" });
  const user = await User.findOne({ email: t.email, active: true }).lean();
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  res.json({
    user: {
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
});

export default router;
