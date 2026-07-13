// Legacy curated multi-supplier price list (KonfiguratorDB "Products").
// Used as the FALLBACK price source while the Vigor catalog is populated.
// Mirrors src/models/Product.js.
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model } = mongoose;

const ProductSchema = new Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 }, // net unit price
    widthCm: { type: Number, default: null },
    heightCm: { type: Number, default: null },
    lengthCm: { type: Number, default: null },
    source: { type: String, default: null },
    manufacturer: { type: String, default: null },
  },
  { timestamps: true, collection: "Products" },
);

export type ProductDoc = InferSchemaType<typeof ProductSchema>;

export const Product: Model<ProductDoc> =
  (mongoose.models.Product as Model<ProductDoc>) || model<ProductDoc>("Product", ProductSchema);

export default Product;
