// One draft per deal + append-only revision history (ADR 007). NEW collections only —
// legacy `drafts` / `offers` are read for import but never written.
import mongoose, { Schema } from "mongoose";
import { apply, diff, jsonEqual, touchedSections, type PatchOp } from "./patch.js";

export const SNAPSHOT_EVERY = 20;

const model = <T>(name: string, schema: Schema<T>) =>
  (mongoose.models[name] as mongoose.Model<T>) ?? mongoose.model<T>(name, schema);

export const DealDraft = model("DealDraft", new Schema({
  dealId: { type: String, required: true },
  offerType: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  revision: { type: Number, required: true },
  updatedBy: { type: String, default: "" },
  /** temporary drafts (started without a deal number): the deal they were attached to */
  adoptedInto: { type: String, default: undefined },
}, { timestamps: true, minimize: false, collection: "deal_drafts" }));

export const DealDraftRevision = model("DealDraftRevision", new Schema({
  dealId: { type: String, required: true },
  revision: { type: Number, required: true },
  at: { type: Date, required: true },
  by: { type: String, default: "" },
  kind: { type: String, enum: ["save", "restore", "import"], required: true },
  /** ops turning revision-1 into this revision */
  patch: { type: Schema.Types.Mixed, required: true },
  /** full payload every SNAPSHOT_EVERY revisions (and at revision 1) for fast reconstruction */
  snapshot: { type: Schema.Types.Mixed },
  offerType: { type: String },
  sections: { type: [String], default: [] },
  note: { type: String, default: "" },
}, { minimize: false, collection: "deal_draft_revisions" }));

/** Explicit, reviewed index creation for the NEW collections (never implicit at boot). */
export async function migrateDealDraftIndexes() {
  await DealDraft.collection.createIndex({ dealId: 1 }, { unique: true, name: "uniq_dealId" });
  await DealDraftRevision.collection.createIndex({ dealId: 1, revision: 1 }, { unique: true, name: "uniq_deal_revision" });
}

export class RevisionConflictError extends Error {
  override name = "RevisionConflictError";
  readonly statusCode = 409;
  constructor(readonly currentRevision: number) {
    super("Der Entwurf wurde inzwischen an anderer Stelle geändert. Bitte neu laden.");
  }
}

const isDup = (e: any) => e?.code === 11000;

export interface SaveInput {
  dealId: string;
  offerType: string;
  payload: Record<string, unknown>;
  /** revision the client started from; 0 = "no draft yet" */
  baseRevision: number;
  by: string;
  kind?: "save" | "restore" | "import";
  note?: string;
}

/** True when the connected MongoDB can run multi-document transactions (replica set / mongos). */
let txSupport: boolean | null = null;
export async function supportsTransactions(): Promise<boolean> {
  if (txSupport !== null) return txSupport;
  try {
    const hello: any = await mongoose.connection.db!.admin().command({ hello: 1 });
    txSupport = !!(hello.setName || hello.msg === "isdbgrid");
  } catch { txSupport = false; }
  return txSupport;
}
/** tests only */
export function resetTransactionSupportCache() { txSupport = null; }

/**
 * Saves a new revision with optimistic concurrency. Returns the current state; an unchanged
 * payload creates no revision. Throws RevisionConflictError if someone saved in between.
 * On a replica set (Atlas, production) the draft update and the revision record are written in
 * ONE transaction — both or neither (ADR 007). A standalone dev/test MongoDB falls back to the
 * same two steps without a transaction.
 */
export async function saveDealDraft(input: SaveInput) {
  if (!(await supportsTransactions())) return saveCore(input);
  const session = await mongoose.startSession();
  try {
    let out: Awaited<ReturnType<typeof saveCore>> | undefined;
    await session.withTransaction(async () => { out = await saveCore(input, session); });
    return out!;
  } finally {
    await session.endSession();
  }
}

