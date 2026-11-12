// Admin area: one guard for admin-only routes, then settings, logs and users.
import type { FastifyInstance } from "fastify";
import type { BusinessConfig } from "../../platform/business-config.js";
import { registerAdminGuard } from "./guard.js";
import { registerAdminLogs } from "./logs.js";
import { registerAdminSettings } from "./settings.js";
import { registerUsers } from "./users.js";

export async function registerAdmin(app: FastifyInstance, deps: { businessConfig: BusinessConfig; authSecret: string; secureCookie: boolean }) {
  registerAdminGuard(app);
  await registerUsers(app);
  await registerAdminSettings(app, deps);
  await registerAdminLogs(app);
}
