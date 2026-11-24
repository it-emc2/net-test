// The signing page's only way to the server: the public routes of ONE token
// (/api/signing/<token>…). Nothing else of the app's API is reachable from this page — no
// login, no other customer's data. Same requests as today's page (signpage/app.js).
import { TEXT, errorText, type SignRequest } from "./rules.js";

export class SignApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: Record<string, unknown> | null) { super(message); }
}

const base = (token: string) => `/api/signing/${encodeURIComponent(token)}`;

async function json(res: Response, fallback: string): Promise<any> {
  let body: any = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new SignApiError(errorText(body) ?? fallback, res.status, body && typeof body === "object" ? body : null);
  if (body === null) throw new SignApiError(fallback, res.status, null);
  return body;
}
/** a failed connection (no answer at all) */
const offline = (e: unknown): never => { if (e instanceof SignApiError) throw e; throw new SignApiError(TEXT.offline, 0, null); };

export async function loadRequest(token: string): Promise<SignRequest> {
  const res = await fetch(base(token)).catch(offline);
  return json(res, TEXT.linkFallback);
}

/** the document as the server renders it (HTML with its own fields); null when it cannot be shown */
export async function documentHtml(token: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${base(token)}/documents/${encodeURIComponent(key)}/html`);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

export interface Submission { signatureImage: string; extraFields: Record<string, unknown>; editedFields: Record<string, string> }
export interface SubmitAnswer { ok?: boolean; status?: string; completed?: boolean; documents?: { key: string; status: string }[] }

export async function submitDocument(token: string, key: string, body: Submission): Promise<SubmitAnswer> {
  const res = await fetch(`${base(token)}/documents/${encodeURIComponent(key)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).catch(offline);
  return json(res, TEXT.submitFailed);
}

export async function requestNewLink(token: string): Promise<unknown> {
  const res = await fetch(`${base(token)}/request-new-link`, { method: "POST" }).catch(offline);
  return json(res, TEXT.requestFailed);
}
