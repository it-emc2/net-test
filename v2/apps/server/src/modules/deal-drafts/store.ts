// Drafts per deal and variant + append-only revision history (ADR 007, ADR 027 A). NEW
// collections only — legacy `drafts` / `offers` are read for import but never written.
//
// Variants (ADR 027 A): a deal has 1..n variants, each a draft document of its own. The first
// variant has NO `variantId` field (every draft saved before variants existed is the first
// variant, without rewriting it); its public id is FIRST_VARIANT_ID ("v1"). Later variants
// carry `variantId` ("v-" + 12 hex). Uniqueness: (dealId, variantId) — an absent field is
// indexed as null, so the first variant is unique too.
//
// Revision numbers are unique per DEAL (one sequence for all variants of a deal; the old index
// uniq_deal_revision {dealId, revision} stays), each revision record says its variant. Why: the
// draft calls of today's UI carry no variant and act on the variant opened last; if another
// variant becomes "last opened" between its load and its save, the revision it sends cannot
// match the other variant's revision — the save is refused as a conflict instead of
// overwriting the wrong variant. The history of one variant is its records, in order; its
// numbers have gaps when several variants are edited.
import mongoose, { Schema } from "mongoose";
import { FIRST_VARIANT_ID } from "@oc/api-contract";
import { apply, diff, jsonEqual, touchedSections, type PatchOp } from "./patch.js";

export const SNAPSHOT_EVERY = 20;

const model = <T>(name: string, schema: Schema<T>) =>
  (mongoose.models[name] as mongoose.Model<T>) ?? mongoose.model<T>(name, schema);

export const DealDraft = model("DealDraft", new Schema({
  dealId: { type: String, required: true },
  /** absent = the deal's first variant (FIRST_VARIANT_ID) */
  variantId: { type: String, default: undefined },
  /** user-given, internal only; absent on the first variant = "Variante 1" */
  variantName: { type: String, default: undefined },
  /** set when another variant of the deal was signed (ADR 027 A, step 3) */
  notChosenAt: { type: Date, default: undefined },
  /** when the variant was last opened with an explicit `variant` (or created): the calls without one act on the latest */
  openedAt: { type: Date, default: undefined },
  /** a deleted (never sent) variant is kept, hidden */
  deletedAt: { type: Date, default: undefined },
  /** the variant this one was copied from */
  copiedFrom: { type: Schema.Types.Mixed, default: undefined },
  /** revision of the last full snapshot in the history (absent on drafts saved before variants) */
  snapshotRev: { type: Number, default: undefined },
  offerType: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  revision: { type: Number, required: true },
  updatedBy: { type: String, default: "" },
  /** temporary drafts (started without a deal number): the deal they were attached to */
  adoptedInto: { type: String, default: undefined },
}, { timestamps: true, minimize: false, collection: "deal_drafts" }));

export const DealDraftRevision = model("DealDraftRevision", new Schema({
  dealId: { type: String, required: true },
  /** absent = the first variant */
  variantId: { type: String, default: undefined },
  revision: { type: Number, required: true },
  /** the revision of the same variant this one follows (absent on records before variants: revision - 1) */
  prev: { type: Number, default: undefined },
  at: { type: Date, required: true },
  by: { type: String, default: "" },
  kind: { type: String, enum: ["save", "restore", "import", "copy"], required: true },
  /** ops turning the previous revision of the variant into this revision */
  patch: { type: Schema.Types.Mixed, required: true },
  /** full payload at the first revision of a variant and every SNAPSHOT_EVERY revisions, for fast reconstruction */
  snapshot: { type: Schema.Types.Mixed },
  offerType: { type: String },
  sections: { type: [String], default: [] },
  note: { type: String, default: "" },
}, { minimize: false, collection: "deal_draft_revisions" }));

/**
 * Explicit, reviewed index creation for the NEW collections (never implicit at boot): the
 * current set. Migration 001 runs it; migration 005 also drops the index of one draft per deal.
 */
export async function migrateDealDraftIndexes() {
  await DealDraft.collection.createIndex({ dealId: 1, variantId: 1 }, { unique: true, name: "uniq_deal_variant" });
  await DealDraftRevision.collection.createIndex({ dealId: 1, revision: 1 }, { unique: true, name: "uniq_deal_revision" });
  await DealDraftRevision.collection.createIndex({ dealId: 1, variantId: 1, revision: -1 }, { name: "deal_variant_revision" });
}

