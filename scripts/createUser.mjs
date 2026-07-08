// scripts/createUser.mjs — create or update an internal user.
// Usage: node scripts/createUser.mjs <email> <password> [name] [role]
import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import { hashPassword } from "../src/services/authService.js";

const [, , email, password, name = "", role = "user"] = process.argv;

if (!email || !password) {
  console.error("Usage: node scripts/createUser.mjs <email> <password> [name] [role]");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: process.env.MONGODB_DB || "KonfiguratorDB",
});

const passwordHash = hashPassword(password);
const doc = await User.findOneAndUpdate(
  { email: email.toLowerCase().trim() },
  { $set: { passwordHash, name, role, active: true } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);

console.log(`✓ user ready: ${doc.email} (role: ${doc.role}) in DB ${mongoose.connection.name}`);
await mongoose.disconnect();
process.exit(0);
