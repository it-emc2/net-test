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
  /** A second offer type for the same customer (ADR 027 B): the pipeline (category) and stage a NEW deal is
   *  created in — „Neue Anfragen“ / „[VI] Neu“; a test system points these at a test pipeline. */
  SECOND_OFFER_CATEGORY_ID: z.coerce.number().int().min(0).default(72),
  SECOND_OFFER_STAGE_ID: z.string().trim().min(1).default("C72:NEW"),
  /** the deal's source (SOURCE_ID); "WEBFORM" is named „Bestandskunde“ in this Bitrix */
  SECOND_OFFER_SOURCE_ID: z.string().trim().min(1).default("WEBFORM"),
  /** provisional title; the automation rule of the entry stage writes the real one */
  SECOND_OFFER_TITLE: z.string().trim().min(1).default("Neuanfrage"),
  /** optional JSON override of SECOND_OFFER_DEAL_VALUES (merged per key), e.g. {"byType":{"bl":{"taetigkeiten":["4158"]}}} */
  SECOND_OFFER_VALUES_JSON: z.string().trim().optional().transform((v) => v || undefined),
  /** Optional deal field for "Material-Kürzel" (legacy: skipped until set). */
  BITRIX_FIELD_MATERIAL_CODES: z.string().trim().optional(),
  /** Base of the deal field "Angebotslink-oc" (not a secret; legacy default kept). */
  OFFER_LINK_BASE: z.string().url().default("https://oc.emc2.de"),
  /** Route-planning service; no hard-coded default (legacy had the production URL). */
  PLANNING_API_BASE_URL: z.string().url().optional(),
  PLANNING_API_KEY: z.string().optional(),
  /** Offer email (legacy names). Sending uses SMTP_SEND_PORT (legacy hard-coded 587). */
  SMTP_HOST: z.string().optional(),
  /** Legacy SMTP_PORT: smtp-test uses `|| 465`, the signing mails `|| 587` (so: no default here). */
  SMTP_PORT: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  /** Signing mails only (legacy: secure = SMTP_SECURE === "true"). */
  SMTP_SECURE: z.string().optional(),
  /** Bcc of the signing completion mail (legacy SIGNING_OFFICE_EMAIL). */
  SIGNING_OFFICE_EMAIL: z.string().optional(),
  SMTP_SEND_PORT: z.coerce.number().int().default(587),
  SMTP_EMAIL: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_REPLY_TO: z.string().optional(),
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().default(993),
  IMAP_PASS: z.string().optional(),
  IMAP_SENT_FOLDER: z.string().optional(),
  /** Base for links in customer emails (signing link); fallback: request host (legacy). */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** onlinebrief24 (letters by post). Production default URL only in production (client). */
  OB24_BASE_URL: z.string().url().optional(),
  OB24_API_KEY: z.string().optional(),
  OB24_API_SECRET: z.string().optional(),
  OB24_MODE: z.string().optional(),
  /** Distance suggestion (read-only public services; base URLs configurable for tests). */
  ORS_API_KEY: z.string().optional().transform((v) => v || undefined),
  COMPANY_ADDRESS: z.string().default("Kornhausacker 10, Hof"),
  COMPANY_LAT: z.string().optional(),
  COMPANY_LNG: z.string().optional(),
  /** Alltagshilfe (offer type ah): the route to the customer starts here instead (owner 2026-11-20). Without coordinates the address is geocoded like any other. */
  COMPANY_ADDRESS_AH: z.string().default("Waldstraße 5, 95030 Hof"),
  COMPANY_AH_LAT: z.string().optional(),
  COMPANY_AH_LNG: z.string().optional(),
  GEO_PHOTON_URL: z.string().url().default("https://photon.komoot.io"),
  GEO_NOMINATIM_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  GEO_ORS_URL: z.string().url().default("https://api.openrouteservice.org"),
  ROUTE_OSRM_URL: z.string().url().default("https://router.project-osrm.org"),
  /** Shared key for /api/offers/external/* (bau-formular). v2: required — unset means the routes are closed (legacy: open). */
  EXTERNAL_API_KEY: z.string().optional().transform((v) => v || undefined),
  /** Magic API (shower product search, read-only). Login credentials only, no production fallback. */
  EXTERNAL_API_BASE: z.string().optional().transform((v) => v || undefined),
  EXTERNAL_API_USER: z.string().optional(),
  EXTERNAL_API_PASSWORD: z.string().optional(),
  /** PDF engine (ADR 008): Gotenberg base URL (DOCX→PDF via LibreOffice, HTML→PDF via Chromium). */
  GOTENBERG_URL: z.string().url().default("http://127.0.0.1:3000"),
  GOTENBERG_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  /** Folder with today's UI files (legacy src/public). Default: the legacy app's. */
  WEB_PUBLIC_DIR: z.string().optional(),
  /** Folder that contains the document templates (`src/templates/…`, legacy layout). Default: the legacy app. */
  DOCUMENTS_ROOT: z.string().optional(),
  /** Static assets (email presets, signature picture). Default: the legacy app's assets. */
  ASSETS_DIR: z.string().optional(),
});

export type AppConfig = Readonly<z.infer<typeof EnvSchema>>;

// ---------------- a second offer type for the same customer (ADR 027 B) ----------------
/**
 * The values a new deal gets in Bitrix, per offer type (owner-confirmed 2026-11-20; enum ids of the
 * live deal fields). ONE table: change values here (or with SECOND_OFFER_VALUES_JSON), not in code.
 */
