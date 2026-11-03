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

    // Hand changes on this offer (audit): OC overrides (wording/price) and/or an
    // uploaded edited DOCX. Absent = sent exactly as OC generated it.
    offerOverrides: { type: mongoose.Schema.Types.Mixed, default: undefined },
    editedDocx: {
      type: { name: String, sha256: String, size: Number },
      default: undefined,
    },
    sentBy: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("EmailLog", EmailLogSchema);