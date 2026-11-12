// E-mail and letter sends: per-deal lock rows and the e-mail log.
import { Schema, model } from "./define.js";

// One row per deal: last offer email + in-flight lock (unique dealId index = the lock, see
// email/send-lock.ts). Index exists in production (legacy autoIndex); v2 never auto-creates.
export const EmailSend = model("EmailSend", new Schema({
  dealId: { type: String, required: true, unique: true, trim: true },
  inFlightUntil: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  offerNumber: { type: String, default: "" },
}, { timestamps: true, collection: "emailsends" }));

export const EmailLog = model("EmailLog", new Schema({
  to: { type: String, required: true, trim: true },
  subject: { type: String, default: "" },
  body: { type: String, default: "" },
  attachmentNames: { type: [String], default: [] },
  offerNumber: { type: String, default: "" },
  offerType: { type: String, default: "" },
  offerOverrides: { type: Schema.Types.Mixed, default: undefined },
  editedDocx: { type: { name: String, sha256: String, size: Number }, default: undefined },
  sentBy: { type: String, default: "" },
}, { timestamps: true, collection: "emaillogs" }));

// One row per deal: last letter posted + in-flight lock (same lock pattern as EmailSend).
export const PostalSend = model("PostalSend", new Schema({
  dealId: { type: String, required: true, unique: true, trim: true },
  inFlightUntil: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  offerNumber: { type: String, default: "" },
  printjobId: { type: String, default: "" },
}, { timestamps: true, collection: "postalsends" }));
