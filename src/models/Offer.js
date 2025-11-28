// models/Offer.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const HassmannItemSchema = new Schema({
  kind:  { type: String, trim: true },
  productId: { type: String, trim: true, default: '' },   // <- ensure productId (not "id")
  price: { type: Number, default: 0 },
  qty:   { type: Number, default: 0 },
}, { _id: false });

const OfferSchema = new Schema({
  offerNumber: { type: String, unique: true, index: true, required: true },
  offerType:   { type: String, index: true }, 
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },

  payload:     { type: Schema.Types.Mixed, required: true },
  pricing:     { type: Schema.Types.Mixed },

  customer: {
    salutation: String,
    firstName:  String,
    lastName:   String,
    phone:      String,
    email:      String,
    customerNumber: String,
    city:       String,
    postalCode: String,
  },

  // derived for fast querying/analytics
  hassmannQuickAdd: [HassmannItemSchema],

  pdfUrl: String,
}, { minimize: false });

OfferSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Offer = model('Offer', OfferSchema);
export default Offer;
