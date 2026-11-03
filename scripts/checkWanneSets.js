// scripts/checkWanneSets.js
// Re-checks the online-retail door-tub sets (src/lib/wanneSets.js) against the shops.
//   node scripts/checkWanneSets.js        Megabad: link alive? price unchanged?
//   node scripts/checkWanneSets.js --md   print the markdown link table (docs1/14-WANNE-ONLINE-SETS.md)
// OBI answers 404 to non-browser clients, so its links are listed for a manual check.
import { WANNE_SETS, WANNE_SET_ORDER } from "../src/lib/wanneSets.js";

const rows = WANNE_SETS.map((s) => ({ s, o: WANNE_SET_ORDER.get(s.articleNumber) }));
const eur = (n) => n.toFixed(2).replace(".", ",") + " €";

if (process.argv.includes("--md")) {
  console.log("| OC article | Product | Door | Mounting | Drain | OC price | Shop | Shop art. | Link |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const { s, o } of rows)
    console.log(
      `| ${s.articleNumber} | ${s.brand} ${s.lengthCm}x${s.widthCm} | ${s.side} | ${s.einbau ?? "–"} | ${s.ablauf} | ${eur(s.netPrice)} | ${o.shop} | ${o.shopArt} | ${o.url} |`,
    );
  process.exit(0);
}

let bad = 0;
for (const { s, o } of rows) {
  if (o.shop === "OBI") {
    console.log(`MANUAL  ${s.articleNumber}  ${eur(s.netPrice)}  ${o.url}`);
    continue;
  }
  try {
    const r = await fetch(o.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    // first "price" in the page's JSON-LD is the current selling price
    const price = Number((await r.text()).match(/"price":\s*"?(\d+(?:\.\d+)?)/)?.[1]);
    const ok = r.ok && price === s.netPrice;
    if (!ok) bad++;
    console.log(
      `${ok ? "OK    " : "CHANGED"}  ${s.articleNumber}  OC ${eur(s.netPrice)}  shop ${Number.isFinite(price) ? eur(price) : "?"}  HTTP ${r.status}`,
    );
  } catch (e) {
    bad++;
    console.log(`ERROR   ${s.articleNumber}  ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 400)); // be polite to the shop
}
console.log(bad ? `\n${bad} need attention` : "\nall Megabad links alive, prices unchanged");
process.exit(bad ? 1 : 0);
