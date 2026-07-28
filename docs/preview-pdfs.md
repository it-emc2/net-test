# Angebots-PDFs lokal erzeugen (ohne Server)

Zum Prüfen von Template- oder Text-Änderungen: `scripts/preview-pdf.mjs` rendert
Beispiel-Angebote aus JSON-Fixtures — ohne laufenden Server, ohne Login, ohne Browser.
Es läuft durch genau denselben Code wie die App:

```
pricing.computePrices → mapData → renderDocx (docxtemplater) → LibreOffice → PDF
```

## Aufrufen

```bash
npm run preview:pdf                                  # alle Fixtures
npm run preview:pdf -- ah-hd-ab-entlastungsbetrag    # nur eines
npm run preview:pdf -- --out ~/Desktop               # Zielordner wählen
```

Ausgabe standardmäßig in `preview-pdfs/` (gitignored). Die Konsole zeigt pro Fixture
das verwendete Template und die Beträge der Summenzeilen — praktisch, um ohne PDF-Öffnen
zu sehen, ob eine Zeile erscheint:

```
✓ ah-hd-ab-entlastungsbetrag  [AH-Angebot.docx]
    Gesamtbetrag 648,31 € | Eigenanteil 517,31 €
```

Voraussetzungen: `npm install` und LibreOffice (`soffice` im PATH, z. B.
`brew install --cask libreoffice`). Eine MongoDB-Verbindung brauchen die
mitgelieferten Fixtures nicht — sie enthalten keine Produkte aus der Vigour-DB.

## Fixtures

Ein Fixture in `scenarios/pdf/*.json` ist der Payload, den sonst der Browser sendet
(`Kundendaten`, `Arbeitszeit`, `ah`, `Finanzierung`, …). Der Dateiname ist der
PDF-Name. Vorhanden:

| Fixture | Fall |
|---|---|
| `bu-kassenkunde-eigenanteil-420` | BU, Zuschuss § 40 SGB XI, Eigenanteil 420 € |
| `bu-kassenkunde-eigenanteil-0` | BU, Gesamtsumme = Zuschuss → Eigenanteil 0 € |
| `ah-hd-ab-entlastungsbetrag` | AH, HnD + Alltagsbegleitung, Entlastungsbetrag § 45b bestätigt |
| `ah-hd-only-entlastungsbetrag` | AH, nur HnD (ein Konditionen-Block) |
| `ah-hd-ab-ohne-entlastungsbetrag` | AH ohne Entlastungsbetrag → keine Eigenanteil-Zeile |

Zwei Sonderschlüssel, die nicht Teil des Payloads sind:

- `_note` — Beschreibung des Falls, nur Dokumentation.
- `_computed` — überschreibt einzelne Felder des Preis-Ergebnisses **nach**
  `computePrices`. Damit lässt sich eine Summenzeile auf einen exakten Betrag prüfen,
  ohne die Eingaben passend zu rechnen (siehe die BU-Fixtures: `total`, `vatOnNet`,
  `subsidyAmount_max`, `selfPayAmount`). Für realistische Läufe einfach weglassen.

Eigenen Fall anlegen: eine bestehende Datei kopieren, umbenennen, Werte anpassen,
`npm run preview:pdf -- <neuer-name>`.

## Welches Template wird benutzt?

`getAngebotTemplatePath()` in `src/routes/docx-template.js` entscheidet anhand von
`activeOffer` (`bu` → `Angebot-10.docx`, `ah` → `AH-Angebot.docx`, …). Das Skript nimmt
denselben Pfad — was hier erscheint, erscheint auch im echten Angebot.

## Seite 2 anschauen

`soffice --convert-to png` liefert nur Seite 1. Für eine andere Seite erst diese Seite
als eigenes PDF exportieren:

```bash
soffice --headless --convert-to \
  'pdf:draw_pdf_Export:{"PageRange":{"type":"string","value":"2"}}' \
  --outdir /tmp/p2 preview-pdfs/ah-hd-ab-entlastungsbetrag.pdf
```
