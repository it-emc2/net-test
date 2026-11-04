#!/usr/bin/env node
// Extracts anonymised offer + draft DOCUMENTS from the LOCAL replica for API contract tests
// → tests/golden/fixtures/docs-db/{offers,drafts}.json (Extended JSON for ObjectId/Date).
// Names become deterministic pseudonyms (Vorname0007 / Kunde0007) so search has real hits;
// contact data, free text and sketches are removed. City/PLZ are kept (not personal alone).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EJSON } from "bson";
import { MongoClient } from "mongodb";

const OUT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), "../../tests/golden/fixtures/docs-db");
const FREE = /(note|notiz|bemerk|comment|kommentar|hinweis|freitext|text|sketch|signature|rawImport)/i;
const people = new Map();
const pseudo = (first, last) => {
  const k = `${first}|${last}`.toLowerCase();
  if (!people.has(k)) people.set(k, String(people.size + 1).padStart(4, "0"));
  const n = people.get(k);
  return { first: first ? `Vorname${n}` : "", last: last ? `Kunde${n}` : "" };
};

function scrub(o, key = "") {
  if (Array.isArray(o)) return o.map((x) => scrub(x, key));
  if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) {
    return Object.fromEntries(Object.entries(o).filter(([k]) => !/sketch|signature/i.test(k)).map(([k, v]) => [k, scrub(v, k)]));
  }
  if (typeof o === "string" && o.startsWith("data:")) return "data:removed";
  if (typeof o === "string" && o.trim() && FREE.test(key) && !/json$/i.test(key)) return "ANON_text";
  return o;
}

function anonPerson(kd) {
  if (!kd || typeof kd !== "object") return kd;
  const { first, last } = pseudo(kd.firstName, kd.lastName);
  const out = { ...kd };
  if ("firstName" in out) out.firstName = first;
  if ("lastName" in out) out.lastName = last;
  for (const k of Object.keys(out)) {
    if (/mail/i.test(k) && out[k]) out[k] = `${(last || "kunde").toLowerCase()}@example.invalid`;
    else if (/phone|tel|mobil|fax/i.test(k) && out[k]) out[k] = "0000000000";
    else if (/street|strasse|address|adresse/i.test(k) && typeof out[k] === "string" && out[k]) out[k] = "Musterweg 1";
    else if (/geburt|birth|versich|kvnr|insur/i.test(k) && out[k]) out[k] = "ANON";
    else if (/^p2|partner|ansprech|company|firma|name$/i.test(k) && typeof out[k] === "string" && out[k] && !["firstName", "lastName"].includes(k)) out[k] = `ANON_${k}`;
  }
  return out;
}

const GENERIC = /^(Kassenkunde|Selbstzahler|ja|nein|true|false|on|off|Frau|Herr|Familie|Divers|\d{1,6}([.,]\d+)?)$/i;
const cities = new Map();
const pseudoCity = (c) => { if (!c) return c; const k = String(c).toLowerCase(); if (!cities.has(k)) cities.set(k, `Ort${cities.size + 1}`); return cities.get(k); };

function collect(o, out) {
  if (Array.isArray(o)) o.forEach((x) => collect(x, out));
  else if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) Object.values(o).forEach((v) => collect(v, out));
  else if (typeof o === "string" && o.trim().length >= 4 && !GENERIC.test(o.trim()) && !o.startsWith("data:")) out.add(o.trim());
}
function replaceAll(o, tokens) {
  if (Array.isArray(o)) return o.map((x) => replaceAll(x, tokens));
  if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, replaceAll(v, tokens)]));
  if (typeof o === "string") { let s = o; for (const t of tokens) if (s.includes(t)) s = s.split(t).join("ANON"); return s; }
  return o;
}
const STAFF_KEYS = /(contact|ansprechpartner|ourSignatureUser|berater|mitarbeiter|techniker|monteur|createdBy|user)$/i;
function blankStaff(o) {
  if (Array.isArray(o)) return o.map(blankStaff);
  if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) {
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" && v && STAFF_KEYS.test(k) ? "ANON_staff" : blankStaff(v)]));
  }
  return o;
}

