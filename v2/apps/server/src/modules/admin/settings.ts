// Admin login and business settings (legacy src/routes/admin.js; contract test). The "public"
// settings subset requires a login (ADR 015; legacy: reachable without session).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createToken, sessionCookie, verifyPassword } from "../../platform/auth.js";
import { CONFIG_SCHEMA, type BusinessConfig } from "../../platform/business-config.js";
import { AppConfig, User } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

const PUBLIC_CONFIG_KEYS = [
  "ENTLASTUNGSBETRAG_MONAT", "VERHINDERUNGSPFLEGE_JAHR", "PFLEGESACHLEISTUNG_UMWIDMUNG_MAX_PCT", "STEUERABSETZ_PCT",
  "STEUERABSETZ_CAP_JAHR", "BWT_TRAVEL_TIME_FREE_HOURS", "BWT_KM_FREE_THRESHOLD", "FAHRZEUGBEREITSTELLUNG", "WERKZEUG",
  "BERAEUMUNG", "WV_OWN_LAGER", "WV_LEFTOVER_USABLE_PERCENT", "WV_LEFTOVER_MIN_M2", "GRAB_BONUS_IDS",
  "NEUKUNDENBONUS_BRUTTO", "NEUKUNDENBONUS_SCHWELLE", "BU_SHOW_DA_HASSMANN",
];

export async function registerAdminSettings(
  app: FastifyInstance,
  deps: { businessConfig: BusinessConfig; authSecret: string; secureCookie: boolean },
) {
  const { businessConfig, authSecret, secureCookie } = deps;
  const writeConfig = async (key: string, value: unknown) => {
    await AppConfig.findOneAndUpdate({ key }, { $set: { value } }, { upsert: true });
  };

  // ---------------- admin ----------------
  app.post("/admin/api/login", { config: { public: true } }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!email || !password) return fail(req, reply, 400, "BAD_REQUEST", "E-Mail und Passwort erforderlich");
    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) return fail(req, reply, 401, "INVALID_CREDENTIALS", "E-Mail oder Passwort falsch");
    if (user.role !== "admin") return fail(req, reply, 403, "FORBIDDEN", "Kein Admin-Zugriff für dieses Konto");
    const token = createToken(email, authSecret);
    reply.header("set-cookie", sessionCookie(token, secureCookie));
    user.lastLoginAt = new Date();
    await user.save();
    return { token, user: { email: user.email, name: user.name, role: user.role } };
  });

  app.get("/admin/api/config/public", async () => {
    const result: Record<string, unknown> = {};
    for (const key of PUBLIC_CONFIG_KEYS) result[key] = businessConfig.get(key);
    for (const { key } of CONFIG_SCHEMA) if (key.startsWith("AZ_MIN_")) result[key] = businessConfig.get(key);
    return result;
  });

  app.get("/admin/api/config", { config: { admin: true } }, async () => {
    const docs: any[] = await AppConfig.find({}).lean();
    const map = new Map(docs.map((d) => [d.key, d.value]));
    return CONFIG_SCHEMA.map((def) => ({
      key: def.key, label: def.label, description: def.description || "", note: def.note || "", unit: def.unit || "",
      type: def.type, section: def.section, order: def.order, defaultValue: def.value,
      value: map.has(def.key) ? map.get(def.key) : def.value,
    }));
  });

  app.put("/admin/api/config", { config: { admin: true } }, async (req, reply) => {
    const updates = req.body;
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) return fail(req, reply, 400, "BAD_REQUEST", "Body muss ein Objekt sein");
    const valid = new Set(CONFIG_SCHEMA.map((d) => d.key));
    const filtered = Object.fromEntries(Object.entries(updates).filter(([k]) => valid.has(k)));
    await businessConfig.setMany(filtered, writeConfig);
    req.log.info({ keys: Object.keys(filtered), by: req.user?.email }, "admin config updated");
    return { ok: true, updated: Object.keys(filtered).length };
  });

  app.post("/admin/api/config/reset", { config: { admin: true } }, async (req, reply) => {
    const { key } = (req.body ?? {}) as { key?: string };
    const def = CONFIG_SCHEMA.find((d) => d.key === key);
    if (!def) return fail(req, reply, 404, "NOT_FOUND", "Unbekannter Key");
    await businessConfig.set(def.key, def.value, writeConfig);
    return { ok: true, key, value: def.value };
  });
}
