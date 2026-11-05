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
