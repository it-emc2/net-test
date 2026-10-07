# Recherche cleverbad.de (Badolux-Shop) — Stand 2026-10-07

Quelle: cleverbad.de (Heim und Dach Bautenschutz GmbH, Weilmünster), 65 Produkte, Daten aus den
Produktseiten (eingebettete Produkt-JSON). **Shop-Preise = B2C brutto inkl. 19 % MwSt.**; netto = ÷ 1,19.
Unsere Preise bleiben die Händler-Preisliste (`src/templates/test/badolux-prices.json`, netto) minus Nachlass.

## 1. Wandpaneele Keramico WP950 — Hauptbefund

| | Shop | unsere DB / Spec | Status |
|---|---|---|---|
| Format | **95 × 255 cm** (2,4225 m²) | 2600 × 95 **mm** (0,247 m²) | ❌ Spec falsch (Faktor 10 Breite, Höhe 255 statt 260) |
| Standard-Dekor | 128,41 € brutto (107,91 netto) | Liste 129 € netto, −10 % = **116,10 €** | Preis bleibt: 116,10 € |
| Sonder-/Wunschdekor „Dein Design" | 188,82 € brutto (PRI73WP999) | Liste 169 €, −10 % = 152,10 € | ok |
| Motiv-Paneele (~45 Designs) | 162,17 € brutto (PRE97WP…) | — | nicht im Konfigurator |
| Zuschnitt | ungeschnitten geliefert, Zuschnitt vor Ort | — | |
| Bedarfsrechner Shop | **Laufbreite**: Paneele = ⌈Σ Wandbreiten ÷ 95 cm⌉, Ecke: beide Reststücke einer Platte werden verbaut; Formen: eine Wand / Ecke / U-Form | Fläche × 1,15 ÷ 0,247 | Modell umstellen? |
| Montage | geklebt auf Fliesen oder glatten Putz | | |
| Versand | nur Spedition/Palette | | |

Farben → Shop-Artikelnr.: Marmor Weiß PRI73WP08 · Steingrau WP09 · Grau WP10 · Creme WP11 · Sahara WP12 (Lager 0) · Cafe WP13.
Musterfächer 5 Farben 20×20 cm: 7 € (PRE97WP00).

**€/m² (netto, unser EK):** Keramico 116,10 ÷ 2,4225 = **47,93 €** · Vigour 997 (V3WVK09) 168 ÷ 2,542 = **66,09 €** → Standard ist günstiger, wie erwartet.
Beispiel 10 m²: Flächenmodell ⌈10 × 1,15 ÷ 2,4225⌉ = 5 Stk = 580,50 € (heute fälschlich 47 Stk = 6.063 €).

In der DB existieren bereits Datensätze mit Nachlass: `BDX-WP-DN…` = 116,10 €, `BDX-WP-Sonder_Dekor` = 152,10 € (aus `scripts/seedBadolux.js`). Der Konfigurator nutzt aber `WP001–007` (129/169 €, ohne Nachlass).

## 2. Nachlässe laut Händler-Preisliste vs. Code

| Kategorie | Preisliste | Code heute |
|---|---|---|
| Wandpaneele | 10 % | **keiner** (WP001–006 = 129 €) |
| Boden | 20 % | **keiner** (BP001–005 = 35,16 €; BDX-BO = 28,13 €) |
| Duschwannen | **25 %** | 20 % (`BU_BADOLUX_DISCOUNT` = 0,20) |
| Gläser | 20 % | separates Modell `badolux-model.json` (nicht geprüft) |

## 3. Duschwannen

| Shop-Serie | Bauhöhe | Maße | Artikelnr. | Bei uns |
|---|---|---|---|---|
| **Riviera** (I70/I119), randlos, Antirutsch | 2,6 cm | 70×100 … 100×200, 80×170 auch Grau | PRI70DW…, PRI119DK… | = unsere „Mineral Duschwanne SMC" DW001–025 |
| **Amalfi** (I76), **mit Rand**, opt. Antirutsch | 3,5 cm | 76×170 … 100×100 (19 Var.) | PRI76DW01–20 | ❌ fehlt komplett |

