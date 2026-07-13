// Customer records. Mirrors the legacy src/models/Customer.js and binds to the
// SAME collection ("Kundendaten") so the new API reads existing customer data.
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model } = mongoose;

const CustomerSchema = new Schema(
  {
    customerNumber: { type: String, trim: true, index: true, sparse: true, unique: true },
    bitrixContactId: { type: String, trim: true, index: true },
    salutation: { type: String, trim: true, default: "" },
    firstName: { type: String, trim: true, default: "", index: true },
    lastName: { type: String, trim: true, default: "", index: true },
    company: { type: String, trim: true, default: "", index: true },
    email: { type: String, trim: true, lowercase: true, default: "", index: true },
    phone: { type: String, trim: true, default: "" },
    street: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "", index: true },
    postalCode: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    country: { type: String, trim: true, default: "" },
    kundendaten: { type: Schema.Types.Mixed, default: {} },
    sourceOfferType: { type: String, trim: true, default: "", index: true },
  },
  { timestamps: true, collection: "Kundendaten" },
);

export type CustomerDoc = InferSchemaType<typeof CustomerSchema>;

export const Customer: Model<CustomerDoc> =
  (mongoose.models.Customer as Model<CustomerDoc>) ||
  model<CustomerDoc>("Customer", CustomerSchema);

export default Customer;
