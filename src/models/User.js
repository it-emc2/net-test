// src/models/User.js
// Named users for the internal (configurator + admin) auth gate.
import mongoose from "mongoose";

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    // scrypt hash in the form "salt:hash" (see services/authService.js)
    passwordHash: { type: String, required: true },
    role: { type: String, default: "user" }, // 'user' | 'admin'
    active: { type: Boolean, default: true },
    // PNG data URL of the person's signature (assigned in admin); used as the
    // document signature image when this user is the Ansprechpartner.
    signatureDataUrl: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default model("User", UserSchema);
