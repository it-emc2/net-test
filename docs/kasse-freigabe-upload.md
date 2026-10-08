# Datei-Uploads → Bitrix-Auftrag (Kasse, Vermieter)

Foto/Datei hochladen, wird als Datei am Deal abgelegt + Timeline-Notiz.

```
Upload-Box (script.js: initDealUploads)
  └─ POST /api/bitrix/deal/:id/upload/:type { filename, base64 }   (bitrix.js, DEAL_UPLOADS)
       ├─ crm.item.update  Mehrfach-Datei-Feld (vorhandene Dateien bleiben)
       ├─ Read-back: Feld-Anzahl vorher+1? sonst Warnung (Antwort `kept:false`)
       └─ Timeline-Kommentar (Datei zusätzlich als Anhang) "📎 … hochgeladen (Konfigurator): <Datei>"
```

| type | UI | Bitrix-Feld | Nebenwirkung |
|---|---|---|---|
| `kasse` | Kundendaten → Wohnumfeld, "Freigabe der Kasse" | `UF_CRM_1741678405915` Bestätigung der Kasse für Wohnumfeldverb. Maßnahmen | – |
| `vermieter` | Kundendaten, unter "Genehmigung des Vermieters erforderlich?" (nur BU/BWT, nur bei "Ja") | `UF_CRM_1741678430123` Bestätigung vom Vermieter für Umbauten | setzt "liegt vor" = Ja (siehe [vermieter-genehmigung.md](vermieter-genehmigung.md)) |

- Upload sofort nach Auswahl; braucht numerische `#auftragId`. Max. 15 MB, Bild oder PDF.
- Nicht Teil des Angebots-Payloads. Neuer Typ = Eintrag in `DEAL_UPLOADS` + Upload-Box + `setup(...)`-Aufruf.

- Anhängen an Mehrfach-Dateifelder (getestet 10/2026, Deal 65278): nur `crm.item.update` mit den vorhandenen Datei-Objekten **unverändert aus `crm.deal.get`** + neue Datei als `[name, base64]` hängt an. `crm.deal.update` oder `{id}`-Objekte ersetzen das Feld. Zusätzlich liegt jede Datei als Anhang in der Timeline-Notiz; Read-back warnt (`kept:false`), falls das Feld doch ersetzt wurde.
