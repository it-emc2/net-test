// src/models/SigningRequest.js
//
// One document per offer that was sent to a customer for online signing.
// The link in the customer email is /sign/<token>. Everything the customer
// sees is a SNAPSHOT taken at send time — later edits to the offer/draft do
// not change what was signed.
//
// Phase 1: Selbstzahler → a single "angebot" document.
// Phase 2 will add "vollmacht" + "abtretung" for Kassenkunden.

import mongoose from "mongoose";

const { Schema, model } = mongoose;

const SignedDocumentSchema = new Schema(
  {
    // 'angebot' | 'vollmacht' | 'abtretung'
    key: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "signed"],
      default: "pending",
    },

    // fields the customer corrected on the signing page (name, address, …)
    editedFields: { type: Schema.Types.Mixed, default: {} },
    // document-specific extra input not present in the offer payload
    // (e.g. the Vollmacht "Entlastungsguthaben" checkbox in Phase 2)
    extraFields: { type: Schema.Types.Mixed, default: {} },

    // drawn or typed signature as a PNG data URL
    signatureImage: { type: String, default: "" },

    // audit trail — makes the simple e-signature defensible
    place: { type: String, default: "" },
    signedAt: { type: Date, default: null },
    signedIp: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { _id: false },
);

const SigningRequestSchema = new Schema(
  {
    // ≥32-char random hex — the only thing that appears in the URL
    token: { type: String, required: true, unique: true, index: true },

    // link back to the finalized offer
    offerNumber: { type: String, index: true, default: "" },
    offerId: { type: Schema.Types.ObjectId, ref: "Offer", default: null },
    offerType: { type: String, default: "" },

    // 'SZ' | 'KASSE' — derived from payload.Kundendaten.payer
    customerType: {
      type: String,
      enum: ["SZ", "KASSE"],
      required: true,
    },

    // Bitrix linkage for timeline comments (§7b of the plan)
    bitrixEntityType: { type: String, default: "" }, // 'deal' | 'contact'
    bitrixEntityId: { type: String, default: "" },

    // recipient (for the completion copy email)
    customerEmail: { type: String, default: "" },
    customerName: { type: String, default: "" },

    // SNAPSHOT of the offer payload at send time (source of prefill + PDF)
    payloadSnapshot: { type: Schema.Types.Mixed, required: true },

    // subset used to prefill the editable fields on the signing page
    prefill: { type: Schema.Types.Mixed, default: {} },

    documents: { type: [SignedDocumentSchema], default: [] },

    status: {
      type: String,
      enum: ["sent", "opened", "partially_signed", "completed", "expired"],
      default: "sent",
      index: true,
    },

    openedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

// Recompute the rollup status from the per-document states.
SigningRequestSchema.methods.recomputeStatus = function recomputeStatus() {
  if (this.status === "expired") return this.status;
  const docs = this.documents || [];
  const signed = docs.filter((d) => d.status === "signed").length;
  if (signed === 0) {
    this.status = this.openedAt ? "opened" : "sent";
  } else if (signed < docs.length) {
    this.status = "partially_signed";
  } else {
    this.status = "completed";
    if (!this.completedAt) this.completedAt = new Date();
  }
  return this.status;
};

SigningRequestSchema.methods.isExpired = function isExpired() {
  return !!(this.expiresAt && this.expiresAt.getTime() < Date.now());
};

export default model("SigningRequest", SigningRequestSchema);
