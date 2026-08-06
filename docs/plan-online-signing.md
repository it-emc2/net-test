# Online-Signatur für Angebote (Design & Umsetzungsplan)

> Kunden ohne Drucker unterschreiben Angebot & Kassendokumente online über einen
> persönlichen Link in der Angebots-E-Mail. Zielgruppe sind vielfach ältere,
> wenig technikaffine Kunden — die Bedienung muss extrem einfach sein.

Status: Entwurf zur Abstimmung · Datum: 2026-07-06 · Basis-Branch: **v3**
(enthält die Kassenkunde-Felder; `main` noch nicht)

---

## 1. Ziel & Umfang

- **Selbstzahler (SZ):** 1 Dokument zum Unterschreiben — das **Angebot**.
- **Kassenkunde:** 3 Dokumente — **Angebot**, **Vollmacht (Krankenkasse)**,
  **Abtretungserklärung**.
- Kunde öffnet einen Link aus der Angebots-E-Mail, sieht die **vorausgefüllten**
  Dokumente, kann einzelne Felder korrigieren und unterschreibt per Finger/Maus
  (einfache elektronische Signatur — rechtlich vom Fachbereich als ausreichend
  bestätigt).
- Vertrieb sieht den Status je Angebot: **gesendet → geöffnet → unterschrieben**.

### Nicht im Umfang
- Keine qualifizierte elektronische Signatur (QES), kein externer Signatur-Dienst.
- Kein PDF-Editor für den Kunden — nur saubere HTML-Formulare.
- Keine Änderung am bestehenden Entwurf-/Schnellspeichern-Workflow.

---

## 2. Leitprinzip: Der Link entsteht beim *Senden*, nicht beim *Speichern*

Es gibt zwei klar getrennte Zustände — sie existieren im Code bereits als **zwei
Collections**:

| Zustand | Collection | Merkmal | Signatur-Link |
|---|---|---|---|
| **Entwurf** (Schnellspeichern) | `drafts` (`src/models/Draft.js`) | Key `(offerType, name)`, kein Status | **nie** |
| **Angebot** (finalisiert) | `offers` (`src/models/Offer.js`) | `offerNumber` (ANG…) + `status` | beim expliziten Senden |

**Konsequenzen (beantwortet die offenen Fragen):**

1. **Bestehende Entwürfe sind nicht betroffen.** Es werden *keine* Links
   rückwirkend erzeugt. Schnellspeichern, Suchen und Laden funktionieren
   unverändert.
2. **Speichern bleibt unabhängig vom Signieren.** Der Vertrieb speichert und
   bearbeitet Entwürfe beliebig oft weiter.
