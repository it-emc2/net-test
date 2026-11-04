// Compares exact document counts per collection: prod (read-only $URI) vs local replica.
import { MongoClient } from "mongodb";
const prod = new MongoClient(process.env.URI, { readPreference: "secondaryPreferred" });
const local = new MongoClient("mongodb://127.0.0.1:27018");
await prod.connect(); await local.connect();
let diffs = 0, total = 0;
for (const db of ["KonfiguratorDB", "vigor"]) {
  const names = (await prod.db(db).listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  for (const n of names) {
    const [p, l] = await Promise.all([prod.db(db).collection(n).countDocuments(), local.db(db).collection(n).countDocuments()]);
    total++; if (p !== l) diffs++;
    console.log(`${p === l ? "OK  " : "DIFF"} ${db}.${n}: prod=${p} local=${l}`);
  }
}
console.log(`\n${total} collections, ${diffs} differences`);
await prod.close(); await local.close();
