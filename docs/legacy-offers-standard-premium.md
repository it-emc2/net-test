# Altbestand & Standard/Premium: was passiert beim Öffnen?

Kurzantwort: **Nichts.** Kein einziges gespeichertes Angebot und kein Entwurf ändert beim Öffnen
seinen Preis. Der Grund ist unromantisch: `budgetMode` konnte bis 2026-09-09 gar nicht gespeichert
werden (die Checkbox stand außerhalb von `#form-duschwanne`, siehe
[plan-standard-premium-duschwanne.md](plan-standard-premium-duschwanne.md) §6), also enthält
**kein** Altbestand das Feld — und ohne Feld gilt Premium, exakt so, wie damals auch gerechnet wurde.

## Bestandsaufnahme (Stand 2026-09-10, KonfiguratorDB)

| | offers | drafts |
|---|---|---|
| Datensätze gesamt | 1080 | 1995 |
| davon mit `duschwanne`-Block | 1080 | 1632 |
| **mit gespeichertem `budgetMode`** | **0** | **0** |
| mit gewählter Duschwanne | 489 | 1227 |
| davon **Badolux-Duschwanne (`DW*`)** | **28** | **57** |
| mit Badolux-Fußboden (`BP*`) | 0 | 0 |
| mit Badolux-Wandpaneel (`WP*`) | 0 | 0 |
| eingefroren (`frozen`) | 51 | 257 |

Die 85 Datensätze mit Badolux-Duschwanne sind genau der Fall aus der Frage: **Badolux-Wanne, aber
Kleinmaterial und Ablaufgarnitur aus der Premium-Linie.** Möglich war das, weil bis zu diesem Umbau
immer beide Listen sichtbar waren — nichts hinderte daran, im Premium-Modus eine Badolux-Wanne zu
wählen. Badolux-Fußböden und -Wandpaneele wurden nie gespeichert (0 Treffer), die Wiederherstellung
dafür ist also reine Vorsorge für die Zukunft.

## Was beim Öffnen konkret passiert

1. `restoreDuschwanne` liest `budgetMode` → nicht vorhanden → **Premium**, Umschalter steht auf Premium.
2. Die gespeicherte Badolux-Wanne bleibt gewählt (`chosenTrayProductId` unverändert) und erscheint als
   **angehefteter Merkzettel** über der Premium-Liste, statt still zu verschwinden.
3. Zubehör bleibt Premium: `AGD9060` + `KM02` — dieselben Artikel, mit denen das Angebot damals
   gerechnet wurde.
4. Der Neuberechnung liegt derselbe Payload und derselbe Server-Code zugrunde wie vorher. An
   `pricing-core.js` / `pricing.js` wurde nichts geändert.

### Nachgerechnet, nicht nur behauptet

Alle 28 betroffenen Angebote wurden mit `computePrices()` neu berechnet und mit ihrem gespeicherten
`pricing.total` verglichen:

| | |
|---|---|
| Recompute **exakt gleich** wie gespeichert | 17 |
| Abweichung | 10 (Ø 28,86 €) |
| eingefroren, gar nicht neu gerechnet | 1 |

Die 10 Abweichungen haben **nichts** mit diesem Umbau zu tun: Der Payload ist unverändert und der
Preis-Code ebenfalls — es sind Artikelpreise, die sich seit dem Speichern geändert haben. Genau das
Thema, an dem `claude/offer-price-persistence-8346a7` arbeitet. Entwürfe speichern keinen Gesamtpreis,
daher dort nichts zu vergleichen.

## Der einzige Weg, auf dem sich ein Preis ändert

Wenn jemand am angehefteten Merkzettel **„Auf Standard umstellen"** drückt. Dann wechselt die Linie,
und mit ihr Ablaufgarnitur und Kleinmaterial:

| | Ø | min | max |
|---|---|---|---|
| offers (27 nicht eingefroren) | **−146,89 €** | −148,24 € | −143,64 € |
| drafts (44 nicht eingefroren) | **−146,89 €** | −169,47 € | −144,30 € |

Das passiert **nur auf Klick**, nie automatisch — deshalb wird die Linie beim Wiederherstellen bewusst
nicht an das gespeicherte Produkt angepasst. Der Hinweistext am Merkzettel nennt die Folge ausdrücklich.

### ⚠️ Vorher die Artikelpreise prüfen

Die −147 € kommen fast vollständig daher, dass `AC004` („1KU-PU-Kleber", 7,59 €) an der Stelle von
`KM02` („Kleinmaterial groß", 150,00 €) steht. Solange das nicht geklärt ist, verschenkt dieser Button
rund 147 €. Details: [preise-duschwanne-zubehoer.md](preise-duschwanne-zubehoer.md).

## Für `claude/offer-price-persistence-8346a7`

Eine Schnittstelle gibt es: **neue** Angebote können ab jetzt `payload.duschwanne.budgetMode === "1"`
enthalten, und dieses Feld entscheidet über zwei Artikel-IDs. Wenn dort Payloads normalisiert,
eingefroren oder neu aufgebaut werden, muss das Feld erhalten bleiben — geht es verloren, kippt ein
Standard-Angebot beim nächsten Öffnen auf Premium zurück und wird ~147 € teurer. Für Altbestand ist
nichts zu tun, dort fehlt das Feld ohnehin und Premium ist korrekt.

## Reproduzieren

```bash
node - <<'JS'
import mongoose from "mongoose"; import dotenv from "dotenv"; dotenv.config();
await mongoose.connect(process.env.MONGODB_URI, { dbName: "KonfiguratorDB" });
const db = mongoose.connection.db;
for (const c of ["offers", "drafts"]) {
  console.log(c,
    "gesamt", await db.collection(c).countDocuments(),
    "| budgetMode", await db.collection(c).countDocuments({ "payload.duschwanne.budgetMode": { $exists: true } }),
    "| Badolux-Wanne", await db.collection(c).countDocuments({ "payload.duschwanne.chosenTrayProductId": { $regex: "^DW", $options: "i" } }));
}
process.exit(0);
JS
```
