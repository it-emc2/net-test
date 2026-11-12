// Legacy submissions.
import { Schema, model } from "./define.js";

// Legacy "Submissions" (price + save button in the old JSON panel): payload + computed price.
export const Submission = model("Submission", new Schema({
  payload: { type: Object, required: true },
  computed: { type: Object },
  createdAt: { type: Date, default: Date.now },
}, { collection: "Submissions" }));
