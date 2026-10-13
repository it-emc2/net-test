# Online-Signaturformular (Angebot) — Datei-Map

Kunde öffnet `/sign/:token` aus der Angebots-E-Mail. Design/Plan: `plan-online-signing.md`.

## Dateien

| Was | Wo |
|---|---|
| Seite (Shell, JS) | `src/public/signpage/index.html` — ausgeliefert von `signingPageHandler` (`src/routes/signing.js`) |
| Routen `/api/signing` | `src/routes/signing.js` (`POST /`, `GET /status/:offerNumber`, `GET /:token`, `GET /:token/documents/:key/html\|pdf`, `POST /:token/documents/:key`) |
| Mounting | `src/app.js` (`/api/signing`, `/sign/:token`) |
| Model | `src/models/SigningRequest.js` |
| **Dokument-HTML (Inhalt aller Formulare)** | `src/templates/signing-docs.js` |
| Datenquelle (`d.*` Felder) | `src/routes/docx-template.js` (gleiche Daten wie DOCX: `ValidityDate`, `OurSignatureImage`, `Ansprechpartner`, …) |

## `signing-docs.js` — Builder je Dokument

| Key (`DOC_LABELS`) | Builder |
|---|---|
| `angebot` (BU) | `buildAngebotHtml` |
| `angebot` (AH / AH-alt) | `buildAhAngebotHtml` (Auswahl: `buildAngebotForOffer` in `signing.js`) |
| `vollmacht` | `buildVollmachtHtml` |
| `abtretung` | `buildAbtretungHtml` |
| `zusatzblatt` (AH) | `buildZusatzblattHtml` |
| `abtretung_ah` (AH) | `buildAbtretungAhHtml` |

Modi: `display` (interaktiv: Radios + Signaturpad) · `pdf` (eingebrannt). `doc.status === "signed"` rendert wie PDF.

## Wichtige Bausteine

| Baustein | Funktion | Hinweis |
|---|---|---|
| Grußformel / Gültigkeit / EmC2-Unterschrift / Name / "Ihr Team von EmC2" | `closingBlock(d)` | BU + AH; jede Zeile eigener `<p>` |
| Kunden-Unterschrift | `signatureBlock` (pdf) / `interactiveSignatureBlock` (display) | |
| Zahlungsbedingungen | `interactivePaymentBlock` / `SelfPayLines` | nur BU |
| CSS | `ANGEBOT_CSS`, `INTERACTIVE_CSS`, `DOC_CSS`, `BASE_CSS` | `.closing`, `.our-sig-img` |

## Neues Feld hinzufügen

1. Feld in `docx-template.js` (Rückgabeobjekt) ergänzen → landet als `d.<Feld>`.
2. In `signing-docs.js` rendern, immer über `esc()`.
3. BU **und** AH Builder prüfen (beide nutzen gemeinsame Blöcke wie `closingBlock`).
