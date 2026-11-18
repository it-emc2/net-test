// GET /api/deals/:dealId/customer — the customer of a Bitrix deal for the React Kundendaten step.
// The same data as today's GET /api/bitrix/deal/:id (which stays unchanged for today's view), but
// with as few Bitrix requests as possible:
//  - ONE request: a Bitrix `batch` with deal, contact, the contact's first requisite and that
//    requisite's address; later commands use earlier answers ($result[key][FIELD], syntax from
//    apidocs.bitrix24.com/settings/how-to-call-rest-api/batch.html). halt=0: every command runs.
//  - per deal: requests arriving together share one Bitrix request; the answer is kept 60 s
//    (DEAL_CUSTOMER_TTL_MS) — ?fresh=1 asks Bitrix again. Failures are not kept.
//  - batch refused, malformed, or a needed command failed → the single calls of today's route
//    (dealWithContact) once, recorded as a warning. No contact / no address is a normal answer.
//  - rate limit, timeout, unreachable → no second try here (the client already retried the rate
//    limit with back-off); a coded error, recorded.
// Everything goes through the shared BitrixClient (one queue, minimum gap, retry).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DEAL_CUSTOMER_TTL_MS, DEAL_NUMBER_RE, ERROR_AREAS, ERROR_CODES, customerOfContact, type DealCustomerResponse, type ErrorCode } from "@oc/api-contract";
import { BitrixError, type BitrixClient } from "../../integrations/bitrix.js";
import { reportError } from "../../platform/error-events.js";
import { dealWithContact, hasAnyAddress, vermieterFromDeal } from "./read.js";

const AREA = ERROR_AREAS.kundendatenBitrixLoad;
/** the commands of the batch, as sent (the deal id is digits only, checked before) */
export function dealCustomerBatch(dealId: string): Record<string, string> {
  return {
    deal: `crm.deal.get?id=${dealId}`,
    contact: "crm.contact.get?id=$result[deal][CONTACT_ID]",
    requisite: "crm.requisite.list?filter[ENTITY_TYPE_ID]=3&filter[ENTITY_ID]=$result[deal][CONTACT_ID]&select[0]=ID&order[ID]=ASC",
    address: "crm.address.list?filter[ENTITY_TYPE_ID]=8&filter[ENTITY_ID]=$result[requisite][0][ID]&select[0]=*",
  };
}

/** a failure that ends the load: what the user is told and what is recorded */
class LoadError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message: string, override readonly cause?: unknown) { super(message); }
}
/** why a batch answer was not used (recorded with the fallback) */
class BatchUnusable extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly upstream?: { method?: string; errorCode?: string }) { super(message); }
}

const noDeal = (v: unknown) => v === null || v === undefined || v === false || (Array.isArray(v) && v.length === 0);
const hasId = (v: unknown) => v != null && String(v).trim() !== "" && String(v).trim() !== "0";

