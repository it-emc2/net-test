#!/usr/bin/env node
// Schema inference over the LOCAL replica only (never prod). Outputs key paths, value
// types, presence %, first/last seen per collection × offerType. Never prints values.
//   node scripts/replica/infer-shapes.mjs > docs/rewrite/DATA-SHAPES.generated.md
import { MongoClient } from "mongodb";

const URI = "mongodb://127.0.0.1:27018";
const DB = "KonfiguratorDB";
const MAX_DEPTH = 4;
const TARGETS = [
  { coll: "offers", root: "payload", date: "createdAt" },
  { coll: "drafts", root: "payload", date: "savedAt" },
  { coll: "offers", root: "pricing", date: "createdAt", label: "offers.pricing" },
  { coll: "signingrequests", root: "payloadSnapshot", date: "createdAt" },
  { coll: "Kundendaten", root: null, date: "createdAt" },
];

const typeOf = (v) => {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof Date) return "date";
  if (typeof v === "object" && v._bsontype) return v._bsontype.toLowerCase();
  if (typeof v === "string") {
    if (/^(on|off|ja|nein|true|false|yes|no)$/i.test(v)) return "string(bool)";
    if (v !== "" && !isNaN(Number(v.replace(",", ".")))) return "string(num)";
    return v === "" ? "string(empty)" : "string";
  }
  return typeof v;
};

// Collapse dynamic keys so per-product keys don't explode the report.
const norm = (k) =>
  k.replace(/^(qty|opt|qty_alias)_.+$/, "$1_<id>")
   .replace(/^[0-9a-f]{24}$/, "<objectId>")
   .replace(/^\d+$/, "<n>");

function walk(obj, prefix, depth, out) {
  if (obj === null || typeof obj !== "object" || obj instanceof Date || obj._bsontype) return;
  if (Array.isArray(obj)) {
    for (const el of obj.slice(0, 50)) {
      const p = `${prefix}[]`;
      out.set(p, (out.get(p) || new Set()).add(typeOf(el)));
      if (depth < MAX_DEPTH) walk(el, p, depth + 1, out);
    }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${norm(k)}` : norm(k);
    out.set(p, (out.get(p) || new Set()).add(typeOf(v)));
    if (depth < MAX_DEPTH) walk(v, p, depth + 1, out);
  }
}

const offerTypeOf = (d, root) => {
  const p = root ? d[root] || {} : d;
  return String(p.activeOffer || p.currentOfferKey || p.offerType || d.offerType || "∅").toLowerCase();
};
const quarter = (d) => (d ? `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}` : "?");

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db(DB);
const lines = [`# Data shapes (generated ${new Date().toISOString().slice(0, 10)} from local replica — values never shown)\n`];

for (const t of TARGETS) {
  const label = t.label || `${t.coll}${t.root ? "." + t.root : ""}`;
  const groups = new Map(); // offerType -> {n, paths: Map(path -> {n, types:Set, first, last})}
  const cursor = db.collection(t.coll).find({}, { projection: t.root ? { [t.root]: 1, offerType: 1, [t.date]: 1 } : {} });
  let total = 0;
  const byQuarter = new Map();
  for await (const d of cursor) {
    total++;
    const ot = t.root === "pricing" ? offerTypeOf(d, null) : offerTypeOf(d, t.root);
    const when = d[t.date] instanceof Date ? d[t.date] : d._id?.getTimestamp?.();
    const q = quarter(when);
    byQuarter.set(`${ot}|${q}`, (byQuarter.get(`${ot}|${q}`) || 0) + 1);
    const g = groups.get(ot) || { n: 0, paths: new Map() };
    g.n++;
    const local = new Map();
    walk(t.root ? d[t.root] : d, "", 0, local);
    for (const [p, types] of local) {
      const e = g.paths.get(p) || { n: 0, types: new Set(), first: q, last: q };
      e.n++;
      types.forEach((x) => e.types.add(x));
      if (q < e.first) e.first = q;
      if (q > e.last) e.last = q;
      g.paths.set(p, e);
    }
    groups.set(ot, g);
  }

  lines.push(`\n## ${label} — ${total} docs\n`);
  const quarters = [...new Set([...byQuarter.keys()].map((k) => k.split("|")[1]))].sort();
  lines.push(`| type | ${quarters.join(" | ")} |`, `|---|${quarters.map(() => "---").join("|")}|`);
  for (const ot of [...groups.keys()].sort()) {
    lines.push(`| ${ot} | ${quarters.map((q) => byQuarter.get(`${ot}|${q}`) || "").join(" | ")} |`);
  }
  for (const [ot, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`\n### ${label} · ${ot} (${g.n})\n`, "| path | % | types | first | last |", "|---|---|---|---|---|");
    const rows = [...g.paths.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [p, e] of rows) {
      const pct = Math.round((e.n / g.n) * 100);
      if (pct < 2 && p.split(".").length > 2) continue; // trim long tail
      lines.push(`| \`${p}\` | ${pct} | ${[...e.types].sort().join(", ")} | ${e.first} | ${e.last} |`);
    }
  }
}
await client.close();
console.log(lines.join("\n"));
