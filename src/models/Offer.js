// src/models/Offer.js
import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const HassmannItemSchema = new Schema(
  {
    kind:      { type: String, trim: true },
    productId: { type: String, trim: true },
    // keep what the user typed (localized) AND an optional parsed number
    priceRaw:  { type: String, trim: true },
    price:     { type: Number }, // euros, optional
    qty:       { type: Number, default: 0 },
  },
  { _id: false }
);

const OfferSchema = new Schema(
  {
    offerNumber: { type: String, required: true, unique: true, index: true },
    payload:     { type: Schema.Types.Mixed, required: true }, // full form snapshot
    pricing:     { type: Schema.Types.Mixed },                 // full pricing snapshot (server)

    customer: {
      salutation:     String,
      firstName:      String,
      lastName:       String,
      phone:          String,
      email:          String,
      customerNumber: String,
      city:           String,
      postalCode:     String,
    },

    hassmannQuickAdd: [HassmannItemSchema],
    pdfUrl: String, // optional
  },
  { minimize: false, timestamps: true }
);

OfferSchema.index({ createdAt: -1 });

const Offer = model('Offer', OfferSchema);
export default Offer;
