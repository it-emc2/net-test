# 14 · Wanne: online-retail door-tub sets

Complete "Badewanne mit Tür" sets that are **not** in Vigor/Hassmann. Added 2026-10-30 (task "Badewanne mit Tür (komplett)", Wanne picker under BU / Optional / Wanne).

## How it works

| Part | Where |
|---|---|
| Set data, prices, shop links | `src/lib/wanneSets.js` (`WANNE_SETS`, `WANNE_SET_ORDER`) |
| Merged into the picker catalog | `src/routes/bathtubs.js` (`/api/bathtubs/catalog`) |
| Pictures | `src/public/assets/wanne/` (Megabad = Steinkamp, OBI = Ottofond) |
| Pricing | Not in Vigor, so `pricing-core.js` quotes the price saved with the selection (snapshot) |
| Excluded from the Hassmann cart CSV | `isHassmannProduct()` in `src/routes/material-overview.js` |
| Order note (link + "not via Hassmann") | Materialübersicht remarks and the internal file `Bestellhinweise_Online-Handel_<no>.txt` (route `POST /material-overview/online-orders`, attached to Bitrix next to the Kalkulation PDF, never sent to the customer) |

## Prices

- The OC price is the **retail price incl. VAT, used unchanged** as purchase price (no /1.19). Placeholder until Profibad purchase prices are available.
- Steinkamp: regular Megabad prices on 2026-10-30, **not** the Halloween promo prices (about €70 lower on some variants).
- Ottofond: OBI, 2026-10-30.
- Re-check: `node scripts/checkWanneSets.js` (Megabad automatic, OBI manual because OBI blocks non-browser clients). Skill: `wanne-sets-check`.

## Open questions

- Profibad purchase prices and supplier contact for bath doors (asked in the task).
- Ottofond "inkl. Ablaufgarnitur" (+€130): unclear what is included beyond the plain set.
- Einbau / Vorwandmontage / Nische / Trio wording in the picker is trade-standard, not from a Steinkamp data sheet.
- Left/right door side: perspective not stated by Megabad.

## All sets and links (generated with `node scripts/checkWanneSets.js --md`)

