// The one way the app talks to the server. Paths and shapes come from @oc/api-contract, so a
// changed endpoint fails the build here. Every call can be aborted (AbortSignal).
import { endpoints, isApiError, pathOf, type EndpointName } from "@oc/api-contract";
import type { z } from "zod";

type Endpoint<N extends EndpointName> = (typeof endpoints)[N];
type ResponseOf<N extends EndpointName> = Endpoint<N> extends { response: infer S extends z.ZodType } ? z.infer<S> : unknown;

/** A failed call: the server's message in German (shown to the user as it is) plus status and code. */
export class ApiFailure extends Error {
  /** `detail`: further fields of the server's error object (e.g. `newDealId` of SECOND_OFFER_DRAFT_FAILED) */
  constructor(message: string, readonly status: number, readonly code: string, readonly requestId: string = "", readonly detail: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiFailure";
  }
}

export interface CallOptions {
  params?: Record<string, string | number>;
  /** the query string, without the "?" (e.g. "w=90&l=120") */
  query?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function call<N extends EndpointName>(name: N, opts: CallOptions = {}): Promise<ResponseOf<N>> {
  const ep = endpoints[name];
  let res: Response;
  try {
    res = await fetch(pathOf(name, opts.params) + (opts.query ? `?${opts.query}` : ""), {
      method: ep.method,
      credentials: "include",
      headers: opts.body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err; // a newer request replaced this one
    throw new ApiFailure("Keine Verbindung zum Server.", 0, "OFFLINE");
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isApiError(data)) { const { code, message, requestId, ...detail } = data.error as Record<string, unknown> & { code: string; message: string; requestId: string }; throw new ApiFailure(message, res.status, code, requestId, detail); }
    throw new ApiFailure(`Der Server hat mit einem Fehler geantwortet (${res.status}).`, res.status, "HTTP_ERROR");
  }
  if ("response" in ep) {
    const parsed = ep.response.safeParse(data);
    if (!parsed.success) throw new ApiFailure("Die Antwort des Servers hat ein unerwartetes Format.", res.status, "BAD_RESPONSE");
    return parsed.data as ResponseOf<N>;
  }
  return data as ResponseOf<N>;
}

/** A document made by the server from the offer: the file and the name the server gave it. */
export interface ServerFile { blob: Blob; filename: string; type: string; status: number }
/** the file name of a Content-Disposition header, "" when there is none */
export function filenameOf(disposition: string | null): string {
  const m = (disposition ?? "").match(/filename\*=UTF-8''([^;]+)/i) || (disposition ?? "").match(/filename="?([^";]+)"?/i);
  try { return m?.[1] ? decodeURIComponent(m[1]) : ""; } catch { return m?.[1] ?? ""; }
}
/** POST the offer to a document route and get the file back. The document routes are today's
 *  (not in the contract: they answer with a file, and a failure in their own words). */
export async function postForFile(path: string, body: unknown, opts: { accept?: string; signal?: AbortSignal } = {}): Promise<ServerFile> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: opts.accept ?? "*/*" }, body: JSON.stringify(body), ...(opts.signal ? { signal: opts.signal } : {}) });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiFailure("Keine Verbindung zum Server.", 0, "OFFLINE");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null;
    const text = isApiError(data) ? data.error.message : [data?.error, data?.detail].filter((x) => typeof x === "string" && x).join(" — ");
    throw new ApiFailure(text || `Der Server hat mit einem Fehler geantwortet (${res.status}).`, res.status, "HTTP_ERROR");
  }
  const blob = await res.blob();
  return { blob, filename: filenameOf(res.headers.get("content-disposition")), type: String(res.headers.get("content-type") ?? "").toLowerCase(), status: res.status };
}
