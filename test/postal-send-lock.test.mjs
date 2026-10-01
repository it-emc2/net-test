// Run: node test/postal-send-lock.test.mjs — proves one deal = one letter.
import assert from "node:assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import PostalSend from "../src/models/PostalSend.js";
import { claimPostalSend } from "../src/routes/post.js";

const mem = await MongoMemoryServer.create();
await mongoose.connect(mem.getUri());
await PostalSend.init();

// Two parallel clicks / machines: exactly one wins.
const [a, b] = await Promise.all([claimPostalSend("1", false), claimPostalSend("1", false)]);
assert.equal([a, b].filter((x) => x === null).length, 1, "exactly one claim must win");

// Mark sent → plain resend blocked, forced resend allowed.
await PostalSend.updateOne({ dealId: "1" }, { $set: { inFlightUntil: null, sentAt: new Date(), offerNumber: "ANG-1" } });
const blocked = await claimPostalSend("1", false);
assert.equal(blocked?.offerNumber, "ANG-1", "resend within 24h must be blocked");
assert.equal(await claimPostalSend("1", true), null, "forceResend must be allowed");
// …but not while that forced send is in flight.
assert.ok(await claimPostalSend("1", true), "in-flight send must block even a forced one");

console.log("postal-send-lock ok");
await mongoose.disconnect();
await mem.stop();
