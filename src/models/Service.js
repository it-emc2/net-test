import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    time: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, collection: 'Services' }
);

const Service = mongoose.model('Service', serviceSchema);
export default Service;