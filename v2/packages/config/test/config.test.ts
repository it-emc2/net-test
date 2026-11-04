import { describe, expect, it } from "vitest";
import { isLocalMongo, loadConfig, mongoHosts, redactUri, UnsafeDatabaseError } from "../src/index.js";

describe("mongoHosts / isLocalMongo", () => {
  it.each([
    ["mongodb://127.0.0.1:27018", true],
    ["mongodb://localhost/KonfiguratorDB", true],
    ["mongodb://user:pw@127.0.0.1:27018/x?authSource=admin", true],
    ["mongodb://[::1]:27017", true],
    ["mongodb://127.0.0.1:27018,localhost:27019/?replicaSet=rs0", true],
    ["mongodb+srv://user:pw@emc2cluster.example.mongodb.net/", false],
    ["mongodb://127.0.0.1:27018,db.example.com:27017", false],
    ["mongodb://10.0.0.5:27017", false],
    ["mongodb://localhost.evil.com:27017", false],
  ])("%s → local=%s", (uri, local) => {
    expect(isLocalMongo(uri)).toBe(local);
  });

  it("rejects non-mongodb URIs", () => {
    expect(() => mongoHosts("postgres://localhost")).toThrow();
  });
});

describe("loadConfig", () => {
  it("defaults to the local replica", () => {
    const cfg = loadConfig({});
    expect(cfg.MONGODB_URI).toBe("mongodb://127.0.0.1:27018");
    expect(cfg.NODE_ENV).toBe("development");
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it.each(["development", "test"])("refuses a remote DB in %s", (NODE_ENV) => {
    expect(() =>
      loadConfig({ NODE_ENV, MONGODB_URI: "mongodb+srv://u:secret@cluster.mongodb.net/" }),
    ).toThrow(UnsafeDatabaseError);
  });

  it("never leaks the password in the guard message", () => {
    try {
      loadConfig({ MONGODB_URI: "mongodb+srv://u:topsecret@cluster.mongodb.net/" });
    } catch (e) {
      expect(String(e)).not.toContain("topsecret");
      expect(String(e)).toContain("u:***@");
    }
  });

  it("allows a remote DB only in production", () => {
    const cfg = loadConfig({ NODE_ENV: "production", MONGODB_URI: "mongodb+srv://u:p@cluster.mongodb.net/" });
    expect(cfg.NODE_ENV).toBe("production");
  });

  it("parses DB_READONLY and rejects garbage", () => {
    expect(loadConfig({ DB_READONLY: "1" }).DB_READONLY).toBe(true);
    expect(loadConfig({}).DB_READONLY).toBe(false);
    expect(() => loadConfig({ DB_READONLY: "maybe" })).toThrow(/DB_READONLY/);
  });

  it("redacts credentials", () => {
    expect(redactUri("mongodb://a:b@host/x")).toBe("mongodb://a:***@host/x");
  });
});
