// Explicit, reviewed data/index migrations for cut-over (never run implicitly at boot).
// Each migration is idempotent and supports a dry run that only REPORTS what it would do.
// Production execution needs owner approval (ADR 001/016) and runs against a fresh backup.
import type mongoose from "mongoose";
import { migrateDealDraftIndexes } from "../deal-drafts/store.js";
import { migrateOfferSendIndexes } from "../sends/store.js";
import { migrateOfferNumberIndexes } from "../sends/numbers.js";

export interface MigrationResult { id: string; dryRun: boolean; matched: number; changed: number; note: string }

/** 001 — indexes for the NEW deal draft collections (ADR 007). */
export async function m001DealDraftIndexes(_db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  if (!dryRun) await migrateDealDraftIndexes();
  return { id: "001-deal-draft-indexes", dryRun, matched: 0, changed: dryRun ? 0 : 2, note: "creates uniq_dealId, uniq_deal_revision" };
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

export const MIGRATIONS = [m001DealDraftIndexes, m002UnsetEmptyCustomerNumber, m003OfferSendIndexes];

/**
 * ROLLBACK tool (CUTOVER.md §4.2) — not a migration. Copies each deal's CURRENT autosaved draft
 * (v2 `deal_drafts`) into the legacy `drafts` collection as an ordinary draft, so the old app
 * shows the work after switching back (its "Deal laden" dialog finds it via payload.auftragId).
 * Idempotent: the key `clientSaveId = "dealdraft:<dealId>:<revision>"` is never written twice.
 * Only INSERTS into `drafts`; `deal_drafts` is only read.
 */
export async function exportDealDraftsToLegacy(db: mongoose.mongo.Db, dryRun = true): Promise<MigrationResult> {
  const deals = await db.collection("deal_drafts").find({}).toArray();
  let matched = 0, changed = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  for (const d of deals as any[]) {
    const key = `dealdraft:${d.dealId}:${d.revision}`;
    if (await db.collection("drafts").countDocuments({ clientSaveId: key }, { limit: 1 })) continue;
    matched++;
    if (dryRun) continue;
    const at = new Date(d.updatedAt ?? Date.now());
    const k = d.payload?.Kundendaten ?? {};
    const clean = (v: unknown) => String(v ?? "").trim().replace(/[^\p{L}\p{N}]+/gu, "") || "X";
    // same name shape as today's quick save: ANG-{TYPE}-{First}-{Last}-{DDMMYYYY}-{HHMMSS}
    const name = `ANG-${String(d.offerType).toUpperCase()}-${clean(k.firstName)}-${clean(k.lastName)}-` +
      `${pad(at.getDate())}${pad(at.getMonth() + 1)}${at.getFullYear()}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
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
