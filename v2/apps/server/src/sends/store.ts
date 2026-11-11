// One record per send of an offer (ADR 023). NEW collections only: `offer_sends` and the
// GridFS bucket `offer_files` — legacy collections are never written by this module.
//
// Why: in the legacy flow "sent" was not a recorded fact. The client gave up after 60 s while
// the server carried on (mail out, nothing recorded, retry → second mail), the documents that
// left the house were rebuilt later from whatever the code then was, and the price shown later
// could differ from the one in the customer's PDF (audit 2026-11: send S-01…S-05, signing S-04/S-05).
// A send record holds: who sent what to whom, the payload and the price as sent, the exact files,
// and how each step went. The same `sendId` never sends twice.
import { createHash } from "node:crypto";
import mongoose, { Schema } from "mongoose";

const model = <T>(name: string, schema: Schema<T>) =>
  (mongoose.models[name] as mongoose.Model<T>) ?? mongoose.model<T>(name, schema);

export type SendChannel = "email" | "bitrix" | "post" | "onsite";
export type StepName = "pdf" | "mail" | "sentCopy" | "emailLog" | "bitrix";
export type StepStatus = "ok" | "failed" | "skipped";
export interface SendFile { role: "offer" | "productImages" | "editedDocx" | "upload" | "bitrixDoc"; filename: string; fileId: string; size: number; sha256: string }

export const OfferSend = model("OfferSend", new Schema({
  sendId: { type: String, required: true },
  channel: { type: String, required: true },
  status: { type: String, enum: ["running", "done", "failed"], required: true },
  by: { type: String, default: "" },
  dealId: { type: String, default: "" },
  contactId: { type: String, default: "" },
  offerNumber: { type: String, default: "" },
  offerType: { type: String, default: "" },
  to: { type: String, default: "" },
  cc: { type: String, default: "" },
  subject: { type: String, default: "" },
  /** the offer exactly as sent */
  payload: { type: Schema.Types.Mixed, default: null },
  /** the price as sent — frozen here, independent of later recomputation */
  pricing: { type: Schema.Types.Mixed, default: null },
  total: { type: Number, default: null },
  selfPayAmount: { type: Number, default: null },
  files: { type: [Schema.Types.Mixed], default: [] },
  steps: { type: Schema.Types.Mixed, default: {} },
  /** the JSON answer given to the client — returned again for a repeated sendId */
  result: { type: Schema.Types.Mixed, default: null },
  error: { type: String, default: "" },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date, default: null },
}, { minimize: false, collection: "offer_sends" }));

/** Explicit, reviewed index creation (migration 003) — never implicit at boot. */
export async function migrateOfferSendIndexes() {
  await OfferSend.collection.createIndex({ sendId: 1 }, { unique: true, name: "uniq_sendId" });
  await OfferSend.collection.createIndex({ offerNumber: 1, startedAt: -1 }, { name: "offer_started" });
  await OfferSend.collection.createIndex({ dealId: 1, startedAt: -1 }, { name: "deal_started" });
}

export const SEND_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** a run that never finished (crash, restart) may be started again after this */
export const STALE_RUN_MS = 10 * 60 * 1000;

export type Begin =
  | { state: "started" }
  | { state: "running" }
  | { state: "done"; result: unknown };

/**
 * Claims a sendId. "started": this request runs the send. "running": another request is on it.
 * "done": it already went out — the stored answer is returned, nothing is sent again.
 * A failed or stale run is taken over (nothing left the house, or the process died).
 */
export async function beginSend(sendId: string, init: Record<string, unknown>, now = new Date()): Promise<Begin> {
  const fresh = { ...init, sendId, status: "running", startedAt: now, finishedAt: null, steps: {}, files: [], result: null, error: "" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing: any = await OfferSend.findOne({ sendId }).lean();
    if (!existing) {
      try { await OfferSend.create(fresh); return { state: "started" }; }
      catch (e) { if ((e as { code?: number })?.code === 11000) continue; throw e; }
    }
    if (existing.status === "done") return { state: "done", result: existing.result };
    const stale = existing.status === "running" && now.getTime() - new Date(existing.startedAt).getTime() > STALE_RUN_MS;
    if (existing.status === "running" && !stale) return { state: "running" };
    // failed or stale → take over atomically (only one request wins)
    const won = await OfferSend.findOneAndUpdate(
      { _id: existing._id, status: existing.status, startedAt: existing.startedAt },
      { $set: fresh },
    );
    if (won) return { state: "started" };
  }
  return { state: "running" };
}

export async function recordStep(sendId: string, step: StepName, status: StepStatus, error = "") {
  await OfferSend.updateOne({ sendId }, { $set: { [`steps.${step}`]: { status, at: new Date(), ...(error ? { error: error.slice(0, 500) } : {}) } } });
}

export async function patchSend(sendId: string, set: Record<string, unknown>) {
  await OfferSend.updateOne({ sendId }, { $set: set });
}

export async function finishSend(sendId: string, status: "done" | "failed", extra: Record<string, unknown> = {}) {
  await OfferSend.updateOne({ sendId }, { $set: { status, finishedAt: new Date(), ...extra } });
}

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: "offer_files" });

/** Stores one file of a send and links it on the record. */
export async function storeSendFile(sendId: string, role: SendFile["role"], filename: string, content: Buffer): Promise<SendFile> {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const up = bucket().openUploadStream(filename, { metadata: { sendId, role, sha256 } });
  await new Promise<void>((resolve, reject) => { up.once("finish", () => resolve()); up.once("error", reject); up.end(content); });
  const file: SendFile = { role, filename, fileId: String(up.id), size: content.length, sha256 };
  await OfferSend.updateOne({ sendId }, { $push: { files: file } });
  return file;
}

export async function readSendFile(fileId: string): Promise<Buffer | null> {
  let id: mongoose.Types.ObjectId;
  try { id = new mongoose.Types.ObjectId(fileId); } catch { return null; }
  const chunks: Buffer[] = [];
  try {
    for await (const c of bucket().openDownloadStream(id)) chunks.push(c as Buffer);
  } catch { return null; }
  return Buffer.concat(chunks);
}

/** What the client may see of a send (no payload, no file contents). */
export function sendView(s: any) {
  return {
    sendId: s.sendId, channel: s.channel, status: s.status, by: s.by, dealId: s.dealId, offerNumber: s.offerNumber, offerType: s.offerType,
    to: s.to, cc: s.cc, subject: s.subject, total: s.total, selfPayAmount: s.selfPayAmount,
    steps: s.steps ?? {}, files: (s.files ?? []).map((f: SendFile) => ({ role: f.role, filename: f.filename, fileId: f.fileId, size: f.size, sha256: f.sha256 })),
    error: s.error || "", startedAt: s.startedAt, finishedAt: s.finishedAt,
  };
}
