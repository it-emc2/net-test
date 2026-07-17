// Log of offer emails sent from the new app. Separate collection
// ("net_email_logs") so it never mixes with the legacy v3 "emaillogs".
// Stores only recipient + content + attachment names (no binaries).
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model } = mongoose;

const EmailLogSchema = new Schema(
  {
    to: { type: String, required: true, trim: true },
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    attachmentNames: { type: [String], default: [] },
    offerNumber: { type: String, default: "" },
    offerType: { type: String, default: "" },
  },
  { timestamps: true, collection: "net_email_logs" },
);

export type EmailLogDoc = InferSchemaType<typeof EmailLogSchema>;

const EmailLog: Model<EmailLogDoc> =
  (mongoose.models.EmailLog as Model<EmailLogDoc>) || model<EmailLogDoc>("EmailLog", EmailLogSchema);

export default EmailLog;