// Strings that contain serialised JSON (legacy stores some blocks that way) are unpacked,
// anonymised like everything else, and packed again.
function unpackJson(o) {
  if (Array.isArray(o)) return o.map(unpackJson);
  if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, unpackJson(v)]));
  if (typeof o === "string" && /^\s*[[{]/.test(o)) {
    try { return { __json__: unpackJson(JSON.parse(o)) }; } catch { return o; }
  }
  return o;
}
function packJson(o) {
  if (Array.isArray(o)) return o.map(packJson);
  if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) {
    if (Object.keys(o).length === 1 && "__json__" in o) return JSON.stringify(packJson(o.__json__));
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, packJson(v)]));
  }
  return o;
}
const PERSONISH = (o) => o && typeof o === "object" && !Array.isArray(o) && ("firstName" in o || "lastName" in o || "street" in o || "email" in o);
function eachPerson(o, fn) {
  if (Array.isArray(o)) return o.map((x) => eachPerson(x, fn));
  if (o && typeof o === "object" && !(o instanceof Date) && !o._bsontype) {
    const inner = Object.fromEntries(Object.entries(o).map(([k, v]) => [k, eachPerson(v, fn)]));
    return PERSONISH(inner) ? fn(inner) : inner;
  }
  return o;
}

function anonDoc(d) {
  let doc = unpackJson(scrub(EJSON.parse(EJSON.stringify(d, { relaxed: false }), { relaxed: false })));
  doc = scrub(doc); // free-text keys inside unpacked JSON
  delete doc.payload?.mail; delete doc.payload?.postal; delete doc.payload?.zusammenfassung;
  // 1) collect every string from every person-like object (any depth) + top-level contact fields
  const tokens = new Set();
  eachPerson(doc, (p) => { collect(p, tokens); return p; });
  for (const k of ["firstName", "lastName", "email", "phone", "street"]) if (typeof doc[k] === "string") tokens.add(doc[k]);
  // 2) pseudonymise people + cities everywhere
  let firstPseudo = null;
  doc = eachPerson(doc, (p) => {
    const out = anonPerson(p);
    if ("city" in out && out.city) out.city = pseudoCity(out.city);
    if (!firstPseudo && (out.firstName || out.lastName)) firstPseudo = `${out.firstName || "Vorname"}-${out.lastName || "Kunde"}`;
    return out;
  });
  for (const k of ["firstName", "lastName", "email", "phone", "street"]) if (doc[k]) doc[k] = "ANON";
  // 3) draft names carry the customer name: ANG-<TYPE>-<First>-<Last>-<DDMMYYYY>-<HHMMSS>
  if (typeof doc.name === "string" && /^ANG-/.test(doc.name)) {
    const parts = doc.name.split("-");
    const tail = parts.slice(-2).every((x) => /^\d+$/.test(x)) ? parts.slice(-2) : [];
    doc.name = [parts[0], parts[1], firstPseudo || "NoCustomer", ...tail].join("-") + (tail.length ? "" : `-${String(d._id).slice(-6)}`);
  }
  // 4) scrub every collected customer string wherever else it appears; blank staff fields
  const keep = new Set(["Kassenkunde", "Selbstzahler", "Deutschland"]);
  const pseudoValues = new Set();
  eachPerson(doc, (p) => { collect(p, pseudoValues); return p; });
  const scrubTokens = [...tokens].filter((t) => !keep.has(t) && !pseudoValues.has(t)).sort((a, b) => b.length - a.length);
  const staffTokens = [...STAFF].sort((a, b) => b.length - a.length);
  return packJson(blankStaff(replaceAll(replaceAll(doc, scrubTokens), staffTokens)));
}

const c = new MongoClient("mongodb://127.0.0.1:27018");
await c.connect();
const db = c.db("KonfiguratorDB");
// staff names (initials-only rule): every user name part is scrubbed from all documents
const STAFF = new Set();
for (const u of await db.collection("users").find({}, { projection: { name: 1, firstName: 1, lastName: 1, email: 1 } }).toArray()) {
  for (const v of [u.firstName, u.lastName, u.email, ...String(u.name || "").split(/\s+/)]) {
    if (v && String(v).length >= 4 && !/^emc2$/i.test(v)) STAFF.add(String(v));
  }
}
const offers = await db.collection("offers").find().sort({ updatedAt: -1 }).limit(60).toArray();
const drafts = await db.collection("drafts").find().sort({ updatedAt: -1 }).limit(80).toArray();
await c.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "offers.json"), EJSON.stringify(offers.map(anonDoc), { relaxed: true }));
writeFileSync(join(OUT, "drafts.json"), EJSON.stringify(drafts.map(anonDoc), { relaxed: true }));
console.log(JSON.stringify({ offers: offers.length, drafts: drafts.length, people: people.size }));
