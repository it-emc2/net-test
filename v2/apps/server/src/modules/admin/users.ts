// Users: the Ansprechpartner list for every logged-in user and user management for admins
// (legacy src/routes/users.js and admin.js; contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hashPassword } from "../../platform/auth.js";
import { User } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

export async function registerUsers(app: FastifyInstance) {
  // ---------------- users (Ansprechpartner list) ----------------
  app.get("/api/users", async () => {
    const users: any[] = await User.find({ active: true, signatureDataUrl: { $exists: true, $ne: "" } })
      .sort({ firstName: 1, lastName: 1, email: 1 }).lean();
    return users.map((u) => ({
      email: u.email, firstName: u.firstName || "", lastName: u.lastName || "",
      name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.name || u.email, hasSignature: !!u.signatureDataUrl,
    }));
  });

  app.get("/admin/api/users", { config: { admin: true } }, async () => {
    const users: any[] = await User.find({}).sort({ firstName: 1, lastName: 1, email: 1 }).lean();
    return users.map((u) => ({
      email: u.email, firstName: u.firstName || "", lastName: u.lastName || "", name: u.name || "",
      role: u.role || "user", active: u.active !== false, hasSignature: !!u.signatureDataUrl,
    }));
  });

  app.post("/admin/api/users", { config: { admin: true } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, any>;
    const email = String(b.email || "").trim().toLowerCase();
    if (!email) return fail(req, reply, 400, "BAD_REQUEST", "E-Mail erforderlich");
    const firstName = String(b.firstName || "").trim();
    const lastName = String(b.lastName || "").trim();
    const set: Record<string, unknown> = {
      firstName, lastName, name: `${firstName} ${lastName}`.trim(), role: b.role === "admin" ? "admin" : "user", active: b.active !== false,
    };
    if (b.password) set.passwordHash = hashPassword(String(b.password));
    const existing = await User.findOne({ email });
    if (!existing && !b.password) return fail(req, reply, 400, "BAD_REQUEST", "Passwort für neuen Benutzer erforderlich");
    const doc = await User.findOneAndUpdate({ email }, { $set: set }, { upsert: true, new: true, setDefaultsOnInsert: true });
    req.log.info({ email, by: req.user?.email }, "admin user upserted");
    return { ok: true, email: doc!.email };
  });

  app.post("/admin/api/users/:email/signature", { config: { admin: true }, bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const email = String((req.params as { email: string }).email || "").trim().toLowerCase();
    const dataUrl = String(((req.body ?? {}) as Record<string, unknown>).dataUrl || "");
    if (dataUrl && !/^data:image\/(png|jpeg);base64,/.test(dataUrl)) return fail(req, reply, 400, "BAD_REQUEST", "Ungültiges Bildformat (PNG/JPEG erwartet)");
    const doc = await User.findOneAndUpdate({ email }, { $set: { signatureDataUrl: dataUrl } }, { new: true });
    if (!doc) return fail(req, reply, 404, "NOT_FOUND", "Benutzer nicht gefunden");
    return { ok: true, hasSignature: !!doc.signatureDataUrl };
  });

  app.get("/admin/api/users/:email/signature", { config: { admin: true } }, async (req, reply) => {
    const email = String((req.params as { email: string }).email || "").trim().toLowerCase();
    const u: any = await User.findOne({ email }).lean();
    if (!u) return fail(req, reply, 404, "NOT_FOUND", "Benutzer nicht gefunden");
    return { dataUrl: u.signatureDataUrl || "" };
  });
}