/** reads the batch answer the way today's route reads its single answers; throws BatchUnusable when it cannot */
export function fromBatch(res: { result: Record<string, any>; result_error: Record<string, { error?: string; error_description?: string }> }) {
  const err = res.result_error, out = res.result;
  const failed = (key: string) => {
    const e = err[key];
    return e ? new BatchUnusable(ERROR_CODES.BITRIX_BATCH_PARTIAL, `batch command "${key}" failed`, { method: key, errorCode: String(e.error || "") || "UNKNOWN" }) : null;
  };
  if (err.deal) {
    if (/not found/i.test(String(err.deal.error_description || "")) || /NOT_FOUND/i.test(String(err.deal.error || ""))) return { deal: null, contact: null };
    throw failed("deal");
  }
  const deal = out.deal;
  if (noDeal(deal)) return { deal: null, contact: null };
  if (typeof deal !== "object" || Array.isArray(deal)) throw new BatchUnusable(ERROR_CODES.BITRIX_BATCH_MALFORMED, "batch: deal is not an object");
  if (!hasId(deal.CONTACT_ID)) return { deal, contact: null }; // no contact: the other commands do not count
  if (err.contact) throw failed("contact");
  const contact = out.contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return { deal, contact: null }; // as today: unknown contact = none
  if (String(contact.ID) !== String(deal.CONTACT_ID)) throw new BatchUnusable(ERROR_CODES.BITRIX_BATCH_MALFORMED, "batch: contact is not the deal's");
  if (hasAnyAddress(contact)) return { deal, contact }; // its own address: the requisite is not used (as today)
  if (err.requisite) throw failed("requisite");
  const reqs = out.requisite;
  if (reqs !== undefined && !Array.isArray(reqs)) throw new BatchUnusable(ERROR_CODES.BITRIX_BATCH_MALFORMED, "batch: requisite list is not a list");
  const reqId = Array.isArray(reqs) && reqs.length ? Number(reqs[0]?.ID) : null;
  if (!reqId) return { deal, contact };
  if (err.address) throw failed("address");
  const addrs = out.address;
  if (addrs !== undefined && !Array.isArray(addrs)) throw new BatchUnusable(ERROR_CODES.BITRIX_BATCH_MALFORMED, "batch: address list is not a list");
  const list = Array.isArray(addrs) ? addrs : [];
  if (!list.length) return { deal, contact };
  // only an address that belongs to THIS requisite is used (never one of another customer)
  const addr = list[0];
  if (String(addr?.ENTITY_ID ?? "") !== String(reqId) || String(addr?.ENTITY_TYPE_ID ?? "8") !== "8") {
    throw new BatchUnusable(ERROR_CODES.BITRIX_BATCH_MALFORMED, "batch: address does not belong to the requisite");
  }
  const street = String(addr.ADDRESS_1 || "").trim(), zip = String(addr.POSTAL_CODE || "").trim(), city = String(addr.CITY || "").trim();
  const patched = { ...contact };
  if (street) patched.ADDRESS = street;
  if (zip) patched.ADDRESS_POSTAL_CODE = zip;
  if (city) patched.ADDRESS_CITY = city;
  return { deal, contact: patched };
}

/** what a Bitrix failure means for the user and the log */
function loadErrorOf(err: unknown): LoadError {
  if (err instanceof LoadError) return err;
  const b = err instanceof BitrixError ? err : null;
  if (b?.kind === "rate-limit") return new LoadError(ERROR_CODES.BITRIX_RATE_LIMITED, 503, "Bitrix ist gerade ausgelastet. Bitte versuchen Sie es gleich noch einmal.", err);
  if (b?.kind === "timeout") return new LoadError(ERROR_CODES.BITRIX_TIMEOUT, 504, "Bitrix antwortet nicht. Bitte versuchen Sie es gleich noch einmal.", err);
  return new LoadError(ERROR_CODES.BITRIX_UNAVAILABLE, 502, "Bitrix ist gerade nicht erreichbar. Bitte versuchen Sie es später noch einmal.", err);
}
const upstreamOf = (err: unknown, method: string) => {
  const b = err instanceof BitrixError ? err : null;
  return { method, httpStatus: b?.status ?? null, errorCode: b?.bitrixCode ?? null, attempts: b?.attempts ?? (err as any)?.attempts ?? 1 };
};

export interface DealCustomerOptions { ttlMs?: number; now?: () => number; maxEntries?: number }

