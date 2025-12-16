import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },

    // Optional dimensions (in centimeters)
    widthCm: { type: Number, min: 0, default: null },
    heightCm: { type: Number, min: 0, default: null },
    lengthCm: { type: Number, min: 0, default: null },
    source: { type: String, default: null },
  },
  { timestamps: true, collection: "Products" },
);

const Product = mongoose.model("Product", productSchema);
export default Product;
