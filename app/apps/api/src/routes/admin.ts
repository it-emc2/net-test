// Admin-only endpoints. Guarded by requireAuth + requireAdmin.
import { Router, type Request, type Response } from "express";
import type {
  AdminUser,
  CreateUserRequest,
  UpdateUserRequest,
  UserRole,
  OptionalCategoryDef,
  OptionalCatalogAdminResponse,
} from "@emc2/shared";
import { requireAuth, requireAdmin } from "../middleware/authGate.js";
import User, { type UserDoc } from "../models/User.js";
import { hashPassword } from "../services/authService.js";
import OptionalCategory from "../models/OptionalCategory.js";
import { OPTIONAL_CATALOG_SEED } from "../data/optionalCatalog.js";
import { resolvePrices } from "../services/catalog.js";
import { getVigorDb } from "../config/vigor.js";

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

// --- Optional catalog management ---

function normalizeCatalog(input: any): OptionalCategoryDef[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((c) => c && typeof c.id === "string" && c.id.trim())
    .map((c, ci) => ({
      id: String(c.id).trim(),
      label: String(c.label || c.id).trim(),
      order: Number.isFinite(Number(c.order)) ? Number(c.order) : ci,
      selection: c.selection === "single" ? "single" : "multi",
      special: c.special === "sonder" ? "sonder" : undefined,
      items: Array.isArray(c.items)
        ? c.items
            .filter((it: any) => it && typeof it.productId === "string" && it.productId.trim())
            .map((it: any) => ({
              productId: String(it.productId).trim(),
              manual:
                it.manual && it.manual.name
                  ? { name: String(it.manual.name), price: Number(it.manual.price) || 0 }
                  : null,
              defaultQty: Number.isFinite(Number(it.defaultQty)) ? Number(it.defaultQty) : 1,
              companions: Array.isArray(it.companions)
                ? it.companions
                    .filter((co: any) => co && typeof co.productId === "string" && co.productId.trim())
                    .map((co: any) => ({
                      productId: String(co.productId).trim(),
                      qtyRatio: Number(co.qtyRatio) > 0 ? Number(co.qtyRatio) : 1,
                    }))
                : [],
            }))
        : [],
    }));
}

// GET /api/admin/optional — raw catalog defs (DB or seed) + resolved name/price/image.
router.get("/optional", async (_req: Request, res: Response) => {
  const dbCats = (await OptionalCategory.find({}).sort({ order: 1 }).lean()) as unknown as OptionalCategoryDef[];
  const fromSeed = dbCats.length === 0;
  const categories = fromSeed ? OPTIONAL_CATALOG_SEED.slice().sort((a, b) => a.order - b.order) : dbCats;

  const ids = new Set<string>();
  for (const c of categories) for (const it of c.items ?? []) {
    ids.add(it.productId);
    for (const co of it.companions ?? []) ids.add(co.productId);
  }
  const idList = [...ids];
  const priced = await resolvePrices(idList);
  const resolved: Record<string, { name: string; netPrice: number; image: string | null }> = {};
  for (const id of idList) {
    const r = priced.get(id);
    resolved[id] = { name: r?.name || id, netPrice: r?.netPrice ?? 0, image: null };
  }
  try {
    const db = await getVigorDb();
    const docs = await db
      .collection("products")
      .find({ articleNumber: { $in: idList } }, { projection: { articleNumber: 1, images: 1 } })
      .toArray();
    for (const d of docs) {
      const a = d.articleNumber as string;
      if (resolved[a]) resolved[a].image = Array.isArray(d.images) && d.images.length ? d.images[0] : null;
    }
  } catch {
    /* no images */
  }

  const body: OptionalCatalogAdminResponse = { categories, resolved, fromSeed };
  res.json(body);
});

// PUT /api/admin/optional — replace the whole catalog.
router.put("/optional", async (req: Request, res: Response) => {
  const categories = normalizeCatalog(req.body?.categories);
  if (!categories.length) return res.status(400).json({ error: "Mindestens eine Kategorie erforderlich" });
  const ids = categories.map((c) => c.id);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "Doppelte Kategorie-IDs" });

  await OptionalCategory.deleteMany({});
  await OptionalCategory.insertMany(categories);
  return res.json({ ok: true, count: categories.length });
});

export default router;
