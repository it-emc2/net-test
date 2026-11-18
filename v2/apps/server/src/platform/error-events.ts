// The error log's source (a viewer comes later): ONE function, reportError(), writes a structured
// record of a failure to the request log AND to the collection `error_events`. Codes are the
// stable ones of @oc/api-contract (ERROR_CODES).
//
// Collection `error_events` (new in v2, not read by the legacy app) — one document per failure:
//   at            Date      when it happened (expiry index: removed after 90 days)
//   area          string    where, e.g. "kundendaten.bitrix-load" (ERROR_AREAS)
//   code          string    stable code, e.g. "BITRIX_RATE_LIMITED" (ERROR_CODES)
//   severity      "error" | "warn"   warn: the user got an answer anyway (e.g. the fallback worked)
//   message       string    technical text for developers — never customer data
//   requestId     string    the request's id (also in the error answer and the request log)
//   user          string    the e-mail address of the signed-in USER (as the other logs keep it)
//   dealId        string?   ids only
//   upstream      { method?, httpStatus?, errorCode?, attempts? }   the outside call that failed
//   durationMs    number?   how long the request had been running
//   fallbackUsed  boolean   whether the single calls were used after the batch
// NO personal data of customers: no names, addresses, phone numbers, e-mail addresses, search
// words or request parameters carrying them — only ids and codes (sanitise() enforces the shape).
// Reporting never throws and never delays the answer: the insert is not awaited.
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import type { ErrorArea, ErrorCode } from "@oc/api-contract";
import { Schema, model } from "./models/define.js";

export const ERROR_EVENT_TTL_DAYS = 90;
const ErrorEventSchema = new Schema({
  at: { type: Date, required: true },
  area: { type: String, required: true },
  code: { type: String, required: true },
  severity: { type: String, enum: ["error", "warn"], required: true },
  message: { type: String, default: "" },
  requestId: { type: String, default: "" },
  user: { type: String, default: "" },
  dealId: { type: String, default: undefined },
  upstream: {
    type: new Schema({ method: String, httpStatus: Number, errorCode: String, attempts: Number }, { _id: false }),
    default: undefined,
  },
  durationMs: { type: Number, default: undefined },
  fallbackUsed: { type: Boolean, default: false },
}, { collection: "error_events", versionKey: false, strict: true });
ErrorEventSchema.index({ at: 1 }, { name: "ttl_at", expireAfterSeconds: ERROR_EVENT_TTL_DAYS * 24 * 3600 });
ErrorEventSchema.index({ area: 1, code: 1, at: -1 }, { name: "area_code_at" });
export const ErrorEvent = model("ErrorEvent", ErrorEventSchema);

/** creates the indexes of `error_events` (migration 004; never implicitly — autoIndex is off) */
export async function migrateErrorEventIndexes() {
  await ErrorEvent.collection.createIndex({ at: 1 }, { name: "ttl_at", expireAfterSeconds: ERROR_EVENT_TTL_DAYS * 24 * 3600 });
  await ErrorEvent.collection.createIndex({ area: 1, code: 1, at: -1 }, { name: "area_code_at" });
}

export interface ErrorReport {
  area: ErrorArea;
  code: ErrorCode;
  severity?: "error" | "warn";
  /** technical text, no customer data */
  message: string;
  dealId?: string;
  upstream?: { method?: string; httpStatus?: number | null; errorCode?: string | null; attempts?: number };
  durationMs?: number;
  fallbackUsed?: boolean;
}
export interface ErrorEventRecord extends Required<Pick<ErrorReport, "area" | "code" | "message">> {
  at: Date; severity: "error" | "warn"; requestId: string; user: string; fallbackUsed: boolean;
  dealId?: string; upstream?: { method?: string; httpStatus?: number; errorCode?: string; attempts?: number }; durationMs?: number;
}

const ID_RE = /^[\w.:-]{1,64}$/;
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);
/** keeps ids as ids: anything that does not look like one is dropped */
const idOrUndefined = (v: unknown) => (v != null && ID_RE.test(String(v)) ? String(v) : undefined);

/** the record exactly as stored: only the documented fields, ids checked, texts clipped */
export function sanitise(r: ErrorReport, ctx: { requestId?: string; user?: string; at?: Date }): ErrorEventRecord {
  const up = r.upstream;
  const upstream = up ? Object.fromEntries(Object.entries({
    method: up.method && /^[a-z][\w.]{0,63}$/i.test(up.method) ? up.method : undefined,
    httpStatus: typeof up.httpStatus === "number" ? up.httpStatus : undefined,
    errorCode: up.errorCode && /^[\w-]{1,64}$/.test(up.errorCode) ? up.errorCode : undefined,
    attempts: typeof up.attempts === "number" ? up.attempts : undefined,
  }).filter(([, v]) => v !== undefined)) : undefined;
  const dealId = idOrUndefined(r.dealId);
  return {
    at: ctx.at ?? new Date(), area: r.area, code: r.code, severity: r.severity ?? "error",
    message: clip(r.message, 300), requestId: clip(ctx.requestId, 80), user: clip(ctx.user, 120), fallbackUsed: !!r.fallbackUsed,
    ...(dealId ? { dealId } : {}),
    ...(upstream && Object.keys(upstream).length ? { upstream } : {}),
    ...(typeof r.durationMs === "number" ? { durationMs: Math.round(r.durationMs) } : {}),
  };
}

type Ctx = { log: FastifyBaseLogger; id?: string; user?: { email?: string } | undefined };
/** The one way a failure of a feature is reported: request log + `error_events`. Never throws. */
export function reportError(req: FastifyRequest | Ctx, report: ErrorReport): ErrorEventRecord | null {
  try {
    const record = sanitise(report, { requestId: (req as Ctx).id ?? "", user: (req as Ctx).user?.email ?? "" });
    const log = (req as Ctx).log;
    if (record.severity === "warn") log.warn({ errorEvent: record }, `${record.area}: ${record.code}`);
    else log.error({ errorEvent: record }, `${record.area}: ${record.code}`);
    void ErrorEvent.collection.insertOne({ ...record }).catch((e: unknown) => log.warn({ err: e }, "error event not stored"));
    return record;
  } catch {
    return null;
  }
}
