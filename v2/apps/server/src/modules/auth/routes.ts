// Login, logout, session check and password confirmation (legacy /api/auth/*; contract test).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LoginResponse, MeResponse, PublicUser } from "@oc/api-contract";
import {
  clearSessionCookie, createToken, sessionCookie, shouldRefresh, tokenFromHeaders, verifyPassword, verifyToken,
} from "../../platform/auth.js";
import { User } from "../../platform/models.js";

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });
const publicUser = (u: any): PublicUser => ({ email: u.email, name: u.name, firstName: u.firstName, lastName: u.lastName, role: u.role });

export async function registerAuth(app: FastifyInstance, d: { authSecret: string; secureCookie: boolean }) {
  const cfg = { AUTH_SECRET: d.authSecret };
  const { secureCookie } = d;
  app.post("/api/auth/login", { config: { public: true } }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || !password) return fail(req, reply, 400, "BAD_REQUEST", "E-Mail und Passwort erforderlich");
    const user = await User.findOne({ email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return fail(req, reply, 401, "INVALID_CREDENTIALS", "E-Mail oder Passwort falsch");
    }
    const token = createToken(email, cfg.AUTH_SECRET);
    reply.header("set-cookie", sessionCookie(token, secureCookie));
    user.lastLoginAt = new Date();
    await user.save();
    return { token, user: publicUser(user) } satisfies LoginResponse;
  });

  app.post("/api/auth/logout", { config: { public: true } }, async (_req, reply) => {
    reply.header("set-cookie", clearSessionCookie());
    return { ok: true };
  });

  app.get("/api/auth/me", { config: { public: true } }, async (req, reply) => {
    const raw = tokenFromHeaders(req.headers);
    const t = verifyToken(raw, cfg.AUTH_SECRET);
    if (!t) return fail(req, reply, 401, "UNAUTHORIZED", "Unauthorized");
    const user = (await User.findOne({ email: t.email, active: true }).lean()) as any;
    if (!user) return fail(req, reply, 401, "UNAUTHORIZED", "Unauthorized");
    if (shouldRefresh(raw)) reply.header("set-cookie", sessionCookie(createToken(user.email, cfg.AUTH_SECRET), secureCookie));
    return { user: publicUser(user) } satisfies MeResponse;
  });

  app.post("/api/auth/confirm-password", async (req, reply) => {
    const password = String(((req.body ?? {}) as Record<string, unknown>).password || "");
    if (!password) return fail(req, reply, 400, "BAD_REQUEST", "Passwort erforderlich");
    const user = await User.findOne({ email: req.user!.email, active: true });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      req.log.warn({ email: req.user!.email }, "confirm-password failed");
      return fail(req, reply, 401, "INVALID_CREDENTIALS", "Passwort falsch");
    }
    return { ok: true, email: user.email, name: user.name || "" };
  });
}
