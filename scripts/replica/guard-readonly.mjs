// Exits 0 only if the URI in $URI authenticates as a user whose ONLY role is readAnyDatabase
// and who has zero write actions. Read-only commands only. Never prints the URI.
import { MongoClient } from "mongodb";
const WRITE = ["insert","update","remove","createIndex","dropIndex","createCollection","dropCollection",
  "dropDatabase","renameCollectionSameDB","collMod","convertToCapped","createUser","dropUser","compact","reIndex"];
const c = new MongoClient(process.env.URI, { serverSelectionTimeoutMS: 15000 });
try {
  await c.connect();
  const a = (await c.db("admin").command({ connectionStatus: 1, showPrivileges: true })).authInfo;
  const roles = a.authenticatedUserRoles.map((r) => r.role);
  const writes = (a.authenticatedUserPrivileges ?? []).flatMap((p) => p.actions.filter((x) => WRITE.includes(x)));
  const ok = roles.length === 1 && roles[0] === "readAnyDatabase" && writes.length === 0;
  console.log(`guard: user=${a.authenticatedUsers[0]?.user} roles=${roles} writeActions=${writes.length} -> ${ok ? "OK" : "ABORT"}`);
  process.exitCode = ok ? 0 : 2;
} catch (e) {
  console.log("guard: ABORT", String(e.message).replace(/\/\/[^@]*@/g, "//***@"));
  process.exitCode = 3;
} finally { await c.close().catch(() => {}); }