/** the stored value of a public variant id (the first variant has none) */
export const storedVariant = (variantId: string | null | undefined): string | null =>
  !variantId || variantId === FIRST_VARIANT_ID ? null : variantId;
/** filter for one variant of a deal; `variantId: null` also matches the absent field */
export const variantFilter = (dealId: string, variantId: string | null | undefined) => ({ dealId, variantId: storedVariant(variantId) });
export const publicVariantId = (d: { variantId?: string | null }) => d.variantId || FIRST_VARIANT_ID;
const LIVE = { deletedAt: null };

export class RevisionConflictError extends Error {
  override name = "RevisionConflictError";
  readonly statusCode = 409;
  constructor(readonly currentRevision: number) {
    super("Der Entwurf wurde inzwischen an anderer Stelle geändert. Bitte neu laden.");
  }
}
/** migration 005 has not run: the old unique index {dealId} allows only one draft per deal */
export class VariantIndexMissingError extends Error {
  override name = "VariantIndexMissingError";
  constructor() { super("deal_drafts still has the index of one draft per deal (migration 005 not run)"); }
}
/** the revision number was taken by a save of another variant at the same moment — the save is tried again */
class RevisionNumberTaken extends Error {}

const isDup = (e: any) => e?.code === 11000;

export interface SaveInput {
  dealId: string;
  /** public id; absent/"v1" = the first variant */
  variantId?: string | null;
  offerType: string;
  payload: Record<string, unknown>;
  /** revision the client started from; 0 = "no draft yet" */
  baseRevision: number;
  by: string;
  kind?: "save" | "restore" | "import" | "copy";
  note?: string;
  /** fields of a variant document that is created by this save */
  create?: { variantName?: string; openedAt?: Date; copiedFrom?: unknown };
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
 * Saves a new revision of one variant with optimistic concurrency. Returns the current state;
 * an unchanged payload creates no revision. Throws RevisionConflictError if someone saved in
 * between. On a replica set (Atlas, production) the draft update and the revision record are
 * written in ONE transaction — both or neither (ADR 007). A standalone dev/test MongoDB falls
 * back to the same steps without a transaction.
 */
export async function saveDealDraft(input: SaveInput) {
  for (let attempt = 0; ; attempt++) {
    try {
      if (!(await supportsTransactions())) return await saveCore(input);
      const session = await mongoose.startSession();
      try {
        let out: Awaited<ReturnType<typeof saveCore>> | undefined;
        await session.withTransaction(async () => { out = await saveCore(input, session); });
        return out!;
      } finally {
        await session.endSession();
      }
    } catch (e) {
      if (!(e instanceof RevisionNumberTaken) || attempt >= 6) throw e instanceof RevisionNumberTaken ? new RevisionConflictError(-1) : e;
    }
  }
}

async function nextRevisionNumber(dealId: string, opt: object): Promise<number> {
  const [r, d]: any[] = await Promise.all([
    DealDraftRevision.findOne({ dealId }, { revision: 1 }, opt).sort({ revision: -1 }).lean(),
    DealDraft.findOne({ dealId }, { revision: 1 }, opt).sort({ revision: -1 }).lean(),
  ]);
  return Math.max(r?.revision ?? 0, d?.revision ?? 0) + 1;
}

async function saveCore(input: SaveInput, session?: mongoose.ClientSession) {
  const { dealId, offerType, payload, baseRevision, by, kind = "save", note = "" } = input;
  const opt = session ? { session } : {};
  const filter = variantFilter(dealId, input.variantId);
  const current: any = await DealDraft.findOne(filter, null, opt).lean();
  if (current?.deletedAt) throw new RevisionConflictError(-1);
  const currentRev = current?.revision ?? 0;
  if (baseRevision !== currentRev) throw new RevisionConflictError(currentRev);
  if (current && kind === "save" && current.offerType === offerType && jsonEqual(current.payload, payload)) {
    return { dealId, variantId: publicVariantId(filter), revision: currentRev, changed: false };
  }
  const nextRev = await nextRevisionNumber(dealId, opt);
  const ops: PatchOp[] = diff(current?.payload ?? {}, payload);
  const at = new Date();
  // drafts from before variants have no snapshotRev: the multiple-of-20 rule holds while their
  // numbers are consecutive; the first gap (another variant saved in between) takes a snapshot
  const snapshot = !current || nextRev % SNAPSHOT_EVERY === 0 ||
    (typeof current.snapshotRev === "number" ? nextRev - current.snapshotRev >= SNAPSHOT_EVERY : nextRev - currentRev > 1);

  // 1) claim the revision number for the deal (unique {dealId, revision})
  let revDoc: any;
  try {
    [revDoc] = await DealDraftRevision.create([{
      dealId, ...(filter.variantId ? { variantId: filter.variantId } : {}), revision: nextRev, prev: currentRev || undefined, at, by, kind, patch: ops, offerType,
      snapshot: snapshot ? payload : undefined, sections: touchedSections(ops), note,
    }], opt);
  } catch (e) {
    if (isDup(e)) throw new RevisionNumberTaken();
    throw e;
  }
  // 2) move the variant's draft to it (filter on the base revision); same transaction on a replica set
  const undo = async () => { if (!session) await DealDraftRevision.deleteOne({ _id: revDoc._id }).catch(() => {}); };
  const set = { payload, offerType, revision: nextRev, updatedBy: by, ...(snapshot ? { snapshotRev: nextRev } : {}) };
  try {
    if (current) {
      const r = await DealDraft.updateOne({ ...filter, revision: currentRev }, { $set: set }, opt);
      if (r.matchedCount !== 1) {
        await undo();
        throw new RevisionConflictError((await DealDraft.findOne(filter, null, opt).lean() as any)?.revision ?? -1);
      }
    } else {
      const c = input.create ?? {};
      await DealDraft.create([{
        dealId, ...(filter.variantId ? { variantId: filter.variantId } : {}), ...set,
        ...(c.variantName ? { variantName: c.variantName } : {}), ...(c.openedAt ? { openedAt: c.openedAt } : {}),
        ...(c.copiedFrom ? { copiedFrom: c.copiedFrom } : {}),
      }], opt);
    }
  } catch (e) {
    if (isDup(e)) {
      await undo();
      // the index of one draft per deal (before migration 005) refuses a second variant
      if (filter.variantId && (e as any).keyPattern && !("variantId" in (e as any).keyPattern)) throw new VariantIndexMissingError();
      throw new RevisionConflictError((await DealDraft.findOne(filter).lean() as any)?.revision ?? -1);
    }
    throw e;
  }
  return { dealId, variantId: publicVariantId(filter), revision: nextRev, changed: true };
}

/** Temporary key for a draft started without a deal number: "t-" + 24 hex (unguessable). */
export const TEMP_KEY = /^t-[0-9a-f]{24}$/;

/** The live variants of a deal, without payloads, first variant first, then by creation. */
export async function liveVariants(dealId: string): Promise<any[]> {
  const docs: any[] = await DealDraft.find({ dealId, ...LIVE }, { payload: 0 }).lean();
  return docs.sort((a, b) => (a.variantId ? 1 : 0) - (b.variantId ? 1 : 0) || +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0));
}

