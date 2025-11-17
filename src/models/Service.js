import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, default: null },
    internal_name: { type: String, default: null },
    price: { type: Number, required: true, min: 0 },
    time: { type: Number, required: true, min: 0 },
    source:    { type: String, default: null },
  },
  { timestamps: true, collection: 'Services' }
);

const Service = mongoose.model('Service', serviceSchema);
export default Service;