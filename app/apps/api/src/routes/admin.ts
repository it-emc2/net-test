// Admin-only endpoints. Guarded by requireAuth + requireAdmin.
import { Router, type Request, type Response } from "express";
import type {
  AdminUser,
  CreateUserRequest,
  UpdateUserRequest,
  UserRole,
} from "@emc2/shared";
import { requireAuth, requireAdmin } from "../middleware/authGate.js";
import User, { type UserDoc } from "../models/User.js";
import { hashPassword } from "../services/authService.js";

const router = Router();

router.use(requireAuth, requireAdmin);

function isRole(v: unknown): v is UserRole {
  return v === "admin" || v === "user";
}

function toAdminUser(u: UserDoc & { _id: unknown; createdAt?: Date }): AdminUser {
  return {
    id: String(u._id),
    email: u.email,
    name: u.name ?? "",
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    role: (u.role as UserRole) ?? "user",
    active: u.active ?? true,
    lastLoginAt: u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : null,
    createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
  };
}

function fullName(firstName: string, lastName: string): string {
  return [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(" ");
}

// GET /api/admin/summary — lightweight stats for the admin panel.
router.get("/summary", async (_req: Request, res: Response) => {
  const [total, active, admins] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ active: true }),
    User.countDocuments({ role: "admin" }),
  ]);
  res.json({ users: { total, active, admins } });
});

// GET /api/admin/users — all users, newest first.
router.get("/users", async (_req: Request, res: Response) => {
  const users = await User.find({}).sort({ createdAt: -1 }).lean();
  res.json({ users: users.map((u) => toAdminUser(u as never)) });
});

// POST /api/admin/users — create a user.
router.post("/users", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<CreateUserRequest>;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const role: UserRole = isRole(body.role) ? body.role : "user";
  const active = body.active !== false;

  if (!email) return res.status(400).json({ error: "E-Mail ist erforderlich" });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
  }

  const exists = await User.findOne({ email }).lean();
  if (exists) return res.status(409).json({ error: "Diese E-Mail ist bereits vergeben" });

  const created = await User.create({
    email,
    firstName,
    lastName,
    name: fullName(firstName, lastName),
    role,
    active,
    passwordHash: hashPassword(password),
  });

  return res.status(201).json({ user: toAdminUser(created.toObject() as never) });
});

// PATCH /api/admin/users/:id — update fields; password only if provided.
router.patch("/users/:id", async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden" });

  const body = (req.body ?? {}) as UpdateUserRequest;

  // Guard against locking yourself out.
  const isSelf = user.email === req.user?.email;
  if (isSelf && body.active === false) {
    return res.status(400).json({ error: "Sie können Ihr eigenes Konto nicht deaktivieren" });
  }
  if (isSelf && isRole(body.role) && body.role !== "admin") {
    return res.status(400).json({ error: "Sie können sich nicht selbst herabstufen" });
  }

  if (typeof body.firstName === "string") user.firstName = body.firstName.trim();
  if (typeof body.lastName === "string") user.lastName = body.lastName.trim();
  if (typeof body.firstName === "string" || typeof body.lastName === "string") {
    user.name = fullName(user.firstName ?? "", user.lastName ?? "");
  }
  if (isRole(body.role)) user.role = body.role;
  if (typeof body.active === "boolean") user.active = body.active;
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
    }
    user.passwordHash = hashPassword(body.password);
  }

  await user.save();
  return res.json({ user: toAdminUser(user.toObject() as never) });
});

export default router;
