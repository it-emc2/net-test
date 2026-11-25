// U-070 (owner 2026-11-25): an admin cannot take the own admin role away or deactivate the own
// account, and no save may leave the app without an active admin — checked on the server
// (POST /admin/api/users), not only by the admin page. In-memory MongoDB, made-up users.
import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { createToken, hashPassword } from "../src/platform/auth.js";
import { connectDb, disconnectDb } from "../src/platform/db.js";
import { registerAdminGuard } from "../src/modules/admin/guard.js";
import { lockoutOf, registerUsers } from "../src/modules/admin/users.js";
import { User } from "../src/platform/models.js";

const SECRET = "admin-lockout-test-secret-0123456789";
let mongod: MongoMemoryServer;
let app: FastifyInstance;
const as = (email: string) => ({ authorization: `Bearer ${createToken(email, SECRET)}` });
const save = (by: string, body: object) => app.inject({ method: "POST", url: "/admin/api/users", headers: as(by), payload: body });
const stored = async (email: string) => (await User.findOne({ email }).lean()) as any;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const cfg = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", AUTH_SECRET: SECRET });
  await connectDb(cfg, { info: () => {} });
  app = await buildApp(cfg, { register: async (a) => { registerAdminGuard(a); await registerUsers(a); } });
}, 120000);
afterAll(async () => { await app?.close(); await disconnectDb(); await mongod?.stop(); });
beforeEach(async () => {
  await User.deleteMany({});
  await User.create([
    { email: "ao@test.local", firstName: "A", lastName: "O", name: "A O", role: "admin", active: true, passwordHash: hashPassword("pw-ao") },
    { email: "rf@test.local", firstName: "R", lastName: "F", name: "R F", role: "admin", active: true, passwordHash: hashPassword("pw-rf") },
    { email: "tr@test.local", firstName: "T", lastName: "R", name: "T R", role: "user", active: true, passwordHash: hashPassword("pw-tr") },
  ]);
});

describe("POST /admin/api/users — no admin locks themselves or everyone out", () => {
  it("own admin role taken away → 409 with the admin page's text, nothing stored", async () => {
    const r = await save("ao@test.local", { email: "ao@test.local", firstName: "A", lastName: "O", role: "user" });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatchObject({ code: "ADMIN_SELF_DEMOTE", message: "Sie können sich die eigene Admin-Rolle nicht entziehen." });
    expect((await stored("ao@test.local")).role).toBe("admin");
  });

  it("own account deactivated → 409, still active (e-mail compared case-insensitively)", async () => {
    const r = await save("AO@test.local", { email: "Ao@Test.local", firstName: "A", lastName: "O", role: "admin", active: false });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatchObject({ code: "ADMIN_SELF_DEACTIVATE", message: "Sie können Ihr eigenes Konto nicht deaktivieren." });
    expect((await stored("ao@test.local")).active).toBe(true);
  });

  it("own record saved unchanged (names, password) still works", async () => {
    const r = await save("ao@test.local", { email: "ao@test.local", firstName: "A2", lastName: "O", role: "admin", password: "neu" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true, email: "ao@test.local" });
    expect((await stored("ao@test.local")).firstName).toBe("A2");
  });

  it("another admin may be demoted or deactivated while an active admin remains", async () => {
    expect((await save("ao@test.local", { email: "rf@test.local", firstName: "R", lastName: "F", role: "user" })).statusCode).toBe(200);
    expect((await stored("rf@test.local")).role).toBe("user");
    expect((await save("ao@test.local", { email: "tr@test.local", firstName: "T", lastName: "R", role: "user", active: false })).statusCode).toBe(200);
    expect((await stored("tr@test.local")).active).toBe(false);
  });

  it("refused when it would leave no active admin (the rule itself: through the route the requester is always an active admin)", async () => {
    await User.updateOne({ email: "ao@test.local" }, { $set: { active: false } });
    const rf = await stored("rf@test.local"); // now the only active admin
    expect(await lockoutOf("rf@test.local", "ao@test.local", rf, { role: "user", active: true })).toEqual({ code: "ADMIN_LAST", message: "Das ist nicht möglich: Es muss mindestens ein aktiver Admin bleiben." });
    expect(await lockoutOf("rf@test.local", "ao@test.local", rf, { role: "admin", active: false })).toMatchObject({ code: "ADMIN_LAST" });
    expect(await lockoutOf("rf@test.local", "ao@test.local", rf, { role: "admin", active: true })).toBeNull();
    const tr = await stored("tr@test.local");
    expect(await lockoutOf("tr@test.local", "ao@test.local", tr, { role: "user", active: false })).toBeNull(); // not an admin
    await User.updateOne({ email: "ao@test.local" }, { $unset: { active: "" } }); // no flag counts as active
    expect(await lockoutOf("rf@test.local", "ao@test.local", rf, { role: "user", active: true })).toBeNull();
  });

  it("there is no delete route for users (owner: deactivate only)", async () => {
    const r = await app.inject({ method: "DELETE", url: "/admin/api/users/tr@test.local", headers: as("ao@test.local") });
    expect(r.statusCode).toBe(404);
  });
});
