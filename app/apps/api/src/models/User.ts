// Named users for the internal (configurator + admin) auth gate.
// Schema mirrors the legacy src/models/User.js exactly so it binds to the
// same `users` collection.
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model } = mongoose;

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    name: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    // scrypt hash in the form "salt:hash" (see services/authService.ts)
    passwordHash: { type: String, required: true },
    role: { type: String, default: "user" }, // 'user' | 'admin'
    active: { type: Boolean, default: true },
    signatureDataUrl: { type: String, default: "" },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof UserSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) || model<UserDoc>("User", UserSchema);

export default User;
