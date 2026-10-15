import mongoose from "mongoose";

// One row per deal: the last offer email sent for it plus an in-flight lock.
// Shared across all Fly machines — a send whose HTTP connection dropped still
// finishes server-side, so the client's retry must be caught here, not in the UI.
const EmailSendSchema = new mongoose.Schema(
  {
    dealId: { type: String, required: true, unique: true, trim: true },
    inFlightUntil: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    offerNumber: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("EmailSend", EmailSendSchema);
