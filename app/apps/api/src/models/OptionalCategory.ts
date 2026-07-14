// Admin-managed Optional catalog (KonfiguratorDB "optionalcategories").
// One document per category with embedded items + companions. Falls back to a
// code seed when the collection is empty (see data/optionalCatalog.ts).
import mongoose, { type Model } from "mongoose";
import type { OptionalCategoryDef } from "@emc2/shared";

const { Schema, model } = mongoose;

const CompanionSchema = new Schema(
  { productId: { type: String, required: true }, qtyRatio: { type: Number, default: 1 } },
  { _id: false },
);

const ItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    manual: {
      type: { name: String, price: Number },
      default: null,
    },
    defaultQty: { type: Number, default: 1 },
    companions: { type: [CompanionSchema], default: [] },
  },
  { _id: false },
);

const OptionalCategorySchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    order: { type: Number, default: 0 },
    selection: { type: String, default: "multi" }, // "single" | "multi"
    special: { type: String, default: undefined }, // "sonder"
    items: { type: [ItemSchema], default: [] },
  },
  { timestamps: true },
);

export type OptionalCategoryDoc = OptionalCategoryDef;

export const OptionalCategory: Model<OptionalCategoryDoc> =
  (mongoose.models.OptionalCategory as Model<OptionalCategoryDoc>) ||
  model<OptionalCategoryDoc>("OptionalCategory", OptionalCategorySchema);

export default OptionalCategory;
