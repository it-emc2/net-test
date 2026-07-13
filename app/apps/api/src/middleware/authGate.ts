// Auth middleware for the JSON API. Unlike the legacy monolith (which also
// served HTML and redirected browser navigations), the new API is pure JSON:
// unauthenticated requests always get 401. The web client handles redirects.
import type { Request, Response, NextFunction } from "express";
import { verifyToken, tokenFromReq } from "../services/authService.js";
import User from "../models/User.js";

/** Require a valid session; attaches req.user. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const t = verifyToken(tokenFromReq(req));
  if (!t) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = t;
  next();
}

/** Require the authenticated user to have the admin role. Runs after requireAuth. */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const email = req.user?.email;
  if (!email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await User.findOne({ email, active: true }).lean();
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