Preisvergleich Riviera (Shop netto vs. Liste netto): 80×80 141,12 vs 124,32 · 90×90 169,65 vs 134,40 · 100×100 367,92 vs 294,00.
Shop hat Maße, die wir nicht haben: 70×100, 70×120. Wir haben 70×160/170 — Shop auch.

## 4. Zubehör — Abgleich

| Shop | Preis brutto | Unsere Entsprechung | Auffälligkeit |
|---|---|---|---|
| Siphon Bridge 90 (Ablaufgarnitur, 90 mm) PR95DW001 | 46,62 € | `AGB001` „Abfluss … mit und ohne Rand" 33,42 € | AGB001 steht **nicht** in der Preisliste; 33,42 € = zufällig gleicher Wert wie AC010/AC011 |
| Polymer Kleber Weiß 290 ml PR101VBM3 | 15,42 € | `AC004` 1K-PU-Kleber 7,59 € (VE = 20 Stk) | Verbrauch je Paneel: Shop nennt keinen Wert |
| Stelzlager 35–50 / 30–60 / 60–90 / 85–135 mm | 5,11 / 4,20 / 4,80 / 5,70 € | AC001–003 2,57 / 2,74 / 3,47 € (35–50 / 50–80 / 80–140) | Größen weichen ab |
| Dichtband blau: lfm / Rolle 50 lfm | 9,15 / 457,31 € | AC005 „Dichtband 10 m" 166 € · AC006 1 m 5,81 € | 166 € für 10 m = 16,60 €/m vs 5,81 €/m — prüfen |
| Wandmanschette PR59VBM07 | 6,62 € | AC009 4,97 € | ok |
| Innenecke / Außenecke DIN 18534 PR59VBM03/05 | je 7,00 € | — | neu |
| Fliesenabschlussleiste Edelstahl 2550 mm PRI130VBM01 | 15,29 € | — (AC012–014 Alu 260 cm) | neu, Länge = Paneelhöhe |
| Abschlusskappe Edelstahl 6×6 mm PRI130VBM02 | 3,86 € | — | neu, „passend zu Keramico" |
| Winkelleisten Kunststoff | — | AC010/AC011 **33,42 €**; Preisliste & BDX-WL: **2,17 €** | ❌ DB-Preis falsch |

## 5. Versand (Shop, brutto je Sendung)

Paket ≤10/20/30 kg: 9,90 / 19,95 / 29,95 € · Spedition ≤50/100 kg: 69 / 109 € · Palette ≤299 / >299 kg: 169 / 220 €.
Zuschläge Berlin/Hamburg/Köln/München, PLZ 17–19, Inseln. Gewerbekonten: gleiche Beträge netto.

## 6. Nicht im Shop

Boden-Hydroträgerplatte (BP001–005, 1,49 m²/Paket) — kein Abgleich möglich.

## 7. Offene Entscheidungen (einzeln umsetzen)

1. ✅ Keramico-Maß 95 × 255 cm (bfd99895). Offen: DB-Felder widthCm/heightCm von WP001–006.
2. ✅ Keramico −10 % nur auf WP001–006, Admin-Schlüssel `BU_WV_STANDARD_DISCOUNT` (0 = aus). Artikelnummern bleiben laut Blatt (DN…); cleverbad-Nummern als Referenz in `src/templates/test/badolux-prices.json`.
3. ✅ Mengenmodell Wand = Wandbreiten wie Shop-Rechner (eigener Bedarfsrechner, nur Standard; Warnung bei Wandhöhe > 255 cm).
4. Boden 20 % Nachlass (analog 2).
5. Wannen-Nachlass 20 % → 25 %?
6. Amalfi-Wannen mit Rand aufnehmen?
7. Zubehör: AGB001-Preis/Artikel, Winkelleisten 33,42 → 2,17 €, Dichtband 10 m, Keramico-Zubehör (Kleber, Abschlussleiste, Kappe).
8. Wandhöhe > 255 cm: Shop macht keine Aussage.

