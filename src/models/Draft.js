// src/models/Draft.js
import mongoose from 'mongoose';

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
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// unique per (offerType, name)
DraftSchema.index({ offerType: 1, name: 1 }, { unique: true });

export default mongoose.model('Draft', DraftSchema);
