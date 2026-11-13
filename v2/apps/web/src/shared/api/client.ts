// The one way the app talks to the server. Paths and shapes come from @oc/api-contract, so a
// changed endpoint fails the build here. Every call can be aborted (AbortSignal).
import { endpoints, isApiError, pathOf, type EndpointName } from "@oc/api-contract";
import type { z } from "zod";

type Endpoint<N extends EndpointName> = (typeof endpoints)[N];
type ResponseOf<N extends EndpointName> = Endpoint<N> extends { response: infer S extends z.ZodType } ? z.infer<S> : unknown;

/** A failed call: the server's message in German (shown to the user as it is) plus status and code. */
export class ApiFailure extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
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
    if (isApiError(data)) throw new ApiFailure(data.error.message, res.status, data.error.code);
    throw new ApiFailure(`Der Server hat mit einem Fehler geantwortet (${res.status}).`, res.status, "HTTP_ERROR");
  }
  if ("response" in ep) {
    const parsed = ep.response.safeParse(data);
    if (!parsed.success) throw new ApiFailure("Die Antwort des Servers hat ein unerwartetes Format.", res.status, "BAD_RESPONSE");
    return parsed.data as ResponseOf<N>;
  }
  return data as ResponseOf<N>;
}
