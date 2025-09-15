import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true },
    name:      { type: String, required: true },
    price:     { type: Number, required: true, min: 0 }
  },
  { timestamps: true, collection: 'Products' }
);

const Product = mongoose.model('Product', productSchema);
export default Product;