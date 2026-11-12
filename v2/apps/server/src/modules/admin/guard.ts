// One admin check for every route flagged `config: { admin: true }` (legacy requireAdmin, ADR 015).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { User } from "../../platform/models.js";

declare module "fastify" { interface FastifyContextConfig { admin?: boolean } }

const fail = (req: FastifyRequest, reply: FastifyReply, status: number, code: string, message: string) =>
  reply.status(status).send({ error: { code, message, requestId: req.id } });

export function registerAdminGuard(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    if (req.routeOptions.config?.admin !== true) return;
    const user: any = await User.findOne({ email: req.user?.email, active: true }).lean();
    if (!user) return fail(req, reply, 401, "UNAUTHORIZED", "Unauthorized");
    if (user.role !== "admin") return fail(req, reply, 403, "FORBIDDEN", "Admin-Zugriff erforderlich");
  });
}
