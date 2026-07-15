// Offer drafts for the new app. Deliberately bound to a SEPARATE collection
// ("net_offer_drafts") so it never mixes with the legacy v3 "drafts" collection
// in the same KonfiguratorDB. dealId + customerName are first-class so drafts
// list cleanly per Bitrix deal; the full offer payload is stored verbatim.
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model } = mongoose;

const OfferDraftSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    offerType: { type: String, required: true, trim: true, default: "bu" },
    dealId: { type: String, trim: true, default: "", index: true },
    customerName: { type: String, trim: true, default: "" },
    payload: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "net_offer_drafts" },
);

OfferDraftSchema.index({ dealId: 1, updatedAt: -1 });

export type OfferDraftDoc = InferSchemaType<typeof OfferDraftSchema>;

const OfferDraft: Model<OfferDraftDoc> =
  (mongoose.models.OfferDraft as Model<OfferDraftDoc>) || model<OfferDraftDoc>("OfferDraft", OfferDraftSchema);

export default OfferDraft;
