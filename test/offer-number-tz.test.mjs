// Run: node test/offer-number-tz.test.mjs — server-side renumbering uses Berlin time, not UTC.
import assert from "node:assert";
import { berlinOfferNumber } from "../src/routes/drafts.js";

// Deal 67204: renumbered at 12:33:15Z (winter, UTC+1) → must read 13:33:15.
assert.equal(berlinOfferNumber(new Date("2026-11-16T12:33:15Z")), "ANG2026-1116-133315");
// Summer time (UTC+2), across midnight into the next day.
assert.equal(berlinOfferNumber(new Date("2026-07-31T22:05:09Z")), "ANG2026-0801-000509");
console.log("ok");
process.exit(0);
