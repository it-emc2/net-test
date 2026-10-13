import mongoose from "mongoose";

// One row per deal: the last letter posted for it plus an in-flight lock.
// Shared across all Fly machines, so a deal can never get two letters from
// parallel or repeated clicks — a resend needs an explicit forceResend.
const PostalSendSchema = new mongoose.Schema(
  {
    dealId: { type: String, required: true, unique: true, trim: true },
    inFlightUntil: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    offerNumber: { type: String, default: "" },
    printjobId: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("PostalSend", PostalSendSchema);
