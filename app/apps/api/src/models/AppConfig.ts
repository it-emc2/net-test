// Admin-configurable business constants (KonfiguratorDB "appconfigs").
// Mirrors src/models/AppConfig.js — same model name so the collection matches.
import mongoose, { type Model } from "mongoose";

const { Schema, model } = mongoose;

const AppConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export interface AppConfigDoc {
  key: string;
  value: unknown;
}

export const AppConfig: Model<AppConfigDoc> =
  (mongoose.models.AppConfig as Model<AppConfigDoc>) ||
  model<AppConfigDoc>("AppConfig", AppConfigSchema);

export default AppConfig;
