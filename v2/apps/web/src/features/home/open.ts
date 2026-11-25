// Opening a stored draft or offer from the Hauptmenü in the React app.
// Today's UI fills its form from the stored document (loadDraftById / loadOfferByNumber) and its
// autosave then writes that state into the deal's draft — over an autosaved draft that differs,
// without asking (recorded: home-entwurf.json „open a draft whose deal has a different autosaved
// draft“). The React app copies the document into the deal's draft first (POST …/draft/import: a NEW
// VERSION, the earlier one stays in the history) and opens it:
//  - the deal: the document's own deal number (`auftragId`, else `postal.auftragId` — what today's
//    form restores); none → a new temporary key, as today's autosave would save it
//  - the deal has no draft yet → copied at once
//  - its draft is the same state already (opened before) → opened, nothing copied
//  - its draft differs → the user is asked (U-057): open the autosaved state, or copy the document
//    over it (as a new version of the variant shown in the question), or cancel
//  - the draft moved on between question and answer (REVISION_CONFLICT) → asked again with the new state
// A sent offer opens as stored: its number comes along, and the offer frame shows it as sent (ADR 023).
import { FIRST_VARIANT_ID, type HomeSearchRow } from "@oc/api-contract";
import type { NewOfferType } from "@oc/domain";
import { ApiFailure, call } from "../../shared/api/index.js";
import { newTempKey } from "../offer/index.js";
import { classicOffer } from "../../shared/lib/classic-ui.js";
import { reactTypeOf, sameState, sourceLabel, TEXT } from "./search-rules.js";

/** the draft a deal already has (what the question shows) */
export interface Existing { revision: number; updatedAt: string; offerType: string; variantId: string; variantName: string }
export type Outcome =
  | { kind: "go"; path: string }
  | { kind: "ask"; key: string; type: NewOfferType; row: HomeSearchRow; existing: Existing; moved?: boolean }
  | { kind: "legacy"; href?: string }
  | { kind: "failed"; message: string };

const pathOf = (key: string, type: string) => `/deal/${key}/${type}`;
const failed = (e: unknown, fallback: string = TEXT.openFailed): Outcome => ({ kind: "failed", message: e instanceof ApiFailure && e.code !== "HTTP_ERROR" && e.code !== "BAD_RESPONSE" ? e.message : fallback });
const is404 = (e: unknown) => e instanceof ApiFailure && e.status === 404;

/** the stored document's state (for „is it the deal's draft already?“) */
async function sourcePayload(row: HomeSearchRow): Promise<unknown> {
  if (row.kind === "draft") return (await call("legacyDraft", { params: { id: row.id } })).payload ?? null;
  return (await call("storedOffer", { params: { offerNumber: row.offerNumber } })).offer.payload ?? null;
}

/** copies the row into the deal's draft at `baseRevision` (of `variant`, when the deal has one) */
export async function importRow(key: string, row: HomeSearchRow, baseRevision: number, variant?: string): Promise<void> {
  await call("importDealDraft", {
    params: { dealId: key },
    ...(variant ? { query: `variant=${encodeURIComponent(variant)}` } : {}),
    body: row.kind === "draft" ? { kind: "draft", id: row.id, baseRevision } : { kind: "offer", offerNumber: row.offerNumber, baseRevision },
  });
}

/** The deal's draft now, or null; decides between copying, opening and asking. */
async function decide(key: string, type: NewOfferType, row: HomeSearchRow, moved = false): Promise<Outcome> {
  let d;
  try { d = await call("dealDraft", { params: { dealId: key } }); } catch (e) {
    if (!is404(e)) return failed(e);
    try { await importRow(key, row, 0); return { kind: "go", path: pathOf(key, type) }; } catch (err) {
      // someone saved this deal's draft in the meantime: ask with that state
      if (err instanceof ApiFailure && err.code === "REVISION_CONFLICT" && !moved) return decide(key, type, row, true);
      return failed(err);
    }
  }
  const existing: Existing = { revision: d.revision, updatedAt: String(d.updatedAt), offerType: d.offerType, variantId: d.variantId ?? FIRST_VARIANT_ID, variantName: d.variantName ?? "" };
  if (d.offerType === type) {
    const src = await sourcePayload(row).catch(() => undefined);
    if (src !== undefined && sameState(src, d.payload)) return { kind: "go", path: pathOf(key, type) };
  }
  return { kind: "ask", key, type, row, existing, moved };
}

/** A tap on a row. */
export async function openRow(row: HomeSearchRow): Promise<Outcome> {
  const type = reactTypeOf(row);
  if (!type) return { kind: "legacy" };
  if (row.kind === "offer" && !row.offerNumber) return { kind: "failed", message: TEXT.openFailed };
  if (!row.deal) { // no deal number: a new temporary draft, as today's autosave would start one
    const key = newTempKey();
    try { await importRow(key, row, 0); return { kind: "go", path: pathOf(key, type) }; } catch (e) { return failed(e); }
  }
  return decide(row.deal, type, row);
}

/** The answer „copy it over the autosaved state“. */
export async function takeOver(q: Extract<Outcome, { kind: "ask" }>): Promise<Outcome> {
  try {
    await importRow(q.key, q.row, q.existing.revision, q.existing.variantId);
    return { kind: "go", path: pathOf(q.key, q.type) };
  } catch (e) {
    if (e instanceof ApiFailure && e.code === "REVISION_CONFLICT") return decide(q.key, q.type, q.row, true);
    return failed(e);
  }
}

/** „ANG…“ + Enter: that stored offer (today: GET /api/offers/:number, else „Angebot wurde nicht gefunden.“) */
export async function openOfferNumber(offerNumber: string): Promise<Outcome> {
  let offer;
  try { offer = (await call("storedOffer", { params: { offerNumber } })).offer; } catch (e) {
    return is404(e) ? { kind: "failed", message: TEXT.notFound } : failed(e);
  }
  const p = (offer.payload ?? {}) as Record<string, any>;
  const deal = String(p.auftragId || p.postal?.auftragId || "").trim();
  const o = await openRow({
    kind: "offer", id: "", title: offer.offerNumber, offerType: String(offer.offerType || p.activeOffer || "bu"), ref: offer.offerNumber, offerNumber: offer.offerNumber,
    at: null, snippet: "", deal: /^\d{1,12}$/.test(deal) ? deal : "",
  });
  // a type this app cannot edit: today's UI opens that very offer (U-075; before: today's Hauptmenü)
  return o.kind === "legacy" ? { kind: "legacy", href: classicOffer(offer.offerNumber) } : o;
}

export { sourceLabel };
