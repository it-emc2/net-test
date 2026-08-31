import mongoose from "mongoose";

// Audit trail for the offer-send → "ANG verschickt" flow, so we can tell
// apart user error (dialog dismissed), network error, and Bitrix API error
// after the fact. Same shape/convention as BitrixLog/EmailLog.
const UserActionLogSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "offer_sent",
        "move_dialog_shown",
        "move_dialog_dismissed",
        "move_succeeded",
        "move_failed",
        "termin_opened",
        "configurator_opened",
      ],
    },
    dealId: { type: String, default: "" },
    offerNumber: { type: String, default: "" },
    offerType: { type: String, default: "" },
    message: { type: String, default: "" },
  },
  { timestamps: true }
);

// Auto-delete after 180 days.
UserActionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export default mongoose.model("UserActionLog", UserActionLogSchema);
