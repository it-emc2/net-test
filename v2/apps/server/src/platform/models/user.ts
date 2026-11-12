// Users (login, role, signature).
import { Schema, model } from "./define.js";

export const User = model("User", new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, default: "" },
  firstName: { type: String, default: "" },
  lastName: { type: String, default: "" },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "user" },
  active: { type: Boolean, default: true },
  signatureDataUrl: { type: String, default: "" },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true, collection: "users" }));