export const SECOND_OFFER_DEAL_VALUES = {
  fields: {
    /** „Kategorie Neu“ (enumeration, multiple, required) */
    kategorieNeu: "UF_CRM_1725458507816",
    /** „Auszuführende Tätigkeiten“ (enumeration, multiple, required) */
    taetigkeiten: "UF_CRM_1725521281342",
    /** „Zugehörigkeit“ (enumeration, single, required) */
    zugehoerigkeit: "UF_CRM_1764764902076",
    /** plain text, used by the title rule („von …“) */
    vonText: "UF_CRM_1736426014",
  },
  /** „Eigener Auftrag“ — always (owner), never copied from the first deal */
  zugehoerigkeit: "8158",
  byType: {
    /** Handwerkliche Dienstleistungen (Barrierefrei) / [HD] Badumbau */
    bu: { kategorieNeu: ["4334"], taetigkeiten: ["7730"] },
    /** … / [HD] Badewannentüre */
    bwt: { kategorieNeu: ["4334"], taetigkeiten: ["4704"] },
    /** … / [HD] Handläufe */
    hl: { kategorieNeu: ["4334"], taetigkeiten: ["4034"] },
    /** … / Sonstige (assumption: no own entry for Barrierefreies Leben) */
    bl: { kategorieNeu: ["4334"], taetigkeiten: ["4158"] },
    /** Alltagshilfe / [AH] Haushaltsnahe Dienstleistungen */
    ah: { kategorieNeu: ["4002"], taetigkeiten: ["4566"] },
  } as Record<string, { kategorieNeu: string[]; taetigkeiten: string[] }>,
};
export type SecondOfferDealValues = typeof SECOND_OFFER_DEAL_VALUES;

export interface SecondOfferSettings {
  categoryId: number; stageId: string; sourceId: string; title: string; values: SecondOfferDealValues;
}
const IdList = z.array(z.string().regex(/^\d+$/)).min(1);
const ValuesOverride = z.object({
  fields: z.object({ kategorieNeu: z.string(), taetigkeiten: z.string(), zugehoerigkeit: z.string(), vonText: z.string() }).partial().optional(),
  zugehoerigkeit: z.string().regex(/^\d+$/).optional(),
  byType: z.record(z.string(), z.object({ kategorieNeu: IdList, taetigkeiten: IdList }).partial()).optional(),
}).strict();

/** the settings of a second offer: env (pipeline, stage, source, title) + the value table with its optional JSON override */
export function secondOfferSettings(cfg: Pick<AppConfig, "SECOND_OFFER_CATEGORY_ID" | "SECOND_OFFER_STAGE_ID" | "SECOND_OFFER_SOURCE_ID" | "SECOND_OFFER_TITLE" | "SECOND_OFFER_VALUES_JSON">): SecondOfferSettings {
  const values: SecondOfferDealValues = structuredClone(SECOND_OFFER_DEAL_VALUES);
  if (cfg.SECOND_OFFER_VALUES_JSON) {
    let raw: unknown;
    try { raw = JSON.parse(cfg.SECOND_OFFER_VALUES_JSON); } catch { throw new Error("SECOND_OFFER_VALUES_JSON is not valid JSON"); }
    const o = ValuesOverride.safeParse(raw);
    if (!o.success) throw new Error(`SECOND_OFFER_VALUES_JSON: ${o.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    Object.assign(values.fields, o.data.fields ?? {});
    if (o.data.zugehoerigkeit) values.zugehoerigkeit = o.data.zugehoerigkeit;
    for (const [t, v] of Object.entries(o.data.byType ?? {})) {
      const cur = values.byType[t];
      if (!cur && !(v.kategorieNeu && v.taetigkeiten)) throw new Error(`SECOND_OFFER_VALUES_JSON: byType.${t} needs kategorieNeu and taetigkeiten`);
      values.byType[t] = { ...(cur ?? { kategorieNeu: [], taetigkeiten: [] }), ...(v as object) } as { kategorieNeu: string[]; taetigkeiten: string[] };
    }
  }
  return { categoryId: cfg.SECOND_OFFER_CATEGORY_ID, stageId: cfg.SECOND_OFFER_STAGE_ID, sourceId: cfg.SECOND_OFFER_SOURCE_ID, title: cfg.SECOND_OFFER_TITLE, values };
}

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
  // Same idea for every outbound system that changes real data (ADR 017).
  for (const key of ["BITRIX_WEBHOOK_BASE", "PLANNING_API_BASE_URL", "SMTP_HOST", "IMAP_HOST", "OB24_BASE_URL"] as const) {
    const raw = cfg[key];
    const host = raw ? (/^[a-z]+:\/\//i.test(raw) ? new URL(raw).hostname : raw).toLowerCase() : "";
    if (cfg.NODE_ENV !== "production" && host && !LOCAL_HOSTS.has(host)) {
      throw new UnsafeDatabaseError(
        `Refusing to start: NODE_ENV=${cfg.NODE_ENV} but ${key} points at a remote host ` +
          `(${host}). Outside production only a local stub is allowed (ADR 017).`,
      );
    }
  }
  secondOfferSettings(cfg); // a broken SECOND_OFFER_VALUES_JSON stops the start, not the first creation
  if (cfg.NODE_ENV === "production" && (cfg.AUTH_SECRET.startsWith("dev-only") || cfg.AUTH_SECRET.length < 32)) {
    throw new Error("Refusing to start: AUTH_SECRET must be set (≥ 32 chars) in production — no insecure fallback.");
  }
  return Object.freeze(cfg);
}
