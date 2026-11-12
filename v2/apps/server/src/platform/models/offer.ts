// Sent offers and legacy drafts.
import { Schema, model } from "./define.js";

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
