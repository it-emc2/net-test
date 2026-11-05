#!/usr/bin/env node
// PII scan for committed test fixtures: collects every customer string (names, streets,
// phones, e-mails, cities from offers/drafts Kundendaten) and every staff name (users) from
// the LOCAL replica and reports which of them occur in the given fixture files.
// Output is masked (first two letters only). Exit code 1 if staff names are found.
//   node scripts/golden/pii-scan.mjs tests/golden/fixtures/**/*.json
// Run from the repo root; needs the local replica (scripts/replica) on 127.0.0.1:27018.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../v2/package.json", import.meta.url));
const { MongoClient } = require("mongodb");

const files = process.argv.slice(2);
const mask = (t) => t.replace(/[A-Za-zÄÖÜäöüß]/g, (c, i) => (i < 2 ? c : "*")).replace(/\d/g, "#");
const GENERIC = /^(Kassenkunde|Selbstzahler|ja|nein|true|false|on|off|Frau|Herr|Familie|Divers|Deutschland|\d{1,6}([.,]\d+)?)$/i;

const c = new MongoClient("mongodb://127.0.0.1:27018");
await c.connect();
const db = c.db("KonfiguratorDB");
const customer = new Set();
for (const coll of ["offers", "drafts"]) {
  for await (const d of db.collection(coll).find({}, { projection: { "payload.Kundendaten": 1, customer: 1 } })) {
    for (const blk of [d.payload?.Kundendaten, d.customer]) {
      for (const [k, v] of Object.entries(blk || {})) {
        if (typeof v === "string" && v.trim().length >= 4 && !GENERIC.test(v.trim()) &&
            /name|street|strasse|address|city|ort|mail|phone|tel|mobil|geburt|versich|kvnr|partner|p2/i.test(k)) customer.add(v.trim());
      }
    }
  }
}
const staff = new Set();
for (const u of await db.collection("users").find({}, { projection: { name: 1, firstName: 1, lastName: 1, email: 1 } }).toArray()) {
  for (const v of [u.firstName, u.lastName, u.email, ...String(u.name || "").split(/\s+/)]) {
    if (v && String(v).length >= 4 && !/^emc2$/i.test(v)) staff.add(String(v));
  }
}
await c.close();

let staffHits = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const ch = [...customer].filter((t) => text.includes(t));
  const sh = [...staff].filter((t) => text.includes(t));
  staffHits += sh.length;
  console.log(`${f}: customer tokens ${ch.length}/${customer.size}${ch.length ? " → " + ch.slice(0, 15).map(mask).join(" ") : ""} | staff ${sh.length}${sh.length ? " → " + sh.map(mask).join(" ") : ""}`);
}
process.exit(staffHits ? 1 : 0);