export function dealCustomerLoader(bx: BitrixClient, opts: DealCustomerOptions = {}) {
  const ttl = opts.ttlMs ?? DEAL_CUSTOMER_TTL_MS, now = opts.now ?? Date.now, max = opts.maxEntries ?? 500;
  const cache = new Map<string, { at: number; value: DealCustomerResponse }>();
  const inflight = new Map<string, Promise<DealCustomerResponse>>();

  async function load(req: FastifyRequest, dealId: string): Promise<DealCustomerResponse> {
    const started = now();
    let batchProblem: BatchUnusable | null = null;
    let found: { deal: any | null; contact: any | null };
    try {
      found = fromBatch(await bx.batch(dealCustomerBatch(dealId)));
    } catch (err) {
      if (err instanceof BatchUnusable) batchProblem = err;
      else if (err instanceof BitrixError && (err.kind === "refused" || err.kind === "malformed")) {
        batchProblem = new BatchUnusable(ERROR_CODES.BITRIX_BATCH_MALFORMED, `batch not usable: ${err.message}`.slice(0, 200), { method: "batch", ...(err.bitrixCode ? { errorCode: err.bitrixCode } : {}) });
      } else {
        const e = loadErrorOf(err);
        reportError(req, { area: AREA, code: e.code, message: (err as Error)?.message || String(err), dealId, upstream: upstreamOf(err, "batch"), durationMs: now() - started });
        throw e;
      }
      found = { deal: null, contact: null };
    }
    let source: DealCustomerResponse["source"] = "batch";
    if (batchProblem) {
      source = "fallback";
      try {
        found = await dealWithContact(bx, dealId);
        reportError(req, { area: AREA, code: batchProblem.code, severity: "warn", message: `${batchProblem.message}; single calls used`, dealId, upstream: { method: "batch", ...(batchProblem.upstream?.errorCode ? { errorCode: batchProblem.upstream.errorCode } : {}) }, durationMs: now() - started, fallbackUsed: true });
      } catch (err) {
        const e = loadErrorOf(err);
        reportError(req, { area: AREA, code: e.code, message: `${batchProblem.message}; single calls failed: ${(err as Error)?.message || String(err)}`, dealId, upstream: upstreamOf(err, "crm.deal.get"), durationMs: now() - started, fallbackUsed: true });
        throw e;
      }
    }
    if (!found.deal) {
      const e = new LoadError(ERROR_CODES.DEAL_NOT_FOUND, 404, `Den Auftrag ${dealId} gibt es in Bitrix nicht.`);
      reportError(req, { area: AREA, code: e.code, severity: "warn", message: "deal not found", dealId, durationMs: now() - started, fallbackUsed: source === "fallback" });
      throw e;
    }
    return {
      dealId, dealTitle: String(found.deal.TITLE || ""),
      customer: found.contact ? customerOfContact(found.contact) : null,
      vermieter: vermieterFromDeal(found.deal),
      source, loadedAt: new Date(now()).toISOString(),
    };
  }

  /** one shared load per deal; a kept answer unless `fresh` */
  function get(req: FastifyRequest, dealId: string, fresh: boolean): Promise<DealCustomerResponse> {
    const hit = cache.get(dealId);
    if (!fresh && hit && now() - hit.at < ttl) return Promise.resolve(hit.value);
    const running = inflight.get(dealId);
    if (running) return running; // also for fresh: it was started just now
    const p = load(req, dealId).then((value) => {
      if (cache.size >= max) for (const [k, v] of cache) if (now() - v.at >= ttl || cache.size >= max) cache.delete(k); else break;
      cache.set(dealId, { at: now(), value });
      return value;
    }).finally(() => inflight.delete(dealId));
    inflight.set(dealId, p);
    return p;
  }
  return { get, clear: () => cache.clear() };
}

const send = (req: FastifyRequest, reply: FastifyReply, e: LoadError) =>
  reply.status(e.status).send({ error: { code: e.code, message: e.message, requestId: req.id } });

export async function registerDealCustomer(app: FastifyInstance, bx: BitrixClient, opts: DealCustomerOptions = {}) {
  const loader = dealCustomerLoader(bx, opts);
  app.get("/api/deals/:dealId/customer", async (req, reply) => {
    const dealId = String((req.params as { dealId: string }).dealId || "").trim();
    if (!DEAL_NUMBER_RE.test(dealId)) return send(req, reply, new LoadError(ERROR_CODES.INVALID_DEAL_ID, 400, "Die Auftragsnummer besteht nur aus Ziffern."));
    const fresh = ["1", "true"].includes(String((req.query as Record<string, unknown>)?.fresh ?? ""));
    try {
      return await loader.get(req, dealId, fresh);
    } catch (err) {
      return send(req, reply, err instanceof LoadError ? err : loadErrorOf(err));
    }
  });
  return loader;
}
