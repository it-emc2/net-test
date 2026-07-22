// Audit log of Bitrix actions triggered from the offer send flow (timeline
// comment + deal stage move). Separate collection ("net_bitrix_logs") so it
// never mixes with the legacy v3 logs. `ok:false` rows carry the error so
// failures are never silent — they are persisted here as well as returned.
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model } = mongoose;

const BitrixLogSchema = new Schema(
  {
    mode: { type: String, default: "" }, // "email" | "bitrix"
    action: { type: String, default: "" }, // "timeline.comment" | "deal.stage-move"
    entityType: { type: String, default: "" }, // "deal" | "contact"
    entityId: { type: String, default: "" },
    stageId: { type: String, default: "" },
    offerNumber: { type: String, default: "" },
    offerType: { type: String, default: "" },
    attachmentNames: { type: [String], default: [] },
    ok: { type: Boolean, default: false },
    error: { type: String, default: "" },
  },
  { timestamps: true, collection: "net_bitrix_logs" },
);

export type BitrixLogDoc = InferSchemaType<typeof BitrixLogSchema>;

const BitrixLog: Model<BitrixLogDoc> =
  (mongoose.models.BitrixLog as Model<BitrixLogDoc>) || model<BitrixLogDoc>("BitrixLog", BitrixLogSchema);

export default BitrixLog;
