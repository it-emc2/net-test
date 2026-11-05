// Mongoose models — SAME collections and fields as the legacy app (ADR 002). Index
// definitions are kept for documentation only: autoIndex/autoCreate are off (db.ts).
// Collection names are explicit so they can never drift from the legacy pluralisation.
import mongoose, { Schema } from "mongoose";

const model = <T>(name: string, schema: Schema<T>) =>
  (mongoose.models[name] as mongoose.Model<T>) ?? mongoose.model<T>(name, schema);

export const Product = model("Product", new Schema({
  productId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  widthCm: { type: Number, min: 0, default: null },
  heightCm: { type: Number, min: 0, default: null },
  lengthCm: { type: Number, min: 0, default: null },
  source: { type: String, default: null },
  manufacturer: { type: String, default: null },
  /** supplier / cleverbad article number (main@42150092, scripts/syncCleverbadArticleNumbers.mjs) */
  articleNumber: { type: String, default: null },
}, { timestamps: true, collection: "Products" }));

export const Service = model("Service", new Schema({
  serviceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  internal_name: { type: String, default: null },
  price: { type: Number, required: true, min: 0 },
  time: { type: Number, required: true, min: 0 },
  source: { type: String, default: null },
}, { timestamps: true, collection: "Services" }));

export const User = model("User", new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, default: "" },
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "user" },
  active: { type: Boolean, default: true },
  signatureDataUrl: { type: String, default: "" },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true, collection: "users" }));

export const AppConfig = model("AppConfig", new Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true, collection: "appconfigs" }));

const HassmannItem = new Schema({
  kind: { type: String, trim: true },
  productId: { type: String, trim: true, default: "" },
  price: { type: Number, default: 0 },
  qty: { type: Number, default: 0 },
}, { _id: false });

export const Offer = model("Offer", new Schema({
  offerNumber: { type: String, unique: true, index: true, required: true },
  offerType: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  payload: { type: Schema.Types.Mixed, required: true },
  pricing: { type: Schema.Types.Mixed },
  locked: { type: Boolean, default: true },
  pricingFingerprint: { type: String },
  customer: {
    salutation: String, firstName: String, lastName: String, phone: String,
    email: String, customerNumber: String, city: String, postalCode: String,
  },
  hassmannQuickAdd: [HassmannItem],
  pdfUrl: String,
}, { minimize: false, collection: "offers" }));

export const Draft = model("Draft", new Schema({
  name: { type: String, required: true, trim: true },
  offerType: { type: String, required: true, trim: true },
  payload: { type: Object, required: true },
  offerNumber: { type: String, index: true },
  pricing: { type: Schema.Types.Mixed },
  pricingFingerprint: { type: String },
  savedAt: { type: Date, default: Date.now },
  clientSaveId: { type: String },
}, { timestamps: true, collection: "drafts" }));

const str = { type: String, trim: true, default: "" };
export const Customer = model("Customer", new Schema({
  customerNumber: { type: String, trim: true, index: true, sparse: true, unique: true },
  bitrixContactId: { type: String, trim: true, index: true },
  salutation: str,
  firstName: { ...str, index: true },
  lastName: { ...str, index: true },
  company: { ...str, index: true },
  email: { ...str, lowercase: true, index: true },
  phone: str, street: str,
  city: { ...str, index: true },
  postalCode: str, state: str, country: str,
  kundendaten: { type: Schema.Types.Mixed, default: {} },
  sourceOfferType: { ...str, index: true },
}, { timestamps: true, collection: "Kundendaten" }));

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
export const UserActionLog = model("UserActionLog", new Schema({
  event: { type: String, required: true, trim: true, enum: USER_ACTION_EVENTS },
  dealId: { type: String, default: "" },
  offerNumber: { type: String, default: "" },
  offerType: { type: String, default: "" },
  message: { type: String, default: "" },
}, { timestamps: true, collection: "useractionlogs" }));

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
