// Customers (collection Kundendaten).
import { Schema, model } from "./define.js";

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
