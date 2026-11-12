// Business settings (admin-editable values).
import { Schema, model } from "./define.js";

export const AppConfig = model("AppConfig", new Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true, collection: "appconfigs" }));
