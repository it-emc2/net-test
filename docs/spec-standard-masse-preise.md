# Standard-Linie: Maße, Mengen, Preise — Arbeitsentwurf

**Status: Gerüst. Die mit ❓ markierten Werte sind fachlich zu klären (Handwerker / Vorgesetzter).
Noch nichts davon ist implementiert.** Sobald die Antworten da sind, wird dieses Dokument die Vorlage
für die Umsetzung.

Quellen: die beiden Preisblätter (Keramico Wandpaneele Seite 9 / PG 3, Boden Seite 10 / PG 3),
dazu der heutige Stand in `src/logic/pricing-core.js` und `KonfiguratorDB.Products`.

---

## 1. Was auf den Blättern steht (gesichert)

### Wandpaneele — Keramico Simple Wall, Vollkunststoff, für Nasszellen

| | |
|---|---|
| Maß | **2600 × 95 mm** = **0,247 m² pro Stück** |
| Standard-Dekor | **129,00 € / Stück** |
| Sonder-Dekor | **169,00 € / Stück** |
| Nach Kundenwunsch | zzgl. **Grafikkosten 39,00 €/Std** |
| Handschriftlich auf dem Blatt | **−10 %** |

| Farbe | Artikelnummer (Lieferant) | im Konfigurator |
|---|---|---|
| Marmor weiß | DN3287-3 | WP001 |
| steingrau | DN9031-004 | WP002 |
| grau | DN8604-009 | WP003 |
| creme | DN3403-6 | WP004 |
| Sahara | DN4595-5 | WP005 |
| Cafe | DN8604-003 | WP006 |
| (Sonder-Dekor) | — | WP007, 169,00 € |

### Boden — wasserfeste Hydroträgerplatte mit Nanoversiegelung

| | |
|---|---|
| Gebinde | **1,49 m² pro Paket** |
| Preis | **35,16 € / Paket** |
| Handschriftlich auf dem Blatt | **−20 %** |

| Farbe | Artikelnummer (Lieferant) | im Konfigurator |
|---|---|---|
| steingrau | DN9031-004 | BP001 |
| grau | DN8604-009 | BP002 |
| creme | DN3403-6 | BP003 |
| Sahara | DN4595-5 | BP004 |
| Cafe | DN8604-003 | BP005 |

Die Stückpreise stehen bereits korrekt in der Datenbank (WP001–006 = 129 €, WP007 = 169 €,
BP001–005 = 35,16 €). **Die Lieferanten-Artikelnummern (DN…) sind dort nicht hinterlegt.**

---

## 2. Was der Konfigurator heute rechnet — und warum das nicht passt

### Fußboden

```js
// pricing-core.js, Block "------- Fußboden"
const floorWaste     = cfg.get('BU_FLOOR_WASTE_FACTOR', 1.15);   // +15 % Verschnitt
const floorPanelSize = cfg.get('BU_FLOOR_PANEL_SIZE_M2', 0.3);   // m² pro Paneel
const panels = ceilSafe((floorArea * floorWaste) / floorPanelSize);
add(floorPid, panels, …);                                        // Preis = DB-Preis × panels
```

`BU_FLOOR_PANEL_SIZE_M2 = 0,3 m²` ist das **Premium**-Paneel (V5FB02, 1500 × 200 mm).
Ein Badolux-**Paket** sind aber **1,49 m²**. Bei 12 m² Fläche:

| | Menge | Einzelpreis | Summe |
|---|---|---|---|
| heute (0,3 m²) | 46 | 35,16 € | **1.617,36 €** |
| korrekt (1,49 m²) | 10 | 35,16 € | **351,60 €** |

Also rund **das 4,6-fache**. Der Fehler steckt nur in der Menge, nicht im Preis.

### Wandverkleidung

Die Standard-Paneele hängen heute an den **Premium-Mengen** `wvQty997` / `wvQty1497`
(Paneele 997 × 2550 mm und 1497 × 2550 mm). Wählt man ein Badolux-Dekor, entsteht eine Zeile wie

