# Freigabe der Kasse (Upload → Bitrix)

Kundendaten → "Wohnumfeld": Foto/Datei der Kassen-Bestätigung hochladen.

```
#kasseFreigabeFile (script.js: initKasseFreigabeUpload)
  └─ POST /api/bitrix/deal/:id/kasse-freigabe { filename, base64 }   (bitrix.js)
       ├─ crm.deal.update  UF_CRM_1741678405915 (Mehrfach-Datei, vorhandene Dateien bleiben)
       └─ Timeline-Kommentar "📎 Freigabe der Kasse hochgeladen (Konfigurator): <Datei>"
```

- Upload sofort nach Auswahl; braucht numerische `#auftragId`. Max. 15 MB, Bild oder PDF.
- Bitrix-Feld: "Bestätigung der Kasse für Wohnumfeldverb. Maßnahmen".
- Nicht Teil des Angebots-Payloads (nichts im Entwurf gespeichert).
