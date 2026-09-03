// scripts/recover-signed-doc.mjs
//
// Regenerates the PDF for one already-signed document inside a SigningRequest
// whose overall status is "expired" (the token flow only blocks new signing,
// the stored signature/payload is untouched). Bypasses loadByToken's expiry
// gate by querying the model directly.
//
//   node scripts/recover-signed-doc.mjs <token-or-_id> [docKey]
//
// docKey defaults to "angebot". Writes <token-or-_id>-<docKey>.pdf to cwd.
import "dotenv/config";
import fs from "fs/promises";
import mongoose from "mongoose";
import SigningRequest from "../src/models/SigningRequest.js";
import { buildSignedPdf } from "../src/routes/signing.js";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "KonfiguratorDB";
if (!MONGODB_URI) throw new Error("Missing MONGODB_URI. Set it in .env");

const [idOrToken, docKey = "angebot"] = process.argv.slice(2);
if (!idOrToken) throw new Error("Usage: node scripts/recover-signed-doc.mjs <token-or-_id> [docKey]");

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });

const sr = await SigningRequest.findOne(
  mongoose.isValidObjectId(idOrToken) ? { _id: idOrToken } : { token: idOrToken },
);
if (!sr) throw new Error("No SigningRequest found for " + idOrToken);

const doc = (sr.documents || []).find((d) => d.key === docKey);
if (!doc) throw new Error(`No document "${docKey}" on this request`);
if (doc.status !== "signed" || !doc.signatureImage) {
  throw new Error(`Document "${docKey}" is not signed (status: ${doc.status})`);
}

const pdf = await buildSignedPdf(sr, doc);
const file = `${sr.token}-${docKey}.pdf`;
await fs.writeFile(file, pdf);
console.log(`✓ ${sr.offerNumber} [${docKey}] → ${file}`);

process.exit(0);
