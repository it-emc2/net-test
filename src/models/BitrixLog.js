import mongoose from "mongoose";

const BitrixLogSchema = new mongoose.Schema(
  {
    method: { type: String, required: true, trim: true }, // e.g. "crm.item.update"
    message: { type: String, default: "" },
    params: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

// Auto-delete log entries after 30 days.
BitrixLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export default mongoose.model("BitrixLog", BitrixLogSchema);
