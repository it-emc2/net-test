import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    customerNumber: {
      type: String,
      trim: true,
      index: true,
      sparse: true,
      unique: true,
    },
    bitrixContactId: {
      type: String,
      trim: true,
      index: true,
    },
    salutation: {
      type: String,
      trim: true,
      default: "",
    },
    firstName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    company: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    street: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    postalCode: {
      type: String,
      trim: true,
      default: "",
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    country: {
      type: String,
      trim: true,
      default: "",
    },
    kundendaten: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    sourceOfferType: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "Kundendaten",
  },
);

CustomerSchema.index({ lastName: 1, firstName: 1, company: 1 });
CustomerSchema.index({ updatedAt: -1 });

export default mongoose.models.Customer || mongoose.model("Customer", CustomerSchema);
