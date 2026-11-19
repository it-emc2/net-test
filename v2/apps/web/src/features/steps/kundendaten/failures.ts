// The ONE place where this step's load failures are turned into what the user reads (German, "Sie")
// and handed to the log. The codes are the server's (ERROR_CODES in @oc/api-contract); a request
// id travels with them so a later client-side error log can join both sides. There is no
// client-side error log yet: the failure goes to the console only (the server stored it already).
import { ERROR_CODES, type ErrorArea } from "@oc/api-contract";
import { ApiFailure } from "../../../shared/api/index.js";

const BY_HAND = "Sie können die Daten auch von Hand eingeben.";
const MESSAGES: Record<string, string> = {
  [ERROR_CODES.BITRIX_RATE_LIMITED]: `Bitrix ist gerade ausgelastet. Bitte versuchen Sie es gleich noch einmal. ${BY_HAND}`,
  [ERROR_CODES.BITRIX_TIMEOUT]: `Bitrix antwortet gerade nicht. Bitte versuchen Sie es gleich noch einmal. ${BY_HAND}`,
  [ERROR_CODES.BITRIX_UNAVAILABLE]: `Bitrix ist gerade nicht erreichbar. Bitte versuchen Sie es später noch einmal. ${BY_HAND}`,
  [ERROR_CODES.DEAL_NOT_FOUND]: `Diesen Auftrag gibt es in Bitrix nicht. Bitte prüfen Sie die Auftragsnummer. ${BY_HAND}`,
  [ERROR_CODES.INVALID_DEAL_ID]: `Die Auftragsnummer besteht nur aus Ziffern. ${BY_HAND}`,
  [ERROR_CODES.CUSTOMER_SEARCH_FAILED]: "Die Kundensuche ist gerade nicht möglich. Bitte versuchen Sie es erneut.",
  [ERROR_CODES.CUSTOMER_LOAD_FAILED]: "Die gespeicherten Kundendaten konnten nicht gelesen werden.",
  OFFLINE: `Keine Verbindung zum Server. Bitte versuchen Sie es erneut, sobald die Verbindung wieder da ist. ${BY_HAND}`,
};

export interface Failure { code: string; message: string; requestId: string }
/**
 * A failure of loading customer data → what to show. `fallbackCode`: the code when the server
 * gave none of its own (an older route, no connection …). `keepServerText`: show the server's own
 * words (today's routes answer in the words today's UI shows).
 */
export function failureOf(area: ErrorArea, err: unknown, fallbackCode: string, keepServerText = false): Failure {
  const api = err instanceof ApiFailure ? err : null;
  const code = api && api.code in MESSAGES ? api.code : api?.code === "OFFLINE" ? "OFFLINE" : fallbackCode;
  const message = keepServerText && api?.message && api.code !== "OFFLINE" ? api.message : MESSAGES[code] ?? MESSAGES[fallbackCode] ?? `Das hat nicht geklappt. ${BY_HAND}`;
  const f = { code, message, requestId: api?.requestId ?? "" };
  console.warn(`[${area}] ${code}`, f.requestId ? `request ${f.requestId}` : ""); // ids only, never customer data
  return f;
}
export const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";
