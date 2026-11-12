// Logs: Bitrix failures, user actions, PDF conversions.
import { Schema, model } from "./define.js";

export const BitrixLog = model("BitrixLog", new Schema({
  method: { type: String, required: true, trim: true },
  message: { type: String, default: "" },
  params: { type: Schema.Types.Mixed, default: undefined },
  httpMethod: { type: String, enum: ["GET", "POST"], default: "POST" },
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true, collection: "bitrixlogs" }));

export const USER_ACTION_EVENTS = [
  "offer_sent", "offer_bitrix_only", "move_dialog_shown", "move_dialog_dismissed", "move_succeeded",
  "move_failed", "termin_opened", "configurator_opened", "duschabtrennung_leaf_selected", "server_started",
] as const;
// One row per DOCX→PDF / HTML→PDF conversion (main PR #322, admin "PDF-Engine" view). v2 always
// converts through the PDF engine, so it writes engine "gotenberg"; rows expire after 180 days.
export const PDF_LOG_APP = process.env.FLY_APP_NAME || "local";
const PdfLogSchema = new Schema({
  app: { type: String, required: true },
  kind: { type: String, enum: ["docx", "html"], required: true },
  engine: { type: String, enum: ["gotenberg", "fallback", "local"], required: true },
  ms: { type: Number, required: true },
  ok: { type: Boolean, required: true },
  error: { type: String, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: false } });
PdfLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
export const PdfLog = model("PdfLog", PdfLogSchema);

export const UserActionLog = model("UserActionLog", new Schema({
  event: { type: String, required: true, trim: true, enum: USER_ACTION_EVENTS },
  dealId: { type: String, default: "" },
  offerNumber: { type: String, default: "" },
  offerType: { type: String, default: "" },
  message: { type: String, default: "" },
}, { timestamps: true, collection: "useractionlogs" }));