3. **Ein Link entsteht nur durch eine bewusste Aktion** („Angebot senden /
   Signatur-Link erstellen") — für ein neues *oder* ein altes Angebot. Es ist die
   *Aktion*, die den Link erzeugt, nicht die *Existenz* des Datensatzes.
4. Beim Senden wird der Angebots-`payload` als **Snapshot** in die neue
   `SigningRequest` kopiert. Spätere Änderungen am Angebot/Entwurf verändern
   damit **nicht** das, was der Kunde sieht/unterschrieben hat.

---

## 3. Datenmodell — `SigningRequest` (neu)

Ein Dokument pro versendetem Angebot.

```js
SigningRequest {
  token,            // ≥32 Zeichen, kryptografisch zufällig — einziges Element in der URL
  offerNumber,      // Rückverweis auf offers.offerNumber (ANG2026-…)
  offerId,          // optional: offers._id
  customerType,     // 'SZ' | 'KASSE'  (aus payload.Kundendaten.payer abgeleitet)

  bitrixEntityType, // 'deal' (aus #auftragId) | 'contact' (Fallback)
  bitrixEntityId,   // Deal-/Contact-ID für Timeline-Kommentare (§7b)

  prefill: { … },   // SNAPSHOT der relevanten Kundendaten beim Senden (s. §5)

  documents: [      // 1 (SZ) oder 3 (KASSE)
    { key: 'angebot' | 'vollmacht' | 'abtretung',
      status: 'pending' | 'signed',
      editedFields: {},   // vom Kunden korrigierte Werte
      extraFields: {},    // z.B. Vollmacht-Checkbox Entlastungsguthaben
      signatureImage,     // gezeichnete/getippte Unterschrift (Data-URL)
      signedPdf,          // erzeugtes, ausgefülltes PDF (oder Verweis auf Storage)
      place, signedAt, signedIp, userAgent }   // Audit-Trail
  ],

  status,           // 'sent' | 'opened' | 'partially_signed' | 'completed' | 'expired'
  openedAt, completedAt,
  expiresAt,        // z.B. +14 Tage
  createdAt, updatedAt
}
```

**Design-Entscheidungen:**
- **Snapshot statt Live-Read** — der Kunde unterschreibt genau die Fassung, die
  gesendet wurde.
- **Kein personenbezogener Klartext in der URL** — nur der zufällige `token`.
- **Audit-Trail pro Dokument** (Zeitstempel, IP, User-Agent, Dokumentversion,
  Unterschriftsbild) macht die einfache Signatur belastbar. Wird als Fußzeile ins
  erzeugte PDF gebrannt: „Elektronisch signiert am … von … · IP …".

---

## 4. Ablauf (End-to-End)

```
Vertrieb finalisiert Angebot in net-test
   └─ Button „Signatur-Link erstellen & senden"
        → status: 'sent_for_signing'
        → SigningRequest anlegen: token + Snapshot + documents[]
        → Angebots-E-Mail mit Link:  https://…/sign/<token>

Kunde klickt Link (kein Login — nur der geheime Token)
   → GET /sign/:token  ⇒ openedAt setzen, status 'opened'
   → Dokument 1 von N: lesen → Felder ggf. korrigieren → unterschreiben → „Weiter"
   → … pro Dokument …
   → nach letztem Dokument: status 'completed', completedAt
        → signierte PDFs erzeugen
        → E-Mail an Kunde (Kopie) UND ans Büro

Vertrieb-Dashboard: Gesendet → Geöffnet → Unterschrieben (n/N)
```

**UX-Grundsätze für die Zielgruppe:**
- Ein Dokument pro Bildschirm, große Schrift, große Buttons, „Dokument 1 von 3".
- Signatur per Canvas (Finger) **plus** Fallback „Namen tippen statt zeichnen".
- „Löschen"-Button zum Neu-Unterschreiben.
- Funktioniert auf dem Handy, mit dem die E-Mail geöffnet wird — keine App, kein
  Konto, kein Drucker.
- Nach Abschluss zeigt der Link „Bereits unterschrieben — hier ist Ihre Kopie"
  statt erneut signieren zu lassen.

---

## 5. Feld-Mapping (Prefill aus vorhandenem Angebots-Payload)

Dank des Merges (`8e2fcbb`, auf Branch **v3** — noch nicht in `main`) erfasst
net-test **praktisch alle** benötigten Felder.
Der Kunde muss nichts mehr eintippen — nur prüfen, ggf. korrigieren, unterschreiben.

**Payer-Feld steuert die Dokumentenzahl:** `payload.Kundendaten.payer`
= `Selbstzahler` → 1 Dok · `Kassenkunde` → 3 Dok.

### Vollmacht (Krankenkasse)
| Dokumentfeld | net-test-Quelle | Status |
|---|---|---|
| Name, Vorname | `firstName` + `lastName` | ✅ prefill |
| Adresse | `street, postalCode, city` | ✅ prefill |
| Telefon-Nr. | `phone` | ✅ prefill |
| Geburtsdatum | `kk_geburtsdatum` | ✅ prefill |
| Krankenkasse | `kassenkundeName` | ✅ prefill |
| KVNR | `kk_versichertennr` | ✅ prefill |
| ☐ Entlastungsguthaben / ☐ Budget WuM | ableiten + Kunde tickt Entlastung | ⚠️ s. §6 |

### Abtretungserklärung
| Dokumentfeld | net-test-Quelle | Status |
|---|---|---|
| Nachname, Vorname | `lastName`, `firstName` | ✅ prefill |
| Geburtstag | `kk_geburtsdatum` | ✅ prefill |
| Vers.-Nr. | `kk_versichertennr` | ✅ prefill |
| Adresse | Adressfelder | ✅ prefill |
| Telefon | `phone` | ✅ prefill |
| E-Mail | `email` | ✅ prefill |
| Pflegegrad (1–5) | `pflegegrad` | ✅ prefill |
| Pflegegrad seit | `kk_pflegegradSeit` | ✅ prefill |
| Pflegekasse: Name | `kassenkundeName` | ✅ prefill |
| Pflegekasse: Adresse | `kk_krankenkasseAdresse` | ✅ prefill |

### Angebot
Kein Dateneingabefeld — nur lesen + unterschreiben. Inhalt = bestehende
Angebots-PDF-Erzeugung (docx-templates / Adobe PDF SDK).

**Editierbar für den Kunden** (gemäß Entscheidung „einige Schlüsselfelder"):
Name, Anrede, Adresse, Telefon, E-Mail, Geburtsdatum. Alles Übrige read-only.

---

## 6. Offene Detailentscheidung: Vollmacht-Checkbox

Die Vollmacht fragt, *welches* Guthaben EmC2 abfragen darf:
`O aktuelles Entlastungsguthaben` vs. `O Budget für WuM`. Kein 1:1-Feld in
net-test.

**Empfehlung:** „Budget für WuM" per Default aktiv (es sind WuM-Projekte),
„Entlastungsguthaben" als einzelnes optionales Kästchen vom Kunden ankreuzbar —
entspricht der Formulierung „bitte entsprechend ankreuzen". Alternativ vollständig
aus dem Budget-Flow (`hasPflegegrad`, `budgetOptionsPanel`, `wohnumfeldDone`)
ableiten, wenn eine feste Regel vorliegt.

→ **Zu klären mit Fachbereich:** die genaue Regel.

---

## 7. Umsetzung im Bestand (net-test)

Neue Bausteine, alles innerhalb von net-test (Express + Mongoose + nodemailer +
vorhandene PDF-Erzeugung — kein neues Deployment):

1. **Model:** `src/models/SigningRequest.js`
2. **Interne Routen** (`src/routes/…`, hinter bestehender Auth):
   - `POST /api/signing` — SigningRequest anlegen + E-Mail senden
   - `GET  /api/signing` / `GET /api/signing/:offerNumber` — Status fürs Dashboard
   - `POST /api/signing/:id/resend` — Link erneut senden
3. **Öffentliche Routen** (kein Login, Token-basiert):
   - `GET  /sign/:token` — Signatur-Seite (setzt `openedAt`)
   - `POST /sign/:token/documents/:key` — ein Dokument signieren
4. **View:** eine öffentliche Signatur-Seite (`src/views/…` oder `public/`),
   mobil-first, große Schrift, Canvas-Signatur + Tipp-Fallback.
5. **PDF:** signierte PDFs über die bestehende Erzeugung + Audit-Fußzeile.
6. **E-Mail:** bestehenden `POST /api/email/send-offer` (nodemailer) um den
   Signatur-Link (§7a) erweitern; Abschluss-Mail mit Kopie an Kunde + Büro.
7. **Bitrix-Timeline:** bestehenden `POST /api/bitrix/timeline/comment`
   (`crm.timeline.comment.add`) für Statuswechsel nutzen (§7b), signierte PDFs am
   Ende anhängen. Deal-ID aus `#auftragId` in die SigningRequest übernehmen.
8. **Dashboard (optional, Phase 3):** Statusanzeige je Angebot — zusätzlich zur
   Timeline-Sichtbarkeit in Bitrix.
8. **Status-Transition** auf `offers`: neuer Wert `sent_for_signing`.

---

## 7a. E-Mail-Text (vom Vorgesetzten vorgegeben)

Der Link wird in der Angebots-E-Mail mit folgendem Text eingeleitet. Der Text ist
**fett** darzustellen; der Link folgt direkt darunter:

> **Keine Möglichkeit, die Dokumente auszudrucken? Kein Problem – nutzen Sie
> einfach nachfolgenden Link, um die Dokumente online auszufüllen, zu unterschreiben
> und direkt an uns zurückzuschicken:**
>
> https://…/sign/<token>

Hinweise:
- Einbau in die bestehende Angebots-Mail (nodemailer-Template).
- Wortlaut unverändert übernehmen (fett).
- Nur bei versendeten Angeboten mit erzeugtem Signatur-Link einfügen.

---

## 7b. Bitrix24-Anbindung (Timeline-Sichtbarkeit)

net-test kann bereits eigenständig E-Mails versenden **und** auf der Bitrix-Timeline
protokollieren — genau das nutzen wir hier weiter. Kein zweiter Mailkanal nötig.

**Bestehende Bausteine (wiederverwenden):**
- E-Mail-Versand: `POST /api/email/send-offer` (nodemailer, SMTP env vars).
  Loggt nach dem Versand bereits einen Timeline-Kommentar.
- Timeline-Kommentar: `POST /api/bitrix/timeline/comment` →
  Bitrix-Methode `crm.timeline.comment.add` (Webhook `BITRIX_WEBHOOK_BASE`).
- Verknüpfung Angebot ↔ Bitrix: **Deal-ID** aus `#auftragId`
  (Fallback: Contact-ID `#bitrixContactId`). Diese ID wird in die
  `SigningRequest` übernommen (`bitrixEntityType`, `bitrixEntityId`).

**Was Phase-1/2 ergänzt — Timeline-Kommentar bei jedem Statuswechsel:**
| Ereignis | Timeline-Kommentar (Beispiel) |
|---|---|
| Link versendet | „🔗 Signatur-Link an Kunde versendet (ANG… · gültig bis …)" |
| Kunde geöffnet | „👁 Signatur-Link geöffnet am …" |
| Dokument signiert | „✍️ Dokument *Angebot* unterschrieben am …" |
| Alle unterschrieben | „✅ Alle Dokumente unterschrieben · signierte PDFs angehängt" |

Beim finalen `completed`-Ereignis werden die **signierten PDFs als Anhänge**
(`FILES: [[name, base64], …]`) an die Timeline gehängt — analog zum bestehenden
„Angebots-PDF an Bitrix senden"-Button.

**Ergebnis:** Der Vertrieb sieht den kompletten Signatur-Lebenszyklus direkt am
Bitrix-Deal, ohne net-test öffnen zu müssen. Das interne Dashboard (§7, Phase 3)
bleibt optional/zusätzlich.

**Voraussetzung:** Zum Versand muss die Deal-ID (`#auftragId`) gesetzt sein — wie
schon heute beim PDF-Versand. Ohne Deal-ID: Fallback Contact-ID oder Hinweis an den
Nutzer.

---

## 7c. Rendering-Architektur: HTML-first, Ausgabe als PDF (Entscheidung)

Vorbild: das Schwesterprojekt **laufzettel** (reines HTML-Formular + `signature_pad`,
Unterschrift als base64-PNG). Vorteil für uns:
- **Checkboxen** (Zahlungsbedingungen, Pflegegrad, Entlastungsguthaben) = native
  HTML-Radios/Checkboxen — trivial.
- **Unterschrift-Platzierung** driftet nicht: die Signatur ist ein Feld *im Layout*,
  unabhängig vom Angebotsinhalt. Löst das „Signatur verschiebt sich"-Problem.

Unterschied zu laufzettel: **wir brauchen am Ende PDFs** (Krankenkasse, Mail,
Bitrix). Werkzeug ist vorhanden: **puppeteer** (Chromium print-to-PDF) ist bereits
Dependency; die Angebots-PDF entsteht heute via docx→LibreOffice (`soffice`).

**Beschlossene Architektur (Interaktion = HTML, Ausgabe = PDF):**
- **Vollmacht & Abtretung:** als **HTML-Templates** neu aufgebaut (Prefill,
  Checkboxen, Inline-Signatur). Bei Abschluss rendert puppeteer die HTML-Seite
  (Signatur als `<img>`) → finale PDF. Kein Drift, native Checkboxen.
- **Angebot:** der bepreiste Angebots-Body bleibt die bestehende docx→PDF. Die
  **Zahlungsbedingungen-Auswahl** wird auf der Signatur-Seite (HTML) getroffen und
  als Daten in den Angebots-Payload injiziert, sodass das Template die richtige Box
  ankreuzt (datengetrieben). Die **Unterschrift** kommt auf ein HTML-
  „Unterschriftenblatt" (Angebotsnr. + gewählte Bedingung + Signatur), das per
  puppeteer zu PDF gerendert und an die Angebots-PDF **angehängt** wird.
- **pdf-lib** nur noch zum **Zusammenfügen** von PDFs (nicht mehr zum
  koordinatenbasierten Stempeln → entfällt der Drift).

**Auswirkung auf bereits Gebautes:** Model/Routen/Token/Timeline/Mail bleiben.
`stampSignature` (Koordinaten-Stempel) wird durch „HTML→PDF rendern + zusammenfügen"
ersetzt; die Signatur-Seite rendert pro Dokument HTML statt eines nackten
PDF-iframes.

---

## 8. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Rechtliche Belastbarkeit der einfachen Signatur (v.a. Abtretung) | Audit-Trail (Zeit/IP/Version/Bild) im PDF; schriftliches OK des Fachbereichs pro Dokumenttyp einholen |
| Link ohne Passwort enthält personenbezogene Daten | langer Zufalls-Token; Ablauf nach 14 Tagen; HTTPS; keine PII in der URL; nach Abschluss nur noch Kopie-Ansicht |
| Ältere Nutzer scheitern an Bedienung | ein Dokument je Screen, große UI, Tipp-Fallback für Unterschrift, Handy-tauglich |
| Angebot wird nach Versand geändert | **Empfehlung: „invalidate & resend"** — Bearbeitung nach Versand macht alten Link ungültig, Vertrieb sendet neu (verhindert Unterschrift einer veralteten Fassung) |
| Doppelte/Mehrfach-Signatur | Status pro Dokument; nach `completed` nur noch Kopie |
| DSGVO / Gesundheitsdaten | Datenminimierung, Ablauf/Löschkonzept, verschlüsselte Speicherung der PDFs, Zugriff nur intern |

---

## 9. Vorgeschlagene Phasen

1. **Phase 1 — SZ, ein Dokument.** Model + Token + Signatur-Seite + Angebot
   signieren + Abschluss-Mail. Kleinste lauffähige Version.
2. **Phase 2 — Kassenkunde, 3 Dokumente.** Vollmacht + Abtretung als HTML-Formulare
   mit Prefill; Multi-Dokument-Flow; Vollmacht-Checkbox (§6).
3. **Phase 3 — Dashboard & Betrieb.** Status, Resend, Ablauf/„invalidate & resend",
   Erinnerungen.

---

## 9a. Umsetzungsstand Phase 1 (SZ, ein Dokument)

**Erledigt (Backend + Signatur-Seite, in sich geschlossen):**
- `src/models/SigningRequest.js` — Model inkl. Snapshot, Dokumentliste, Audit,
  Status-Rollup (`recomputeStatus`), Ablauf.
- `src/routes/signing.js` — Endpunkte:
  - `POST /api/signing` (intern): Request anlegen aus `payload` (+`offerNumber`,
    `dealId`/`contactId`), Token erzeugen, optional Link-Mail senden,
    Timeline-Kommentar „🔗 versendet".
  - `GET /api/signing/:token` (öffentlich): Daten für die Seite, setzt `openedAt`
    + Timeline „👁 geöffnet".
  - `GET /api/signing/:token/documents/:key/pdf` (öffentlich): Angebots-PDF zur
    Ansicht (reuse `generateOfferPdfBuffer`).
  - `POST /api/signing/:token/documents/:key` (öffentlich): Unterschrift + Audit
    speichern; bei Vollständigkeit signierte PDFs (pdf-lib-Stempel) per Mail an
    Kunde+Büro und als Timeline-Anhang „✅".
  - `GET /api/signing/status/:offerNumber` (intern): Status fürs Dashboard.
- `src/public/signpage/index.html` + `app.js` — mobil-first Signatur-Seite:
  Felder prüfen/korrigieren, PDF-Vorschau (iframe), Canvas-Unterschrift +
  „Namen tippen"-Fallback, „Löschen", Fortschritt „Dokument x von N".
- `src/app.js` — Router unter `/api/signing` und Seite `/sign/:token` **vor** dem
  SPA-Fallback gemountet.

Alle Dateien `node --check`-geprüft. **Noch nicht zur Laufzeit getestet** (Worktree
ohne `node_modules`; benötigt Mongo + SMTP).

**Noch offen für Phase 1:**
- **Frontend-Auslöser** in der Zusammenfassung: Button „Signatur-Link erstellen &
  senden", der `POST /api/signing` mit aktuellem Payload + `#auftragId` aufruft
  (analog `sendPdfToAuftrag`). Optional Link zusätzlich in die bestehende
  Angebots-Mail (`/api/email/send-offer`) einbetten.
- Env: `PUBLIC_BASE_URL` (für absolute Links in der Mail), optional
  `SIGNING_OFFICE_EMAIL`.
- Laufzeittest: Link erzeugen → öffnen → unterschreiben → PDF + Timeline prüfen.

---

## 10. Vor dem Bau zu klären

- [ ] Vollmacht-Checkbox-Regel (§6).
- [ ] Verhalten bei Angebotsänderung nach Versand (Empfehlung: invalidate & resend).
- [ ] Abschluss-PDFs auch automatisch an Kunde **und** Büro? (Empfehlung: ja)
- [ ] Ablauffrist (Empfehlung: 14 Tage) und Löschkonzept für signierte PDFs.
- [ ] Schriftliche Bestätigung des Fachbereichs, dass einfache Signatur + Audit-Trail
      für die Abtretungserklärung akzeptiert wird.
