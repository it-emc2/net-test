// Read-only customer access for any logged-in user: paginated list + search,
// and a single detail record. Creation stays with the (future) offer flow.
import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";
import type { CustomerDetail, CustomerListItem } from "@emc2/shared";
import { requireAuth } from "../middleware/authGate.js";
import Customer, { type CustomerDoc } from "../models/Customer.js";

const router = Router();
router.use(requireAuth);

function escRegex(value = ""): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSearchFilter(q: string): Record<string, unknown> {
  const safe = escRegex(q.trim());
  const rx = new RegExp(safe, "i");
  return {
    $or: [
      { customerNumber: rx },
      { bitrixContactId: rx },
      { firstName: rx },
      { lastName: rx },
      { company: rx },
      { email: rx },
      { phone: rx },
      { city: rx },
      { street: rx },
      {
        $expr: {
          $regexMatch: {
            input: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$firstName", ""] },
                    " ",
                    { $ifNull: ["$lastName", ""] },
                  ],
                },
              },
            },
            regex: safe,
            options: "i",
          },
        },
      },
    ],
  };
}

type LeanCustomer = CustomerDoc & { _id: unknown; createdAt?: Date; updatedAt?: Date };

function toListItem(c: LeanCustomer): CustomerListItem {
  return {
    id: String(c._id),
    customerNumber: c.customerNumber ?? "",
    salutation: c.salutation ?? "",
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    company: c.company ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    street: c.street ?? "",
    city: c.city ?? "",
    postalCode: c.postalCode ?? "",
    country: c.country ?? "",
    sourceOfferType: c.sourceOfferType ?? "",
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
  };
}

// GET /api/customers?q=&page=1&pageSize=20 — browse (no q) or search.
router.get("/", async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || "").trim();
    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(String(req.query.pageSize || "20"), 10) || 20, 1), 100);
    const filter = q ? buildSearchFilter(q) : {};

    const [total, docs] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    res.json({
      items: (docs as LeanCustomer[]).map(toListItem),
      total,
      page,
      pageSize,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[customers] list error:", err);
    res.status(500).json({ error: "Fehler beim Laden der Kunden" });
  }
});

// GET /api/customers/:id — full detail.
router.get("/:id", async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: "Kunde nicht gefunden" });
  }
  const c = (await Customer.findById(req.params.id).lean()) as LeanCustomer | null;
  if (!c) return res.status(404).json({ error: "Kunde nicht gefunden" });

  const detail: CustomerDetail = {
    ...toListItem(c),
    state: c.state ?? "",
    bitrixContactId: c.bitrixContactId ?? "",
    kundendaten: (c.kundendaten as Record<string, unknown>) ?? {},
  };
  return res.json({ customer: detail });
});

export default router;
