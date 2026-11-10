import mongoose from "mongoose";

// Session recordings (rrweb) for the users in RECORD_USERS. The recording itself
// lives in Backblaze B2 (services/b2.js); Mongo only keeps the index + the
// server-side request log of the same user, so a replay can be read next to
// what the backend did. Both expire with the B2 lifecycle rule (31 days).
const TTL = 60 * 60 * 24 * 31;
export const RECORDING_APP = process.env.FLY_APP_NAME || "local"; // dev servers share the DB

const RecordingSessionSchema = new mongoose.Schema(
  {
    app: { type: String, required: true },
    sid: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    day: { type: String, required: true }, // YYYY-MM-DD (Europe/Berlin)
    startedAt: { type: Date, required: true },
    lastAt: { type: Date, required: true },
    ua: { type: String, default: "" },
    viewport: { type: String, default: "" },
    errorCount: { type: Number, default: 0 },
    bytes: { type: Number, default: 0 },
    chunks: [{ _id: false, seq: Number, key: String, bytes: Number, from: Date, to: Date, errorCount: Number }],
  },
  { timestamps: true }
);
RecordingSessionSchema.index({ app: 1, startedAt: -1 });
RecordingSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL });

const RecordingRequestSchema = new mongoose.Schema(
  {
    app: { type: String, required: true },
    email: { type: String, required: true },
    at: { type: Date, required: true },
    method: String,
    path: String,
    status: Number,
    ms: Number,
  },
  { versionKey: false }
);
RecordingRequestSchema.index({ app: 1, email: 1, at: 1 });
RecordingRequestSchema.index({ at: 1 }, { expireAfterSeconds: TTL });

export const RecordingSession = mongoose.model("RecordingSession", RecordingSessionSchema);
export const RecordingRequest = mongoose.model("RecordingRequest", RecordingRequestSchema);
