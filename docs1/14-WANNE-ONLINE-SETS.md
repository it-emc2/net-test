# 14 · Wanne: online-retail door-tub sets

Bathtubs with an entry door (and matching Wannenaufsätze) that are **not** in Vigor/Hassmann. First added 2026-10-30, rebuilt 2026-11-05 from the full Megabad variant matrix.

## How it works

| Part | Where |
|---|---|
| Set data, prices, shop links | `src/lib/wanneSets.js` (`WANNE_SETS`, `WANNE_SET_ORDER`) |
| Which Aufsatz fits which tub | `src/public/configurator/wanne-rules.js` (shared by wizard + tests) |
| Merged into the picker catalog | `src/routes/bathtubs.js` (`/api/bathtubs/catalog`) |
| Wizard + drawings | `initWannePicker` in `src/public/script.js`, `src/public/configurator/wanne-sketch.js` |
| Customer text (Kosten/PDF, no brand) | `src/lib/wanneDescribe.js` → `payload.duschwanne.chosenBathtubDesc/chosenScreenDesc` |
| Pricing | Not in Vigor, so `pricing-core.js` quotes the price saved with the selection (snapshot) |
| Excluded from the Hassmann cart CSV | `isHassmannProduct()` in `src/routes/material-overview.js` |
| Order note (link + "not via Hassmann") | Materialübersicht remarks and `Bestellhinweise_Online-Handel_<no>.txt` |

## Configurations (verified 2026-11-05)

| Product | What exists |
|---|---|
| Steinkamp easy entry | 160×75, 170×75, 180×80 · Einbau Ecke links / Ecke rechts (wall at that end, side panel on the other) / Nische / Vorwandmontage (panels front + both ends) · door left or right, **independent of the wall side** · Standard (Viega M5) or Trio · = 48 articles, height 58,5 cm |
| Steinkamp Aufsatz | 2-teilig faltbar, Anschlag links/rechts, 100×140 cm · Pendeltür 1-teilig 88×140 cm, links/rechts · 469,99 € · hinged on an end wall |
| Novellini Iris (Vigor) | door tub; 2 Schürzen = corner, wall at the door end; Frontschürze = niche; Aufsatz per side ("für Iris li/re") |
| Ottofond Free-Gate | hidden in the wizard: corner/door meaning of "links/rechts" not documented consistently |

## Rules (wanne-rules.js)

- Steinkamp Aufsatz needs an end wall on its Anschlag side → Ecke: only on the wall side; Nische: either side; Vorwandmontage: none.
- Steinkamp Aufsatz above the entry door (same end): **blocked** — no manufacturer statement that it works (door cut-out reaches the rim).
- Iris Aufsatz: same side as the Iris tub. Screens of one family never fit the other.

## Prices

- The OC price is the **retail price incl. VAT, used unchanged** as purchase price (no /1.19). Placeholder until Profibad purchase prices are available.
- Re-check: `node scripts/checkWanneSets.js` (Megabad automatic, OBI manual because OBI blocks non-browser clients).

## Old article numbers

`STEA<l><L|R>-<code>` (first catalog) never said which end the wall is at, and several "rechts" ones pointed to an "Ecke links" article. They stay in the catalog with `legacy: true, wizard: false` so saved offers still price and restore; their order note warns to check the wall side.

## Open questions

- Profibad purchase prices and supplier contact.
- Steinkamp: can an Aufsatz stand above the entry door? Until confirmed, blocked.
- Ottofond: which corner / door side "links"/"rechts" means.
- Iris COMBY side panel (S70/S75): exact placement.

## All sets and links (generated with `node scripts/checkWanneSets.js --md`)

