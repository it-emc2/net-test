// Run: node test/email-send-lock.test.mjs — proves one deal = one offer email.
import assert from "node:assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import EmailSend from "../src/models/EmailSend.js";
import { claimEmailSend } from "../src/routes/email.js";

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri());
await EmailSend.init();

// Two parallel sends / machines: exactly one wins.
const [a, b] = await Promise.all([claimEmailSend("66458", false), claimEmailSend("66458", false)]);
assert.equal([a, b].filter((x) => x === null).length, 1, "exactly one claim must win");

// Retry while the first (client-timed-out) send is still running: blocked, even forced.
assert.ok((await claimEmailSend("66458", true))?.inFlightUntil, "in-flight send must block a retry");

// First send finished → plain resend blocked, forced resend allowed.
await EmailSend.updateOne({ dealId: "66458" }, { $set: { inFlightUntil: null, sentAt: new Date(), offerNumber: "ANG-1" } });
assert.equal((await claimEmailSend("66458", false))?.offerNumber, "ANG-1", "resend within 24h must be blocked");
assert.equal(await claimEmailSend("66458", true), null, "forceResend must be allowed");

console.log("email-send-lock ok");
await mongoose.disconnect();
await mem.stop();
