// Shared by every model file: SAME collections and fields as the legacy app (ADR 002). Index
// definitions are kept for documentation only: autoIndex/autoCreate are off (db.ts).
// Collection names are explicit so they can never drift from the legacy pluralisation.
import mongoose, { Schema } from "mongoose";

export { Schema };
/** Register a model once (tests and the legacy shims may load a file twice). */
export const model = <T>(name: string, schema: Schema<T>) =>
  (mongoose.models[name] as mongoose.Model<T>) ?? mongoose.model<T>(name, schema);