| OC article | Product | Door / Anschlag | Mounting | Wall | Drain | OC price | Wizard | Shop art. | Link |
|---|---|---|---|---|---|---|---|---|---|
| ST160-EL-TL | Steinkamp 160x75 | links | Ecke | links | Standard | 2149,00 € | ja | 398376 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398376.htm |
| ST160-EL-TL-TRIO | Steinkamp 160x75 | links | Ecke | links | Trio | 2379,00 € | ja | 398390 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398390.htm |
| ST160-EL-TR | Steinkamp 160x75 | rechts | Ecke | links | Standard | 2149,00 € | ja | 398374 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398374.htm |
| ST160-EL-TR-TRIO | Steinkamp 160x75 | rechts | Ecke | links | Trio | 2379,00 € | ja | 398391 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398391.htm |
| ST160-ER-TL | Steinkamp 160x75 | links | Ecke | rechts | Standard | 2149,00 € | ja | 424871 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-424871.htm |
| ST160-ER-TL-TRIO | Steinkamp 160x75 | links | Ecke | rechts | Trio | 2379,00 € | ja | 424919 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-424919.htm |
| ST160-ER-TR | Steinkamp 160x75 | rechts | Ecke | rechts | Standard | 2149,00 € | ja | 425006 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425006.htm |
| ST160-ER-TR-TRIO | Steinkamp 160x75 | rechts | Ecke | rechts | Trio | 2379,00 € | ja | 425018 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425018.htm |
| ST160-N-TL | Steinkamp 160x75 | links | Nische | beide | Standard | 2079,00 € | ja | 424874 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-424874.htm |
| ST160-N-TL-TRIO | Steinkamp 160x75 | links | Nische | beide | Trio | 2349,00 € | ja | 424931 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-424931.htm |
| ST160-N-TR | Steinkamp 160x75 | rechts | Nische | beide | Standard | 2079,00 € | ja | 425012 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425012.htm |
| ST160-N-TR-TRIO | Steinkamp 160x75 | rechts | Nische | beide | Trio | 2349,00 € | ja | 425021 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425021.htm |
| ST160-V-TL | Steinkamp 160x75 | links | Vorwand | – | Standard | 2179,00 € | ja | 424877 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-424877.htm |
| ST160-V-TL-TRIO | Steinkamp 160x75 | links | Vorwand | – | Trio | 2449,00 € | ja | 424934 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-424934.htm |
| ST160-V-TR | Steinkamp 160x75 | rechts | Vorwand | – | Standard | 2179,00 € | ja | 425015 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425015.htm |
| ST160-V-TR-TRIO | Steinkamp 160x75 | rechts | Vorwand | – | Trio | 2449,00 € | ja | 425024 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425024.htm |
| ST170-EL-TL | Steinkamp 170x75 | links | Ecke | links | Standard | 2149,00 € | ja | 398379 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398379.htm |
| ST170-EL-TL-TRIO | Steinkamp 170x75 | links | Ecke | links | Trio | 2379,00 € | ja | 398392 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398392.htm |
| ST170-EL-TR | Steinkamp 170x75 | rechts | Ecke | links | Standard | 2149,00 € | ja | 398377 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398377.htm |
| ST170-EL-TR-TRIO | Steinkamp 170x75 | rechts | Ecke | links | Trio | 2379,00 € | ja | 398393 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398393.htm |
| ST170-ER-TL | Steinkamp 170x75 | links | Ecke | rechts | Standard | 2149,00 € | ja | 425045 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425045.htm |
| ST170-ER-TL-TRIO | Steinkamp 170x75 | links | Ecke | rechts | Trio | 2379,00 € | ja | 425054 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425054.htm |
| ST170-ER-TR | Steinkamp 170x75 | rechts | Ecke | rechts | Standard | 2149,00 € | ja | 425063 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425063.htm |
| ST170-ER-TR-TRIO | Steinkamp 170x75 | rechts | Ecke | rechts | Trio | 2379,00 € | ja | 425072 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425072.htm |
| ST170-N-TL | Steinkamp 170x75 | links | Nische | beide | Standard | 2079,00 € | ja | 425048 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425048.htm |
| ST170-N-TL-TRIO | Steinkamp 170x75 | links | Nische | beide | Trio | 2349,00 € | ja | 425057 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425057.htm |
| ST170-N-TR | Steinkamp 170x75 | rechts | Nische | beide | Standard | 2079,00 € | ja | 425066 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425066.htm |
| ST170-N-TR-TRIO | Steinkamp 170x75 | rechts | Nische | beide | Trio | 2349,00 € | ja | 425075 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425075.htm |
| ST170-V-TL | Steinkamp 170x75 | links | Vorwand | – | Standard | 2249,00 € | ja | 425051 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425051.htm |
| ST170-V-TL-TRIO | Steinkamp 170x75 | links | Vorwand | – | Trio | 2479,00 € | ja | 425060 | https://www.megabad.com/steinkamp-badewannen-mit-tuer-und-acrylverkleidung-a-425060.htm |
| ST170-V-TR | Steinkamp 170x75 | rechts | Vorwand | – | Standard | 2249,00 € | ja | 425069 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425069.htm |
| ST170-V-TR-TRIO | Steinkamp 170x75 | rechts | Vorwand | – | Trio | 2479,00 € | ja | 425078 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425078.htm |
| ST180-EL-TL | Steinkamp 180x80 | links | Ecke | links | Standard | 2349,00 € | ja | 398387 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398387.htm |
| ST180-EL-TL-TRIO | Steinkamp 180x80 | links | Ecke | links | Trio | 2599,00 € | ja | 398403 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398403.htm |
| ST180-EL-TR | Steinkamp 180x80 | rechts | Ecke | links | Standard | 2349,00 € | ja | 398386 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398386.htm |
| ST180-EL-TR-TRIO | Steinkamp 180x80 | rechts | Ecke | links | Trio | 2599,00 € | ja | 398405 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398405.htm |
| ST180-ER-TL | Steinkamp 180x80 | links | Ecke | rechts | Standard | 2349,00 € | ja | 425081 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425081.htm |
| ST180-ER-TL-TRIO | Steinkamp 180x80 | links | Ecke | rechts | Trio | 2599,00 € | ja | 425093 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425093.htm |
| ST180-ER-TR | Steinkamp 180x80 | rechts | Ecke | rechts | Standard | 2349,00 € | ja | 425102 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425102.htm |
| ST180-ER-TR-TRIO | Steinkamp 180x80 | rechts | Ecke | rechts | Trio | 2599,00 € | ja | 425111 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425111.htm |
| ST180-N-TL | Steinkamp 180x80 | links | Nische | beide | Standard | 2299,00 € | ja | 425084 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425084.htm |
| ST180-N-TL-TRIO | Steinkamp 180x80 | links | Nische | beide | Trio | 2449,00 € | ja | 425096 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425096.htm |
| ST180-N-TR | Steinkamp 180x80 | rechts | Nische | beide | Standard | 2299,00 € | ja | 425105 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425105.htm |
| ST180-N-TR-TRIO | Steinkamp 180x80 | rechts | Nische | beide | Trio | 2549,00 € | ja | 425114 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425114.htm |
| ST180-V-TL | Steinkamp 180x80 | links | Vorwand | – | Standard | 2479,00 € | ja | 425090 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425090.htm |
| ST180-V-TL-TRIO | Steinkamp 180x80 | links | Vorwand | – | Trio | 2749,00 € | ja | 425099 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425099.htm |
| ST180-V-TR | Steinkamp 180x80 | rechts | Vorwand | – | Standard | 2479,00 € | ja | 425108 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425108.htm |
| ST180-V-TR-TRIO | Steinkamp 180x80 | rechts | Vorwand | – | Trio | 2749,00 € | ja | 425117 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425117.htm |
| STSA-2T-L | Steinkamp Aufsatz 100x140 | links | – | – | – | 469,99 € | ja | 2067467 | https://www.megabad.com/steinkamp-duschabtrennungen-easy-entry-badewannenaufsaetze-badewannenaufsatz-a-2067467.htm |
| STSA-2T-R | Steinkamp Aufsatz 100x140 | rechts | – | – | – | 469,99 € | ja | 2067482 | https://www.megabad.com/steinkamp-duschabtrennungen-easy-entry-badewannenaufsaetze-badewannenaufsatz-a-2067482.htm |
| STSA-PT-L | Steinkamp Aufsatz 88x140 | links | – | – | – | 469,99 € | ja | 398433 | https://www.megabad.com/steinkamp-duschabtrennungen-easy-entry-badewannenaufsaetze-badewannenaufsatz-a-398433.htm |
| STSA-PT-R | Steinkamp Aufsatz 88x140 | rechts | – | – | – | 469,99 € | ja | 398433 | https://www.megabad.com/steinkamp-duschabtrennungen-easy-entry-badewannenaufsaetze-badewannenaufsatz-a-398433.htm |
| OTFG180L | Ottofond 180x80 | links | – | – | Standard | 2188,60 € | aus | 4163259 | https://www.obi.de/p/4163259/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-weiss-links |
| OTFG180L-A | Ottofond 180x80 | links | – | – | inkl. Ablaufgarnitur | 2318,87 € | aus | 4408225 | https://www.obi.de/p/4408225/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-links-inkl-ablaufgarnitur |
| OTFG180R | Ottofond 180x80 | rechts | – | – | Standard | 2188,60 € | aus | 4163267 | https://www.obi.de/p/4163267/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-weiss-rechts |
| OTFG180R-A | Ottofond 180x80 | rechts | – | – | inkl. Ablaufgarnitur | 2318,87 € | aus | 4408233 | https://www.obi.de/p/4408233/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-rechts-inkl-ablaufgarnitur |
| STEA160L-E | Steinkamp 160x75 | links | Ecke | – | Standard | 2149,00 € | alt | 398376 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398376.htm |
| STEA160L-ET | Steinkamp 160x75 | links | Ecke | – | Trio | 2379,00 € | alt | 398390 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398390.htm |
| STEA160L-V | Steinkamp 160x75 | links | Vorwand | – | Standard | 2179,00 € | alt | 424877 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-424877.htm |
| STEA160L-VT | Steinkamp 160x75 | links | Vorwand | – | Trio | 2449,00 € | alt | 424934 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-424934.htm |
| STEA160R-E | Steinkamp 160x75 | rechts | Ecke | – | Standard | 2149,00 € | alt | 425006 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425006.htm |
| STEA160R-ET | Steinkamp 160x75 | rechts | Ecke | – | Trio | 2379,00 € | alt | 398391 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398391.htm |
| STEA160R-V | Steinkamp 160x75 | rechts | Vorwand | – | Standard | 2179,00 € | alt | 425015 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425015.htm |
| STEA160R-VT | Steinkamp 160x75 | rechts | Vorwand | – | Trio | 2449,00 € | alt | 425024 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425024.htm |
| STEA170L-E | Steinkamp 170x75 | links | Ecke | – | Standard | 2149,00 € | alt | 398379 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398379.htm |
| STEA170L-ET | Steinkamp 170x75 | links | Ecke | – | Trio | 2379,00 € | alt | 398392 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398392.htm |
| STEA170L-V | Steinkamp 170x75 | links | Vorwand | – | Standard | 2249,00 € | alt | 425051 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425051.htm |
| STEA170L-VT | Steinkamp 170x75 | links | Vorwand | – | Trio | 2479,00 € | alt | 425060 | https://www.megabad.com/steinkamp-badewannen-mit-tuer-und-acrylverkleidung-a-425060.htm |
| STEA170R-E | Steinkamp 170x75 | rechts | Ecke | – | Standard | 2149,00 € | alt | 425063 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425063.htm |
| STEA170R-ET | Steinkamp 170x75 | rechts | Ecke | – | Trio | 2379,00 € | alt | 398393 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398393.htm |
| STEA170R-V | Steinkamp 170x75 | rechts | Vorwand | – | Standard | 2249,00 € | alt | 425069 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425069.htm |
| STEA170R-VT | Steinkamp 170x75 | rechts | Vorwand | – | Trio | 2479,00 € | alt | 425078 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425078.htm |
| STEA180L-E | Steinkamp 180x80 | links | Ecke | – | Standard | 2349,00 € | alt | 398387 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398387.htm |
| STEA180L-ET | Steinkamp 180x80 | links | Ecke | – | Trio | 2599,00 € | alt | 398403 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398403.htm |
| STEA180L-V | Steinkamp 180x80 | links | Vorwand | – | Standard | 2479,00 € | alt | 425090 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425090.htm |
| STEA180L-VT | Steinkamp 180x80 | links | Vorwand | – | Trio | 2749,00 € | alt | 425099 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425099.htm |
| STEA180L-N | Steinkamp 180x80 | links | Nische | beide | Standard | 2299,00 € | alt | 425084 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425084.htm |
| STEA180L-NT | Steinkamp 180x80 | links | Nische | beide | Trio | 2449,00 € | alt | 425096 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425096.htm |
| STEA180R-E | Steinkamp 180x80 | rechts | Ecke | – | Standard | 2349,00 € | alt | 398386 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398386.htm |
| STEA180R-ET | Steinkamp 180x80 | rechts | Ecke | – | Trio | 2599,00 € | alt | 398405 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398405.htm |
| STEA180R-V | Steinkamp 180x80 | rechts | Vorwand | – | Standard | 2479,00 € | alt | 425108 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425108.htm |
| STEA180R-VT | Steinkamp 180x80 | rechts | Vorwand | – | Trio | 2749,00 € | alt | 425117 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425117.htm |
| STEA180R-N | Steinkamp 180x80 | rechts | Nische | beide | Standard | 2299,00 € | alt | 425105 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425105.htm |
| STEA180R-NT | Steinkamp 180x80 | rechts | Nische | beide | Trio | 2549,00 € | alt | 425114 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425114.htm |
