# Vermieter-Genehmigung & "Wichtige Hinweise" (BU / BWT)

Mieter brauchen die schriftliche Zustimmung des Vermieters. Das Angebot zeigt dann:

> Der Auftrag kommt erst mit schriftlicher Zustimmung des Vermieters zustande.

## Ablauf

```
Bitrix-Deal ──GET /api/bitrix/deal/:id──▶ vermieter { erforderlich, liegtVor }
                                              │ (true / false / null)
Kundendaten-Formular ◀────────────────────────┘
  • Wohnsituation (Miete/Eigentum)
  • Genehmigung des Vermieters erforderlich? Ja/Nein  ← Pflichtfeld (BU, BWT)
  • Genehmigung des Vermieters liegt vor? Ja/Nein/Noch ausstehend
        │
        ▼ payload.Kundendaten
docx-template.js mapData() ─▶ VermieterZustimmungHinweis ─▶ DOCX + Online-Signing
```

## Woher kommt der Wert? (Priorität)

| # | Quelle | Bitrix-Feld | Wirkung |
|---|---|---|---|
| 1 | Listenfeld "Genehmigung des Vermieters erforderlich" (n8n) | `UF_CRM_1791270927983` | 8542 Nein → aus · 8540 Ja – Zustimmung fehlt → an + "liegt vor = Nein" · 8546 Ja – Zustimmung liegt vor → an + "liegt vor = Ja" · 8544 Unklar / leer → weiter mit 3 |
| 2 | Datei-Feld "Bestätigung vom Vermieter für Umbauten" | `UF_CRM_1741678430123` | Datei vorhanden → "liegt vor = Ja" |
| 3 | Zeile `Wohnsituation:` in "Auftragsbeschreibung" (alte Deals) | `UF_CRM_1711018687` | "Miet…" → an · "Eigent…" → aus · sonst unbekannt |

- Die Zeile `Einverständnis des Vermieters:` wird **bewusst ignoriert**: Sie steht oft auf "Vorhanden/Eigentümer", auch bei Mietern (Stichprobe 10/2026: 343 von ~1.600).
- Unbekannt (null) → das Formular wird nicht verändert, der Berater entscheidet.
- Alte Deals werden nicht nachgepflegt (kein Backfill); für sie greift Regel 3.

Code: `vermieterFromDeal()` in `src/routes/bitrix.js` (Feld-IDs und Werte-IDs als Konstanten oben drüber).

## Wann erscheint der Satz im Angebot?

`VermieterZustimmungHinweis = (BU oder BWT) && erforderlich = "Ja" && "liegt vor" ≠ "Ja"`

## Formular-Verhalten (`src/public/script.js`)

- `initVermieterFromDeal()`: lauscht auf `change` von `#auftragId`. Alle Deal-Ladewege (Kalender, Hauptmenü, Planung, manuelle Eingabe) schreiben dort hinein. Läuft nur bei BU/BWT, nicht beim Wiederherstellen eines Entwurfs (`window.__restoring`), und nur wenn der Deal zum Kontakt im Formular passt.
- Wohnsituation Miete → "Ja", Eigentum → "Nein". Manuell änderbar.
- **Pflichtfeld** (nur BU/BWT): `required` wird je Angebotstyp gesetzt (`offerflow:changed`), weil ausgeblendete Felder anderer Angebote sonst die Prüfung blockieren. Rot (CSS `#vermieterErforderlichRow`), solange nichts gewählt. Beim Senden/Export springt `requireBereichValid()` automatisch zurück zu Kundendaten.
- Ohne Deal-Information (kein Listenfeld, keine Wohnsituation-Zeile) bleibt das Feld leer → Berater muss wählen.
- Gespeichert als `Kundendaten.vermieterGenehmigungErforderlich` = `"Ja"` | `"Nein"` | `""`. Alte Entwürfe (Boolean `true`) werden als "Ja" geladen.

## "Wichtige Hinweise" im Angebot

| Punkt | Bedingung | Tag |
|---|---|---|
| Festpreisangebot | immer | – |
| Ihr Eigenanteil beträgt … | Zuschuss gewährt | `{#hasSubsidyLine}` |
| Ebenerdige Montage + Regie | Ebenerdig-Toggle, nur BU (bei BWT/HL/BL im Code ausgeschaltet) | `{#EbenerdigHinweis}` |
| Bewilligung durch die Pflegekasse | alle Kassenkunden | `{#IsKassenkunde}` (im BU-KK-Template ohne Tag, da immer KK) |
| Zustimmung des Vermieters | siehe oben | `{#VermieterZustimmungHinweis}` |

Wo der Text steht:
- DOCX: `src/templates/Angebot-10.docx` (BU SZ), `Angebot-BU-KK-2.docx` (BU KK), `Angebot-BWT.docx`, `Angebot-HL.docx`
- Online-Signing (nur BU): `festpreisBlock()` in `src/templates/signing-docs.js` — bei Textänderungen **beide** Stellen anpassen.

### DOCX bearbeiten (LibreOffice) — Stolperfallen

- Bedingte Punkte: `{#X}` steht am **Ende des vorherigen** Absatzes, `{/X}` am Ende des eigenen. So verschwindet der Punkt samt Aufzählungszeichen ohne Leerzeile.
- Jedes `{#X}` braucht genau ein `{/X}`, sonst schlägt die PDF-Erstellung fehl. Tags in einem Zug tippen (keine Formatierung mitten im Tag).
- Aufzählung (● Arial, Shift+F12) nur auf die Hinweis-Zeilen, **nicht** auf `{#SelfPayLines}` und darunter.
- Zahlungsbedingungen müssen 3 echte Absätze sein (Enter, nicht Shift+Enter), sonst wirkt der Absatzabstand nicht pro Zeile:
  ```
  {#SelfPayLines}
  {#IsTitle}{Text}{/IsTitle}{^IsTitle}{Text}{/IsTitle}
  {/SelfPayLines}
  ```
- Nach dem Speichern die Datei schließen (Lock-Datei `.~lock.*#` darf nicht committet werden).

## n8n (Mail → Bitrix)

Anweisung für den Claude-Node im n8n-Workflow, der "Auftragsbeschreibung" befüllt:

```
1. Auftragsbeschreibung: keep the "Label: Wert" format, one per line.
   Write the line exactly as:
   Wohnsituation: Mieter      (customer rents)
   Wohnsituation: Eigentümer  (customer owns the home)
   Wohnsituation: Unbekannt   (not stated)

2. Field "Genehmigung des Vermieters erforderlich" (UF_CRM_1791270927983):
   - "Nein"                       (ID 8542) customer owns the home
   - "Ja – Zustimmung fehlt"      (ID 8540) customer rents, email does not clearly say the landlord agreed
   - "Ja – Zustimmung liegt vor"  (ID 8546) customer rents, email clearly says the landlord agreed
   - "Unklar"                     (ID 8544) email does not say whether they rent or own
   Do not infer anything from "Einverständnis des Vermieters".
```
