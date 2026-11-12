import mongoose from "mongoose";

// One row per DOCX→PDF / HTML→PDF conversion (see utils/gotenberg.js withGotenberg).
// engine: gotenberg | fallback (local after a Gotenberg failure) | local (no GOTENBERG_URL)
const PdfLogSchema = new mongoose.Schema(
  {
    app: { type: String, required: true }, // FLY_APP_NAME or "local" — dev servers share this DB
    kind: { type: String, enum: ["docx", "html"], required: true },
    engine: { type: String, enum: ["gotenberg", "fallback", "local"], required: true },
    ms: { type: Number, required: true },
    ok: { type: Boolean, required: true },
    error: { type: String, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PdfLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const PDF_LOG_APP = process.env.FLY_APP_NAME || "local";

export default mongoose.model("PdfLog", PdfLogSchema);