/**
 * The variant the calls WITHOUT `variant` act on (today's UI): the live variant with the latest
 * `openedAt` (set when a variant is created or opened with an explicit `variant`); none opened
 * that way → the first variant (or the oldest live one). null: the deal has no draft.
 */
export function defaultOf(variants: any[]): any | null {
  let best: any = null;
  for (const v of variants) if (!best || +new Date(v.openedAt ?? 0) > +new Date(best.openedAt ?? 0)) best = v;
  return best;
}
export async function defaultVariantId(dealId: string): Promise<string | null> {
  const d = defaultOf(await liveVariants(dealId));
  return d ? publicVariantId(d) : null;
}

/** A variant's draft; `variantId` undefined → the variant opened last. null when there is none (or it is deleted). */
export async function getDealDraft(dealId: string, variantId?: string | null) {
  const id = variantId ?? (await defaultVariantId(dealId));
  if (!id) return null;
  return DealDraft.findOne({ ...variantFilter(dealId, id), ...LIVE }).lean();
}

/** marks a variant as the one opened last (no new revision, `updatedAt` unchanged) */
export async function touchOpened(dealId: string, variantId: string, at = new Date()) {
  await DealDraft.updateOne({ ...variantFilter(dealId, variantId), ...LIVE }, { $set: { openedAt: at } }, { timestamps: false });
}

