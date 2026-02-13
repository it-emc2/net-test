import mongoose from "mongoose";

const EmailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    attachmentNames: { type: [String], default: [] },

    // optional nice-to-have:
    offerNumber: { type: String, default: "" },
    offerType: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("EmailLog", EmailLogSchema);