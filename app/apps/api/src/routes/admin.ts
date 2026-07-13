// Admin-only endpoints. Guarded by requireAuth + requireAdmin.
// Minimal first slice: a summary the Home admin panel can display.
import { Router, type Request, type Response } from "express";
import { requireAuth, requireAdmin } from "../middleware/authGate.js";
import User from "../models/User.js";

const router = Router();

router.use(requireAuth, requireAdmin);

// GET /api/admin/summary — lightweight stats for the admin panel.
router.get("/summary", async (_req: Request, res: Response) => {
  const [total, active, admins] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ active: true }),
    User.countDocuments({ role: "admin" }),
  ]);
  res.json({ users: { total, active, admins } });
});

export default router;
