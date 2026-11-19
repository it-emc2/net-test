// Explicit, reviewed data/index migrations for cut-over (never run implicitly at boot).
// Each migration is idempotent and supports a dry run that only REPORTS what it would do.
// Production execution needs owner approval (ADR 001/016) and runs against a fresh backup.
import type mongoose from "mongoose";
import { migrateDealDraftIndexes } from "../modules/deal-drafts/index.js";
import { migrateOfferSendIndexes } from "../modules/sends/index.js";
import { migrateOfferNumberIndexes } from "../modules/sends/index.js";
import { migrateErrorEventIndexes } from "../platform/error-events.js";

export interface MigrationResult { id: string; dryRun: boolean; matched: number; changed: number; note: string }

/** 001 — indexes for the NEW deal draft collections (ADR 007). */
export async function m001DealDraftIndexes(_db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  if (!dryRun) await migrateDealDraftIndexes();
  return { id: "001-deal-draft-indexes", dryRun, matched: 0, changed: dryRun ? 0 : 3, note: "creates uniq_deal_variant, uniq_deal_revision, deal_variant_revision (since ADR 027 A; before: uniq_dealId — migration 005 drops it)" };
}

/**
 * 002 — B-1 (ADR 016): remove empty-string customerNumber values so the unique sparse index
 * treats them as absent. Touches ONLY documents whose customerNumber is exactly "".
 */
export async function m002UnsetEmptyCustomerNumber(db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  const coll = db.collection("Kundendaten");
  const matched = await coll.countDocuments({ customerNumber: "" });
  let changed = 0;
  if (!dryRun && matched) changed = (await coll.updateMany({ customerNumber: "" }, { $unset: { customerNumber: "" } })).modifiedCount;
  return { id: "002-unset-empty-customer-number", dryRun, matched, changed, note: 'unset customerNumber where it is ""' };
}

/** 003 — indexes for the NEW send record collection (ADR 023). */
export async function m003OfferSendIndexes(_db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  if (!dryRun) { await migrateOfferSendIndexes(); await migrateOfferNumberIndexes(); }
  return { id: "003-offer-send-indexes", dryRun, matched: 0, changed: dryRun ? 0 : 6, note: "creates uniq_sendId, offer_started, deal_started, signing_token on offer_sends and uniq_token on signing_completions, uniq_offerNumber on offer_numbers" };
}

/** 004 — indexes for the NEW error log collection `error_events` (expiry after 90 days). */
export async function m004ErrorEventIndexes(_db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  if (!dryRun) await migrateErrorEventIndexes();
  return { id: "004-error-event-indexes", dryRun, matched: 0, changed: dryRun ? 0 : 2, note: "creates ttl_at (90 days), area_code_at on error_events" };
}

/**
 * 005 — variants of a deal's offer (ADR 027 A). Documents are NOT rewritten: a draft without
 * `variantId` is the deal's first variant. Only the indexes change:
 *  - deal_drafts: creates uniq_deal_variant {dealId, variantId} (existing data satisfies it — one
 *    draft per deal, all without variantId), THEN drops uniq_dealId {dealId} (one draft per deal)
 *  - deal_draft_revisions: creates deal_variant_revision {dealId, variantId, revision -1};
 *    uniq_deal_revision {dealId, revision} stays (revision numbers are unique per deal)
 * Idempotent: an index that exists is not created again, a missing one is not dropped. The legacy
 * collections (emailsends / postalsends and their unique dealId index) are not touched.
 */
export async function m005DealDraftVariants(db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  const has = async (coll: string, name: string) => {
    try { return (await db.collection(coll).indexes()).some((i) => i.name === name); }
    catch { return false; } // collection does not exist yet
  };
  const todo: string[] = [];
  if (!(await has("deal_drafts", "uniq_deal_variant"))) todo.push("create deal_drafts.uniq_deal_variant");
  if (!(await has("deal_draft_revisions", "deal_variant_revision"))) todo.push("create deal_draft_revisions.deal_variant_revision");
  if (await has("deal_drafts", "uniq_dealId")) todo.push("drop deal_drafts.uniq_dealId");
  const matched = await db.collection("deal_drafts").countDocuments({ variantId: { $exists: false } });
  if (!dryRun) {
    // create before drop: there is never a moment without a unique index on the deal's drafts
    await db.collection("deal_drafts").createIndex({ dealId: 1, variantId: 1 }, { unique: true, name: "uniq_deal_variant" });
    await db.collection("deal_draft_revisions").createIndex({ dealId: 1, variantId: 1, revision: -1 }, { name: "deal_variant_revision" });
    if (await has("deal_drafts", "uniq_dealId")) await db.collection("deal_drafts").dropIndex("uniq_dealId");
  }
  return {
    id: "005-deal-draft-variants", dryRun, matched, changed: dryRun ? 0 : todo.length,
    note: `${matched} existing drafts are first variants (not rewritten); ${todo.length ? todo.join(", ") : "indexes already in place"}`,
  };
}

export const MIGRATIONS = [m001DealDraftIndexes, m002UnsetEmptyCustomerNumber, m003OfferSendIndexes, m004ErrorEventIndexes, m005DealDraftVariants];

/**
 * ROLLBACK tool (CUTOVER.md §4.2) — not a migration. Copies the CURRENT autosaved draft of every
 * variant of every deal (v2 `deal_drafts`; deleted variants are skipped) into the legacy `drafts`
 * collection as an ordinary draft, so the old app shows the work after switching back (its
 * "Deal laden" dialog finds them via payload.auftragId; a deal with variants lists one draft per
 * variant, the name ends in the variant's name). Idempotent: the key
 * `clientSaveId = "dealdraft:<dealId>:<revision>"` is never written twice (revision numbers are
 * unique per deal across its variants, ADR 027 A).
 * Only INSERTS into `drafts`; `deal_drafts` is only read.
 */
export async function exportDealDraftsToLegacy(db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  const deals = await db.collection("deal_drafts").find({}).toArray();
  let matched = 0, changed = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const d of deals as any[]) {
    if (d.deletedAt) continue;
    const key = `dealdraft:${d.dealId}:${d.revision}`;
    if (await db.collection("drafts").countDocuments({ clientSaveId: key }, { limit: 1 })) continue;
    matched++;
    if (dryRun) continue;
    const at = new Date(d.updatedAt ?? Date.now());
    const k = d.payload?.Kundendaten ?? {};
    const clean = (v: unknown) => String(v ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "") || "X";
    // same name shape as today's quick save: ANG-{TYPE}-{First}-{Last}-{DDMMYYYY}-{HHMMSS}
    const name = `ANG-${String(d.offerType).toUpperCase()}-${clean(k.firstName)}-${clean(k.lastName)}-` +
      `${pad(at.getDate())}${pad(at.getMonth() + 1)}${at.getFullYear()}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}` +
      (d.variantId ? `-${clean(d.variantName || "Variante")}` : ""); // the first variant keeps today's name
    const now = new Date();
    await db.collection("drafts").insertOne({
      name, offerType: d.offerType, payload: d.payload,
      ...(d.payload?.offerNumber ? { offerNumber: String(d.payload.offerNumber) } : {}),
      savedAt: at, clientSaveId: key, createdAt: now, updatedAt: now,
    });
    changed++;
  }
  return { id: "rollback-export-deal-drafts", dryRun, matched, changed, note: "copies current deal drafts into legacy drafts (insert only)" };
}