async function saveCore(input: SaveInput, session?: mongoose.ClientSession) {
  const { dealId, offerType, payload, baseRevision, by, kind = "save", note = "" } = input;
  const opt = session ? { session } : {};
  const current: any = await DealDraft.findOne({ dealId }, null, opt).lean();
  const currentRev = current?.revision ?? 0;
  if (baseRevision !== currentRev) throw new RevisionConflictError(currentRev);
  if (current && kind === "save" && current.offerType === offerType && jsonEqual(current.payload, payload)) {
    return { dealId, revision: currentRev, changed: false };
  }
  const nextRev = currentRev + 1;
  const ops: PatchOp[] = diff(current?.payload ?? {}, payload);
  const at = new Date();

  // 1) claim the revision atomically on the draft (filter on the base revision)
  try {
    if (current) {
      const r = await DealDraft.updateOne(
        { dealId, revision: currentRev },
        { $set: { payload, offerType, revision: nextRev, updatedBy: by } },
        opt,
      );
      if (r.matchedCount !== 1) throw new RevisionConflictError((await DealDraft.findOne({ dealId }, null, opt).lean() as any)?.revision ?? -1);
    } else {
      await DealDraft.create([{ dealId, offerType, payload, revision: nextRev, updatedBy: by }], opt);
    }
  } catch (e) {
    if (isDup(e)) throw new RevisionConflictError((await DealDraft.findOne({ dealId }).lean() as any)?.revision ?? -1);
    throw e;
  }
  // 2) append the revision record (same transaction on a replica set)
  await DealDraftRevision.create([{
    dealId, revision: nextRev, at, by, kind, patch: ops, offerType,
    snapshot: nextRev === 1 || nextRev % SNAPSHOT_EVERY === 0 ? payload : undefined,
    sections: touchedSections(ops), note,
  }], opt);
  return { dealId, revision: nextRev, changed: true };
}

/** Temporary key for a draft started without a deal number: "t-" + 24 hex (unguessable). */
export const TEMP_KEY = /^t-[0-9a-f]{24}$/;

/**
 * Attach a temporary draft to its deal (option A, owner 2026-11-06): the temporary state becomes
 * a new revision of the deal's draft — on top of whatever the deal already has, so nothing is
 * lost — and the temporary draft is marked `adoptedInto` (kept, not deleted).
 */
export async function adoptTempDraft(input: { dealId: string; tempKey: string; by: string }) {
  const temp: any = await DealDraft.findOne({ dealId: input.tempKey }).lean();
  if (!temp) return null;
  if (temp.adoptedInto && temp.adoptedInto !== input.dealId) throw new RevisionConflictError(-1);
  const current: any = await DealDraft.findOne({ dealId: input.dealId }).lean();
  const res = await saveDealDraft({
    dealId: input.dealId, offerType: temp.offerType, payload: temp.payload, baseRevision: current?.revision ?? 0,
    by: input.by, kind: "import", note: "Übernommen aus dem vorläufigen Entwurf (ohne Deal-Nummer begonnen)",
  });
  await DealDraft.updateOne({ dealId: input.tempKey }, { $set: { adoptedInto: input.dealId } });
  return res;
}

export async function getDealDraft(dealId: string) {
  return DealDraft.findOne({ dealId }).lean();
}

export async function listRevisions(dealId: string) {
  return DealDraftRevision.find({ dealId }, { _id: 0, revision: 1, at: 1, by: 1, kind: 1, sections: 1, note: 1, offerType: 1 })
    .sort({ revision: -1 }).lean();
}

/** Payload as it was at `revision`: nearest snapshot ≤ revision + forward patches. */
export async function payloadAt(dealId: string, revision: number): Promise<{ payload: unknown; offerType: string } | null> {
  const snap: any = await DealDraftRevision.findOne({ dealId, revision: { $lte: revision }, snapshot: { $exists: true } })
    .sort({ revision: -1 }).lean();
  if (!snap) return null;
  const rest: any[] = await DealDraftRevision.find({ dealId, revision: { $gt: snap.revision, $lte: revision } })
    .sort({ revision: 1 }).lean();
  if (snap.revision + rest.length !== revision) return null; // gap → revision does not exist
  let payload = snap.snapshot as unknown;
  let offerType = snap.offerType as string;
  for (const r of rest) { payload = apply(payload, r.patch as PatchOp[]); offerType = r.offerType ?? offerType; }
  return { payload, offerType };
}
