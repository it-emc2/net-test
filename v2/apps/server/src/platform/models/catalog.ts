// Price catalog: products and services.
import { Schema, model } from "./define.js";

export const Product = model("Product", new Schema({
  productId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  widthCm: { type: Number, min: 0, default: null },
  heightCm: { type: Number, min: 0, default: null },
  lengthCm: { type: Number, min: 0, default: null },
  source: { type: String, default: null },
  manufacturer: { type: String, default: null },
  /** supplier / cleverbad article number (main@42150092, scripts/syncCleverbadArticleNumbers.mjs) */
  articleNumber: { type: String, default: null },
}, { timestamps: true, collection: "Products" }));

export const Service = model("Service", new Schema({
  serviceId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  description: { type: String, default: null },
  internal_name: { type: String, default: null },
  price: { type: Number, required: true, min: 0 },
  time: { type: Number, required: true, min: 0 },
  source: { type: String, default: null },
}, { timestamps: true, collection: "Services" }));
