// src/models/Draft.js
import mongoose from "mongoose";

const DraftSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    offerType: {
      type: String,
      required: true,
      trim: true, // 'bu' | 'bwt' | 'hl' | ...
    },
    payload: {
      type: Object,
      required: true, // result of buildPayload()
    },
    // Copied out of payload.offerNumber so computePrices() can find "the
    // latest saved snapshot for this offer" without deep-querying payload.
    offerNumber: { type: String, index: true },
    pricing: { type: mongoose.Schema.Types.Mixed },
    pricingFingerprint: { type: String },
    // When the user hit save on the client. Differs from createdAt for drafts
    // that were saved offline and only reached the server on a later sync.
    savedAt: {
      type: Date,
      default: Date.now,
    },
    // Client-generated id of the save that produced this draft. Lets a replay
    // of the same queued save be recognised as already-applied (200, not 409).
    clientSaveId: {
      type: String,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

// unique per (offerType, name)
DraftSchema.index({ offerType: 1, name: 1 }, { unique: true });

export default mongoose.model("Draft", DraftSchema);