| OC article | Product | Door | Mounting | Drain | OC price | Shop | Shop art. | Link |
|---|---|---|---|---|---|---|---|---|
| STEA160L-E | Steinkamp 160x75 | links | Einbau | Standard | 2149,00 € | Megabad / Profibad | 398376 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398376.htm |
| STEA160L-ET | Steinkamp 160x75 | links | Einbau | Trio | 2379,00 € | Megabad / Profibad | 398390 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398390.htm |
| STEA160L-V | Steinkamp 160x75 | links | Vorwandmontage | Standard | 2179,00 € | Megabad / Profibad | 424877 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-424877.htm |
| STEA160L-VT | Steinkamp 160x75 | links | Vorwandmontage | Trio | 2449,00 € | Megabad / Profibad | 424934 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-424934.htm |
| STEA160R-E | Steinkamp 160x75 | rechts | Einbau | Standard | 2149,00 € | Megabad / Profibad | 425006 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425006.htm |
| STEA160R-ET | Steinkamp 160x75 | rechts | Einbau | Trio | 2379,00 € | Megabad / Profibad | 398391 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398391.htm |
| STEA160R-V | Steinkamp 160x75 | rechts | Vorwandmontage | Standard | 2179,00 € | Megabad / Profibad | 425015 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425015.htm |
| STEA160R-VT | Steinkamp 160x75 | rechts | Vorwandmontage | Trio | 2449,00 € | Megabad / Profibad | 425024 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425024.htm |
| STEA170L-E | Steinkamp 170x75 | links | Einbau | Standard | 2149,00 € | Megabad / Profibad | 398379 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398379.htm |
| STEA170L-ET | Steinkamp 170x75 | links | Einbau | Trio | 2379,00 € | Megabad / Profibad | 398392 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398392.htm |
| STEA170L-V | Steinkamp 170x75 | links | Vorwandmontage | Standard | 2249,00 € | Megabad / Profibad | 425051 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425051.htm |
| STEA170L-VT | Steinkamp 170x75 | links | Vorwandmontage | Trio | 2479,00 € | Megabad / Profibad | 425060 | https://www.megabad.com/steinkamp-badewannen-mit-tuer-und-acrylverkleidung-a-425060.htm |
| STEA170R-E | Steinkamp 170x75 | rechts | Einbau | Standard | 2149,00 € | Megabad / Profibad | 425063 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425063.htm |
| STEA170R-ET | Steinkamp 170x75 | rechts | Einbau | Trio | 2379,00 € | Megabad / Profibad | 398393 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398393.htm |
| STEA170R-V | Steinkamp 170x75 | rechts | Vorwandmontage | Standard | 2249,00 € | Megabad / Profibad | 425069 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425069.htm |
| STEA170R-VT | Steinkamp 170x75 | rechts | Vorwandmontage | Trio | 2479,00 € | Megabad / Profibad | 425078 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425078.htm |
| STEA180L-E | Steinkamp 180x80 | links | Einbau | Standard | 2349,00 € | Megabad / Profibad | 398387 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398387.htm |
| STEA180L-ET | Steinkamp 180x80 | links | Einbau | Trio | 2599,00 € | Megabad / Profibad | 398403 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398403.htm |
| STEA180L-V | Steinkamp 180x80 | links | Vorwandmontage | Standard | 2479,00 € | Megabad / Profibad | 425090 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425090.htm |
| STEA180L-VT | Steinkamp 180x80 | links | Vorwandmontage | Trio | 2749,00 € | Megabad / Profibad | 425099 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425099.htm |
| STEA180L-N | Steinkamp 180x80 | links | Nische | Standard | 2299,00 € | Megabad / Profibad | 425084 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425084.htm |
| STEA180L-NT | Steinkamp 180x80 | links | Nische | Trio | 2449,00 € | Megabad / Profibad | 425096 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425096.htm |
| STEA180R-E | Steinkamp 180x80 | rechts | Einbau | Standard | 2349,00 € | Megabad / Profibad | 398386 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398386.htm |
| STEA180R-ET | Steinkamp 180x80 | rechts | Einbau | Trio | 2599,00 € | Megabad / Profibad | 398405 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-398405.htm |
| STEA180R-V | Steinkamp 180x80 | rechts | Vorwandmontage | Standard | 2479,00 € | Megabad / Profibad | 425108 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425108.htm |
| STEA180R-VT | Steinkamp 180x80 | rechts | Vorwandmontage | Trio | 2749,00 € | Megabad / Profibad | 425117 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-vorwandmontage-a-425117.htm |
| STEA180R-N | Steinkamp 180x80 | rechts | Nische | Standard | 2299,00 € | Megabad / Profibad | 425105 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425105.htm |
| STEA180R-NT | Steinkamp 180x80 | rechts | Nische | Trio | 2549,00 € | Megabad / Profibad | 425114 | https://www.megabad.com/hersteller-steinkamp-badewannen-tuer-acrylverkleidung-einbau-a-425114.htm |
| OTFG180L | Ottofond 180x80 | links | – | Standard | 2188,60 € | OBI | 4163259 | https://www.obi.de/p/4163259/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-weiss-links |
| OTFG180L-A | Ottofond 180x80 | links | – | inkl. Ablaufgarnitur | 2318,87 € | OBI | 4408225 | https://www.obi.de/p/4408225/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-links-inkl-ablaufgarnitur |
| OTFG180R | Ottofond 180x80 | rechts | – | Standard | 2188,60 € | OBI | 4163267 | https://www.obi.de/p/4163267/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-weiss-rechts |
| OTFG180R-A | Ottofond 180x80 | rechts | – | inkl. Ablaufgarnitur | 2318,87 € | OBI | 4408233 | https://www.obi.de/p/4408233/ottofond-badewannen-set-free-gate-180-cm-x-80-cm-rechts-inkl-ablaufgarnitur |