/**
 * Attach a temporary draft to its deal (option A, owner 2026-11-06): the temporary state becomes
 * a new revision of the deal's draft — on top of whatever the deal already has, so nothing is
 * lost — and the temporary draft is marked `adoptedInto` (kept, not deleted). With variants
 * (ADR 027 A) every variant of the temporary draft is carried over under the same id; the
 * variant opened last there becomes the one opened last in the deal. The answer is that
 * variant's save result (what today's UI continues with) plus all variants.
 */
export async function adoptTempDraft(input: { dealId: string; tempKey: string; by: string }) {
  const temps: any[] = await DealDraft.find({ dealId: input.tempKey, ...LIVE }).lean();
  if (!temps.length) return null;
  if (temps.some((t) => t.adoptedInto && t.adoptedInto !== input.dealId)) throw new RevisionConflictError(-1);
  temps.sort((a, b) => (a.variantId ? 1 : 0) - (b.variantId ? 1 : 0) || +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0));
  const tempDefault = publicVariantId(defaultOf(temps));
  const results: { variantId: string; revision: number; changed: boolean }[] = [];
  for (const t of temps) {
    const vid = publicVariantId(t);
    const current: any = await DealDraft.findOne(variantFilter(input.dealId, vid)).lean();
    const res = await saveDealDraft({
      dealId: input.dealId, variantId: vid, offerType: t.offerType, payload: t.payload, baseRevision: current?.revision ?? 0,
      by: input.by, kind: "import", note: "Übernommen aus dem vorläufigen Entwurf (ohne Deal-Nummer begonnen)",
      create: { variantName: t.variantName, ...(t.copiedFrom ? { copiedFrom: t.copiedFrom } : {}) },
    });
    results.push({ variantId: vid, revision: res.revision, changed: res.changed });
    if (t.variantName && current && current.variantName !== t.variantName && vid !== FIRST_VARIANT_ID) {
      await DealDraft.updateOne(variantFilter(input.dealId, vid), { $set: { variantName: t.variantName } }, { timestamps: false });
    }
  }
  await DealDraft.updateMany({ dealId: input.tempKey, ...LIVE }, { $set: { adoptedInto: input.dealId } });
  if (temps.length > 1 || (await liveVariants(input.dealId)).length > 1) await touchOpened(input.dealId, tempDefault);
  const main = results.find((r) => r.variantId === tempDefault) ?? results[0]!;
  return { dealId: input.dealId, variantId: main.variantId, revision: main.revision, changed: main.changed, variants: results };
}

export async function listRevisions(dealId: string, variantId?: string | null) {
  return DealDraftRevision.find(variantFilter(dealId, variantId), { _id: 0, revision: 1, at: 1, by: 1, kind: 1, sections: 1, note: 1, offerType: 1 })
    .sort({ revision: -1 }).lean();
}

/**
 * Payload of a variant as it was at `revision`: nearest snapshot ≤ revision + forward patches.
 * The chain is checked: each record follows the one before it (`prev`; records written before
 * variants have none and follow revision - 1), so a missing record never yields a wrong state.
 */
export async function payloadAt(dealId: string, revision: number, variantId?: string | null): Promise<{ payload: unknown; offerType: string } | null> {
  const f = variantFilter(dealId, variantId);
  if (!(await DealDraftRevision.exists({ ...f, revision }))) return null;
  const snap: any = await DealDraftRevision.findOne({ ...f, revision: { $lte: revision }, snapshot: { $exists: true } })
    .sort({ revision: -1 }).lean();
  if (!snap) return null;
  const rest: any[] = await DealDraftRevision.find({ ...f, revision: { $gt: snap.revision, $lte: revision } })
    .sort({ revision: 1 }).lean();
  let before = snap.revision as number;
  for (const r of rest) {
    if ((r.prev ?? r.revision - 1) !== before) return null; // gap → cannot be reconstructed
    before = r.revision;
  }
  if (before !== revision) return null;
  let payload = snap.snapshot as unknown;
  let offerType = snap.offerType as string;
  for (const r of rest) { payload = apply(payload, r.patch as PatchOp[]); offerType = r.offerType ?? offerType; }
  return { payload, offerType };
}
