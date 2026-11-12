// Online signing requests.
import { Schema, model } from "./define.js";

// Online signing (legacy src/models/SigningRequest.js): one row per offer sent for signing.
// Same fields, defaults and options (minimize:false keeps empty objects like legacy).
const SignedDocumentSchema = new Schema({
  key: { type: String, required: true, trim: true },
  status: { type: String, enum: ["pending", "signed"], default: "pending" },
  editedFields: { type: Schema.Types.Mixed, default: {} },
  extraFields: { type: Schema.Types.Mixed, default: {} },
  signatureImage: { type: String, default: "" },
  place: { type: String, default: "" },
  signedAt: { type: Date, default: null },
  signedIp: { type: String, default: "" },
  userAgent: { type: String, default: "" },
}, { _id: false });

export const SigningRequest = model("SigningRequest", new Schema({
  token: { type: String, required: true, unique: true, index: true },
  offerNumber: { type: String, index: true, default: "" },
  offerId: { type: Schema.Types.ObjectId, ref: "Offer", default: null },
  offerType: { type: String, default: "" },
  customerType: { type: String, enum: ["SZ", "KASSE"], required: true },
  bitrixEntityType: { type: String, default: "" },
  bitrixEntityId: { type: String, default: "" },
  partnerContactId: { type: String, default: "" },
  customerEmail: { type: String, default: "" },
  customerName: { type: String, default: "" },
  via: { type: String, default: "" },
  payloadSnapshot: { type: Schema.Types.Mixed, required: true },
  prefill: { type: Schema.Types.Mixed, default: {} },
  documents: { type: [SignedDocumentSchema], default: [] },
  status: { type: String, enum: ["sent", "opened", "partially_signed", "completed", "expired"], default: "sent", index: true },
  openedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  // completion (signed PDFs, mail, Bitrix filing, deal move) runs once: the request that sets
  // completionClaimedAt runs it; completionResult records how each step went
  completionClaimedAt: { type: Date, default: null },
  completionResult: { type: Schema.Types.Mixed, default: null },
  expiresAt: { type: Date, default: null },
  // customer clicked "Neuen Link anfordern" on the expired page (once per link)
  newLinkRequestedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false, collection: "signingrequests" }));