## 8. „Bedarf berechnen" (Produktseite Keramico) — Analyse 2026-10-07

**Logik** (aus dem ausgelieferten JS, Modul `berechnePaneelBedarf` + `buildPanelPlan`):

- Situationen: Eine Wand (Rückwand) · Ecke (links + Rückwand) · U-Form (links + Rückwand + rechts); Eingabe je Wand: Breite in cm. Platzhalter 120 / 180 / 120.
- **Jede Wand wird einzeln geplant**: Stücke à 95 cm, das letzte Stück ist der Rest → Paneele = Σ ⌈Breite ÷ 95⌉.
- Schnitte = Anzahl Paneele schmaler als 95 cm (± 0,5 cm). Verschnitt = Paneele × 95 − Σ Breiten. Höhe fest 255 cm, keine Höheneingabe.
- Reststücke werden **nicht** über Ecken weiterverwendet (der Hinweistext behauptet das, der Code tut es nicht). Beispiel 100 / 200 / 90 cm → 6 Paneele, 3 Schnitte: „Platte 2 am Ende auf 5 cm, Platte 5 am Ende auf 10 cm, Platte 6 am Ende auf 90 cm".
- Ergebnis: Paneele (Stück), Empfohlene Schnitte, Materialpreis (Anzahl × Preis), Schnittliste, Button „Menge übernehmen".

**Darstellung:** 3D-Szene (SVG) aus der Duschkabinen-Zeichen-Engine des Shops (`buildScene`/`project`/`fitCamera`, ~1.400 Zeilen), Wände in Farben A #b06a32 / B #54748f / C #5f8a5f, Paneel-Streifen mit Nummern-Marken, Zuschnitte gestrichelt, rückseitige Wand transparent, Person als Größenreferenz (nicht bei U-Form), Fokus auf Eingabe bzw. Hover auf Paneel hebt hervor und blendet den Rest ab, Ansicht dreht sich bei Bewegung, Zahlen zählen animiert hoch.

**Urheberrecht:** Code von Blackwell Studio (Footer „Designed and Developed by"). Unveränderte Übernahme nur mit Freigabe von CleverBad/Blackwell.

## 9. Standard (Keramico) vs. Premium (Vigour) — historische Angebote, Stand 2026-10-07

589 gesendete Angebote mit Premium-Wand (997/1497). Premium = tatsächlich angebotene Paneel-Zeilen; Keramico = gleiche Wandbreite nach dem Shop-Rechner × 116,10 €. Die echte Wandbreite ist unbekannt (nur Paneelzahl gespeichert) → Spanne:
best = kleinste Wand, die diese Premium-Paneele noch braucht · mid = Mitte, ≤ 1 Ecke · worst = volle Premium-Abdeckung + 1 Teilpaneel je Ecke.

| Szenario | Keramico | Premium | Δ | günstiger in |
|---|---|---|---|---|
| best | 176.820 € | 278.485 € | −36,5 % | 589/589 |
| mid | 198.647 € | 278.485 € | −28,7 % | 588/589 |
| worst | 248.802 € | 278.485 € | −10,7 % | 318/589 (inkl. Profile 427/589) |

Je cm Wandbreite: Keramico 1,22 € · Vigour 997 1,69 € · Vigour 1497 1,76 €. Nachteil nur bei sehr kleinen Wänden knapp über 95 cm (1 × 997 = 168 € vs. 2 × Keramico = 232,20 €).
Nicht enthalten: Keramico-Zubehör (Kleber, Abschlussleiste), Arbeitszeit, Premium-Profile V3A/V3V nur in „inkl. Profile".
