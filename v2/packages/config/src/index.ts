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
  /** Separate read-only "vigor" database; defaults to MONGODB_URI (legacy behaviour). */
  VIGOR_MONGODB_URI: z.string().min(1).optional(),
  /** Defence in depth: when true, every Mongoose write throws (used for prod read-only tooling). */
  DB_READONLY: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((v) => v === "1" || v === "true"),
  /** Optional GlitchTip / Sentry DSN — errors are always logged; this adds aggregation. */
  ERROR_TRACKING_DSN: z.string().url().optional(),
  BUILD_ID: z.string().default("dev"),
  /** HMAC secret for session tokens — same value as the legacy app keeps sessions valid across cut-over. */
  AUTH_SECRET: z.string().min(16).default("dev-only-auth-secret-change-me"),
  /** Fallback Ansprechpartner (legacy AP_DEFAULT_EMAIL). */
  AP_DEFAULT_EMAIL: z.string().optional(),
  /** Legacy-compatible session cookie flags. */
  COOKIE_SECURE: z.enum(["0", "1", "true", "false"]).optional().transform((v) => v === undefined ? undefined : v === "1" || v === "true"),
  /** Bitrix24 inbound webhook base (…/rest/<user>/<token>). No hard-coded fallback (legacy had one). */
  BITRIX_WEBHOOK_BASE: z.string().url().optional(),
  /** Minimum gap between Bitrix calls (legacy BX_MIN_GAP_MS = 1000). */
  BITRIX_MIN_GAP_MS: z.coerce.number().int().min(0).default(1000),
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
  if (cfg.NODE_ENV !== "production" && cfg.VIGOR_MONGODB_URI && !isLocalMongo(cfg.VIGOR_MONGODB_URI)) {
    throw new UnsafeDatabaseError(
      `Refusing to start: VIGOR_MONGODB_URI points at a remote host (${redactUri(cfg.VIGOR_MONGODB_URI)}) outside production.`,
    );
  }
  // Same idea as the DB guard: dev/test must never reach the real CRM (it would change deals).
  if (cfg.NODE_ENV !== "production" && cfg.BITRIX_WEBHOOK_BASE && !LOCAL_HOSTS.has(new URL(cfg.BITRIX_WEBHOOK_BASE).hostname.toLowerCase())) {
    throw new UnsafeDatabaseError(
      `Refusing to start: NODE_ENV=${cfg.NODE_ENV} but BITRIX_WEBHOOK_BASE points at a remote host ` +
        `(${new URL(cfg.BITRIX_WEBHOOK_BASE).hostname}). Outside production only a local Bitrix stub is allowed.`,
    );
  }
  if (cfg.NODE_ENV === "production" && (cfg.AUTH_SECRET.startsWith("dev-only") || cfg.AUTH_SECRET.length < 32)) {
    throw new Error("Refusing to start: AUTH_SECRET must be set (≥ 32 chars) in production — no insecure fallback.");
  }
  return Object.freeze(cfg);
}
