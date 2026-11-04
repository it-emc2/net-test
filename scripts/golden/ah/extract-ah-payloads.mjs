#!/usr/bin/env node
// Extracts real AH payloads (offers + recent drafts) from the LOCAL replica, anonymised,
// into tests/golden/fixtures/ah/payloads.json. Kept: everything AH pricing reads (services,
// Arbeitszeit, Finanzierung, payer, postal code, ahZweiPersonen). Scrubbed: names, contact data,
// free text, sketches, mail/post/signature blocks.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const LOCAL = "mongodb://127.0.0.1:27018";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../tests/golden/fixtures/ah/payloads.json");
const DRAFT_LIMIT = 80;

const KEEP_KD = new Set(["payer", "postalCode", "ahZweiPersonen", "salutation", "pflegegrad", "date"]);
const FREE_TEXT = /(note|notiz|bemerk|comment|kommentar|hinweis|freitext|text|sketch)/i;
const DROP_TOP = ["mail", "postal", "signature", "zusammenfassung", "ourSignatureUser", "materials"];

function scrub(o, key = "") {
  if (Array.isArray(o)) return o.map((x) => scrub(x, key));
  if (o && typeof o === "object") {
    return Object.fromEntries(Object.entries(o)
      .filter(([k]) => !/sketch/i.test(k))
      .map(([k, v]) => [k, scrub(v, k)]));
  }
  if (typeof o === "string" && o.startsWith("data:")) return "data:removed";
  if (typeof o === "string" && o.trim() && FREE_TEXT.test(key) && !/json$/i.test(key)) return "ANON_text";
  return o;
}

function anonymise(payload) {
  const p = scrub(structuredClone(payload));
  for (const k of DROP_TOP) delete p[k];
  if (p.Kundendaten && typeof p.Kundendaten === "object") {
    for (const [k, v] of Object.entries(p.Kundendaten)) {
      if (KEEP_KD.has(k)) continue;
      if (typeof v === "string" && v) p.Kundendaten[k] = /mail/i.test(k) ? "anon@example.invalid" : /phone|tel/i.test(k) ? "0000000000" : `ANON_${k}`;
    }
    if (p.Kundendaten.date) p.Kundendaten.date = "2026-01-01";
  }
  if (p.auftragId) p.auftragId = "0";
  return p;
}

const client = new MongoClient(LOCAL, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db("KonfiguratorDB");
const isAh = { $or: [{ "payload.activeOffer": "ah" }, { offerType: "ah" }] };
const offers = await db.collection("offers").find(isAh).sort({ createdAt: -1 }).toArray();
const drafts = await db.collection("drafts").find(isAh).sort({ savedAt: -1 }).limit(DRAFT_LIMIT).toArray();
await client.close();

const cases = [...offers.map((d) => ["offer", d]), ...drafts.map((d) => ["draft", d])]
  .filter(([, d]) => d.payload && typeof d.payload === "object")
  .map(([src, d]) => ({ id: `ah-${src}-${String(d._id).slice(-8)}`, source: src, payload: anonymise(d.payload) }));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(cases, null, 1));
console.log(JSON.stringify({ offers: offers.length, drafts: drafts.length, written: cases.length }));
