import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "@oc/config";
import { buildApp } from "../src/app.js";
import { connectDb, disconnectDb, ReadOnlyDatabaseError } from "../src/db.js";

const silentLog = { info: () => {} };

describe("app without database", () => {
  it("health reports 503 + disconnected, version answers", async () => {
    const app = await buildApp(loadConfig({ LOG_LEVEL: "silent", BUILD_ID: "t1" }));
    const h = await app.inject({ url: "/api/health" });
    expect(h.statusCode).toBe(503);
    expect(h.json()).toMatchObject({ ok: false, db: "disconnected" });
    expect(h.headers["x-request-id"]).toBeTruthy();
    expect((await app.inject({ url: "/api/version" })).json()).toEqual({ buildId: "t1" });
    await app.close();
  });

  it("unknown route → JSON 404 with request id", async () => {
    const app = await buildApp(loadConfig({ LOG_LEVEL: "silent" }));
    const r = await app.inject({ url: "/nope", headers: { "x-request-id": "abcdef123456" } });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: { code: "NOT_FOUND", message: "Nicht gefunden", requestId: "abcdef123456" } });
    await app.close();
  });

  it("500s are reported, logged and never leak internals", async () => {
    const reported: unknown[] = [];
    const app = await buildApp(loadConfig({ LOG_LEVEL: "silent" }), {
      reporter: (err) => reported.push(err),
      register: (a) => { a.get("/boom", async () => { throw new Error("secret stack detail"); }); },
    });
    const r = await app.inject({ url: "/boom" });
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain("secret stack detail");
    expect(r.json().error.code).toBe("INTERNAL");
    expect(reported).toHaveLength(1);
    await app.close();
  });
});

describe("database", () => {
  let mongod: MongoMemoryServer;
  beforeAll(async () => { mongod = await MongoMemoryServer.create(); });
  afterAll(async () => { await disconnectDb(); await mongod?.stop(); });

  it("connects with autoIndex/autoCreate off; health 200", async () => {
    const cfg = loadConfig({ LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t" });
    await connectDb(cfg, silentLog);
    expect(mongoose.get("autoIndex")).toBe(false);
    expect(mongoose.get("autoCreate")).toBe(false);
    const app = await buildApp(cfg);
    expect((await app.inject({ url: "/api/health" })).statusCode).toBe(200);
    await app.close();

    // a model with an index must NOT build it implicitly
    const M = mongoose.model("IdxProbe", new mongoose.Schema({ k: { type: String, index: true, unique: true } }));
    await M.collection.insertOne({ k: "a" }); // raw insert creates the collection only
    await new Promise((r) => setTimeout(r, 300));
    const idx = await M.collection.indexes();
    expect(idx.map((i) => i.name)).toEqual(["_id_"]);
    await disconnectDb();
  });

  it("DB_READONLY blocks every write path", async () => {
    const cfg = loadConfig({ LOG_LEVEL: "silent", MONGODB_URI: mongod.getUri(), MONGODB_DB: "t", DB_READONLY: "1" });
    await connectDb(cfg, silentLog);
    const R = mongoose.model("RoProbe", new mongoose.Schema({ k: String }));
    await expect(R.create({ k: "x" })).rejects.toBeInstanceOf(ReadOnlyDatabaseError);
    await expect(R.updateOne({}, { k: "y" })).rejects.toBeInstanceOf(ReadOnlyDatabaseError);
    await expect(R.deleteMany({})).rejects.toBeInstanceOf(ReadOnlyDatabaseError);
    await expect(R.findOneAndUpdate({}, { k: "z" })).rejects.toBeInstanceOf(ReadOnlyDatabaseError);
    await expect(R.insertMany([{ k: "a" }])).rejects.toBeInstanceOf(ReadOnlyDatabaseError);
    await expect(R.bulkWrite([{ insertOne: { document: { k: "b" } } }])).rejects.toBeInstanceOf(ReadOnlyDatabaseError);
    // reads still work
    await expect(R.find().lean()).resolves.toEqual([]);
  });
});
