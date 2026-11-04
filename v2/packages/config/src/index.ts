// Runtime configuration for OC v2 — parsed once, validated, immutable.
// ADR 001: production data is never written by development or test work. The guard below
// makes that a property of the code, not of discipline: outside NODE_ENV=production the app
// refuses any MongoDB host that is not this machine.
import { z } from "zod";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Hostnames contained in a MongoDB connection string (handles seed lists and mongodb+srv). */
export function mongoHosts(uri: string): string[] {
  const m = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri.trim());
  if (!m?.[1]) throw new Error("MONGODB_URI is not a mongodb:// or mongodb+srv:// URI");
  return m[1].split(",").map((h) => {
    const host = h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]!;
    return host.toLowerCase();
  });
}

export function isLocalMongo(uri: string): boolean {
  if (/^mongodb\+srv:/i.test(uri.trim())) return false; // SRV always resolves remotely
  return mongoHosts(uri).every((h) => LOCAL_HOSTS.has(h));
}

/** Masks credentials so a URI can appear in logs/errors. */
export function redactUri(uri: string): string {
  return uri.replace(/\/\/([^:@/]+):[^@]*@/, "//$1:***@");
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("127.0.0.1"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27018"),
  MONGODB_DB: z.string().min(1).default("KonfiguratorDB"),
  /** Defence in depth: when true, every Mongoose write throws (used for prod read-only tooling). */
  DB_READONLY: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((v) => v === "1" || v === "true"),
  /** Optional GlitchTip / Sentry DSN — errors are always logged; this adds aggregation. */
  ERROR_TRACKING_DSN: z.string().url().optional(),
  BUILD_ID: z.string().default("dev"),
});

export type AppConfig = Readonly<z.infer<typeof EnvSchema>>;

export class UnsafeDatabaseError extends Error {
  override name = "UnsafeDatabaseError";
}

/**
 * Parse and validate the environment. Throws (process should exit) when invalid or when a
 * non-production process points at a non-local database.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid configuration — ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV !== "production" && !isLocalMongo(cfg.MONGODB_URI)) {
    throw new UnsafeDatabaseError(
      `Refusing to start: NODE_ENV=${cfg.NODE_ENV} but MONGODB_URI points at a remote host ` +
        `(${redactUri(cfg.MONGODB_URI)}). Development and tests run only against the local replica ` +
        `(scripts/replica). See docs/rewrite/DECISIONS.md ADR 001.`,
    );
  }
  return Object.freeze(cfg);
}