> „- 5 Stk Wandverkleidung 3.0 Alu **997×2550 mm** — Farbe: Standard-Dekor creme"

— mit dem Badolux-Preis, aber dem Premium-Maß im Text. Ein Keramico-Paneel ist **2600 × 95 mm**,
also ein schmales Brett (0,247 m²) statt einer Platte (2,54 m²). Menge, Text und Fläche stimmen alle
nicht. Das ist kein Zahlendreher, sondern eine andere Bemaßungslogik: **die Standard-Wand braucht
eine eigene Mengenrechnung und eigene Eingabefelder.**

---

## 3. Vorschlag für die Rechenmodelle — zu bestätigen

### 3a. Fußboden (einfach)

```
Pakete = aufrunden( Fläche_m² × Verschnittfaktor ÷ Paketgröße_m² )
```

| Größe | Premium | Standard | Quelle |
|---|---|---|---|
| Paketgröße | 0,30 m² | **1,49 m²** | Blatt |
| Verschnittfaktor | 1,15 | ❓ gleich 1,15? | zu klären |
| Preis je Einheit | DB | 35,16 € | Blatt |
| Rabatt | — | ❓ −20 % | Blatt (handschriftlich) |

Umsetzung: zweiter Config-Wert `BU_FLOOR_PANEL_SIZE_M2_STANDARD` und Auswahl nach `floorBudgetMode`.
Beide Werte bleiben im Admin-Panel pflegbar.

### 3b. Wandverkleidung (strukturell neu)

Ein Paneel ist 2,60 m hoch und 9,5 cm breit — das ist Bretteroptik, senkrecht gesetzt. Damit ist die
treibende Größe vermutlich **nicht die Fläche, sondern die laufende Wandbreite**:

**Modell A — laufende Breite** (Vermutung, bitte prüfen)
```
Paneele = aufrunden( Summe der Wandbreiten_m ÷ 0,095 m ) × Verschnitt
```
Voraussetzung: Raumhöhe ≤ 2,60 m, Paneel wird immer voll hoch gesetzt und nur in der Höhe gekürzt.

**Modell B — Fläche** (wie beim Boden)
```
Paneele = aufrunden( Fläche_m² × Verschnitt ÷ 0,247 m² )
```
Rechnet Verschnitt anders: bei Wandhöhen deutlich unter 2,60 m zu günstig, weil der Abschnitt in der
Praxis meist Abfall ist.

**Modell C — je Wand einzeln**, dann summiert. Genauer, aber mehr Eingabe auf dem Tablet.

❓ **Welches Modell gilt?** Davon hängt ab, was der Monteur eingeben muss — und damit das UI.

---

## 4. Offene Fragen

### An den Handwerker / die Montage

1. **Wandpaneele — wie wird die Menge ermittelt?** Modell A, B oder C aus §3b? Konkret: rechnet ihr in
   laufenden Wandmetern oder in m²?
2. **Wird ein Paneel immer voll hoch (2,60 m) gesetzt?** Was passiert bei Raumhöhe über 2,60 m —
   Querstoß, zweite Reihe, oder kommt das nicht vor?
3. **Verschnitt bei den Standard-Wandpaneelen** — welcher Faktor? Beim Boden sind es +15 %.
4. **Verschnitt beim Standard-Boden** — bleiben die +15 %, oder ist das bei 1,49-m²-Paketen anders?
5. **Zubehör bei der Standard-Wand**: gelten Endprofil, Silikon, Verbindungsprofile und Eckenanzahl
   wie bei Premium, oder gibt es eigene Artikel? Welche?
6. **Unterkonstruktion / Kleber** beim Standard-Boden: derselbe Flächenkleber (R_4260602, 0,6 m²/Pack)
   und dieselbe Bodenabdichtung (TRBDSET7) wie bei Premium?
