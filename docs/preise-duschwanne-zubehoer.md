# Preise ändern: Duschwannen-Zubehör (Standard & Premium)

Kurzfassung: **Die Preise stehen in der Mongo-Collection `KonfiguratorDB.Products`, Feld `price`.**
Es gibt dafür **keine Oberfläche** — das Admin-Panel (`/admin/`) verwaltet nur die 21 Rechen-Variablen
(Sätze, Schwellen, Zuschüsse), keine Artikelpreise.

## Welcher Artikel gehört zu welcher Zeile

> **Stand 2026-10-19 (Entscheidung):** Die Ablaufgarnitur folgt der Duschwannen-Linie —
> Standard (Badolux) = **Siphon Bridge 90 `PR95DW001`, 25,08 €** (cleverbad.de-Artikel, neu in
> `Products`, `source: badolux`), Premium = `AGD9060`. Kleinmaterial ist auf beiden Linien `KM02`
> (150 €); `AC004` wird nicht mehr verwendet. Die Zwischenlösung aus PR #232 (Standard-Zusatzzeile
> „Abfluss (Badolux)" `AGB001`) ist entfernt. Der Block „Zwei Auffälligkeiten" weiter unten ist erledigt.

Die Zuordnung steht in [`src/logic/pricing-core.js`](../src/logic/pricing-core.js) im Block `------- Duschwanne ancillary`.

| Zeile im Konfigurator | Premium | Standard | Abrechnung |
|---|---|---|---|
| Wannenabdichtband-Set 3,4 m, DIN 18534 | `TRWDB` | `TRWDB` | wenn angehakt |
| Ablaufgarnitur | `AGD9060` (20,20 €) | `PR95DW001` Siphon Bridge 90 (25,08 €) | wenn angehakt (`drainSet`) |
| Kleinmaterial | `KM02` | `KM02` | wenn angehakt (`smallMaterial`) |
| Stelzlager / Plattenlager Pro 64–110 mm | `PLA5282` | `PLA5282` | Menge über `stelzlagerQty` |

Foto und Beschriftung der Ablaufgarnitur wechseln mit der Linie (`assets/budget/PR95DW001.webp`,
[`BadoluxManager.js`](../src/public/BadoluxManager.js) `swapAccessoryImages`); die anderen Kacheln
tauschen nur das Bild.

## Stand 2026-09-10

| Artikel | Preis | `source` | Name in der DB |
|---|---|---|---|
| `TRWDB` | 29,57 € | hassmann | TRINNITY Wannenabdichtband-Set 3,4 m … |
| `AGD9060` | 20,20 € | hassmann | Ablaufgarnitur Rohbauset m. Sifon BH60mm … TRINNITY |
| `AGB001` | **33,42 €** | badolux | Abfluss für Duschwanne mit und ohne Rand |
| `KM02` | 150,00 € | hero | Kleinmaterial groß |
| `AC004` | **7,59 €** | badolux | 1KU-PU-Kleber |
| `PLA5282` | 2,69 € | Riegelsberger | Stelzlager Pro justierbar 64–110 mm |

### ⚠️ Zwei Auffälligkeiten, bitte fachlich prüfen

> **Stand 2026-09-10: bewusst unverändert gelassen.** Klärung mit dem Vorgesetzten steht aus;
> die Preise bleiben bis dahin genau so, wie sie hier dokumentiert sind. Wer sie später anpasst:
> siehe „So ändert man einen Preis" weiter unten — Code-Änderung ist dafür keine nötig.

Diese Zahlen wurden bis 2026-09-09 **nie berechnet** — `budgetMode` kam gar nicht im Payload an
(siehe [plan-standard-premium-duschwanne.md](plan-standard-premium-duschwanne.md) §6), es wurden
immer die Premium-Artikel abgerechnet. Seit der Korrektur wirken sie sich real auf Standard-Angebote aus:

1. **`AGB001` (33,42 €) ist teurer als `AGD9060` (20,20 €).** Die „günstige" Linie ist bei der
   Ablaufgarnitur also die teurere. Entweder ist der Preis veraltet oder die Zuordnung stimmt nicht.
2. **`AC004` ist „1KU-PU-Kleber" für 7,59 €** und steht an der Stelle von „Kleinmaterial groß" (150,00 €).
   Ein Kleber ist kein Kleinmaterial-Paket — ein Standard-Angebot rechnet hier aktuell 142,41 € weniger.
   Vermutlich ist entweder der falsche Artikel hinterlegt oder `AC004` müsste ein Sammelposten sein.

## So ändert man einen Preis

### Variante A — Script (empfohlen, kein DB-Tool nötig)

```bash
node scripts/add-product.mjs --id=AGB001 --name="Abfluss für Duschwanne mit und ohne Rand" --price=24.90
```

`add-product.mjs` macht ein Upsert auf `productId`; ein vorhandener Artikel wird also aktualisiert.
`--dry` zeigt nur an, ohne zu schreiben. Wichtig: `--name` mit angeben, sonst wird der Name überschrieben.

### Variante B — API

```bash
curl -X POST http://localhost:3000/api/products/bulk -H "Content-Type: application/json" \
  -d '[{"productId":"AGB001","name":"Abfluss für Duschwanne mit und ohne Rand","price":24.90,"source":"badolux"}]'
```

`POST /api/products/bulk` ([`src/app.js`](../src/app.js)) macht ein `bulkWrite` mit `upsert`. **Achtung:**
es setzt `name`, `price`, `widthCm`, `lengthCm`, `heightCm`, `source` und `manufacturer` — Felder, die man
weglässt, werden auf `null` gesetzt. Also immer den vollständigen Datensatz schicken.

### Variante C — direkt in Mongo

```js
db.Products.updateOne({ productId: "AGB001" }, { $set: { price: 24.90 } })
```

## Was danach passiert

- Wirkt **sofort** für alle neuen Berechnungen — Server-Neustart ist nicht nötig, die Preise werden
  bei jeder Kalkulation frisch aus `Products` gelesen (`getProductsByIds` in `pricing-core.js`).
- **Bereits gespeicherte Angebote ändern sich nicht rückwirkend**, wenn sie eingefroren sind
  (`payload.frozen` + `frozenPricing`). Nicht eingefrorene Entwürfe rechnen beim nächsten Öffnen neu.
- Die Vigor-DB ist hier **nicht** beteiligt: Live-Preise aus Vigor gelten nur für die Zeilen des
  Duschabtrennung-Konfigurators (`getLiveVigourNetPrices`). Das BU-Zubehör kommt immer aus `Products`.
  Die Lagerbestand-Badges auf der Duschwanne lesen zwar live aus Vigor, aber nur den Bestand, nie den Preis.

## Verwandte Dateien

| Datei | Rolle |
|---|---|
| `src/logic/pricing-core.js` (Block „Duschwanne ancillary") | Welche Artikel-ID je Linie verwendet wird |
| `src/models/Product.js` | Schema der `Products`-Collection |
| `src/app.js` (`/api/products/bulk`) | Schreib-Endpunkt |
| `scripts/add-product.mjs` | Komfort-Script inkl. Bild-Download |
| `src/public/BadoluxManager.js` (`swapAccessoryImages`) | Nur Bildtausch, kein Preis |
