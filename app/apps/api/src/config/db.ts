import mongoose from "mongoose";
import { env } from "./env.js";

/** Connect to the same MongoDB the legacy app uses. */
export async function connectDb(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri, { dbName: env.mongoDb });
  // eslint-disable-next-line no-console
  console.log("MongoDB connected ->", env.mongoDb);
}