7. **Mindestmengen oder Gebindezwang** — muss paketweise/paneelweise bestellt werden (aufrunden),
   oder gibt es Zuschnitt?

### An den Vorgesetzten / Einkauf

8. **Die handschriftlichen Rabatte: −10 % Wand, −20 % Boden — sind das Einkaufs- oder Verkaufsrabatte?**
   Sollen sie im Angebot beim Kunden ankommen oder nur die Marge erhöhen?
9. **Falls sie ins Angebot sollen:** sind 129,00 € / 35,16 € schon die rabattierten Preise oder die
   Listenpreise? (In der DB stehen aktuell exakt diese Zahlen.)
10. **Es gibt bereits `BU_BADOLUX_DISCOUNT = 20 %`**, das aber **nur auf Badolux-Duschwannen** wirkt.
    Soll daraus ein Rabatt je Bereich werden (Duschwanne / Wand / Boden), oder bleibt der bestehende
    unangetastet?
11. **Grafikkosten 39,00 €/Std bei Wandpaneelen nach Kundenwunsch** — soll der Konfigurator dafür eine
    Position anbieten (Stundenanzahl eingeben), oder wird das außerhalb erfasst?
12. **Sonder-Dekor 169,00 €** — gilt dafür derselbe Rabatt wie für Standard-Dekor?
13. **Sollen die Lieferanten-Artikelnummern (DN3287-3 …) in die Datenbank** und auf die Bestellung /
    den Warenkorb-Export? Heute stehen dort nur WP…/BP…-Nummern.
14. **Preisstand und Gültigkeit** der beiden Blätter — bis wann gelten die Preise, wer meldet Änderungen?

### Technisch, aber entscheidungsbedürftig

15. **Bestandsangebote**: Ändert sich die Mengenformel, rechnen **nicht eingefrorene** Angebote beim
    nächsten Öffnen neu — mit anderen Mengen als beim Speichern. Beim Boden wäre das ein Sprung von
    ca. −78 %. Sollen alle betroffenen Angebote vorher eingefroren werden?
    (Aktuell: 0 gespeicherte Angebote/Entwürfe enthalten überhaupt eine Badolux-Boden- oder
    -Wandauswahl — Stand 2026-09-10. Das Risiko ist damit heute praktisch null, wächst aber mit jedem
    Tag, an dem die Standard-Linie im Einsatz ist.)
16. **Premium-Boden prüfen**: V5FB02 heißt „1500x200mm (8 Paneele = 2,4 m²)" und kostet 159,84 €.
    Ist das der Preis **pro Paneel** oder **pro Paket mit 8 Stück**? Die Rechnung nimmt heute
    „pro Paneel à 0,3 m²" an. Wenn 159,84 € ein Paket sind, ist auch die Premium-Seite um Faktor 8 zu
    teuer. **Das bitte zuerst klären** — es betrifft Angebote, die längst draußen sind.

---

## 5. Reihenfolge des Umbaus (Vorschlag)

Nacheinander, nicht alles auf einmal — die beiden Bereiche haben unterschiedliche Risiken:

| Schritt | Umfang | Warum in dieser Reihenfolge |
|---|---|---|
| **0** | Frage 16 klären (Premium-Boden: Paneel oder Paket?) | Betrifft bestehende Angebote; alles andere kann warten |
| **1** | **Fußboden Standard**: Paketgröße 1,49 m² + Rabatt | Kleinster Eingriff — eine Konstante je Linie, Formel bleibt |
| **2** | **Wandverkleidung Standard**: eigene Mengenlogik + Eingabefelder + Zubehör | Strukturell: neue Eingaben, neues UI, neue Zeilen im Angebot |
| **3** | Artikelnummern (DN…) + Grafikkosten-Position, falls gewünscht | Additiv, blockiert nichts |

Schritt 1 ist eine halbe Stunde und sofort prüfbar. Schritt 2 braucht die Antworten auf Frage 1–5,
sonst wird geraten.
