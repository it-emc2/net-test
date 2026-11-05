// Explicit, reviewed data/index migrations for cut-over (never run implicitly at boot).
// Each migration is idempotent and supports a dry run that only REPORTS what it would do.
// Production execution needs owner approval (ADR 001/016) and runs against a fresh backup.
import type mongoose from "mongoose";
import { migrateDealDraftIndexes } from "../deal-drafts/store.js";

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

export const MIGRATIONS = [m001DealDraftIndexes, m002UnsetEmptyCustomerNumber];
