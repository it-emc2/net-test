import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerNumber: { type: String, index: true },
    firstName: String,
    lastName: String,
    company: String,
    email: String,
    phone: String,
    street: String,
    city: String,
    postalCode: String,
    state: String,
    country: String,

    // any other fields you actually have in the Kundendaten form:
    // e.g. differentSite, isExisting, etc.
  },
  { timestamps: true },
);

customerSchema.index(
  {
    firstName: "text",
    lastName: "text",
    company: "text",
    email: "text",
  },
  { default_language: "none" },
);

const Customer =
  mongoose.models.Customer || mongoose.model("Customer", customerSchema);

export default Customer;
