# Antrag §40 Abs. 4 SGB XI vor Ort an die Pflegekasse (Design)

> TR stellt beim Termin im OC den Zuschussantrag für wohnumfeldverbessernde
> Maßnahmen fertig und schickt ihn mit Vollmacht, Abtretung und Angebot an die
> Kasse. Kein Nacharbeiten im Büro. Bitrix-Aufgabe 45556.

Status: Phase 1 umgesetzt (nicht live) · Datum: 2026-10-30 · Basis-Branch: `main`

> **Phase 1 – so umgesetzt (Stand 02.11., nach Rückmeldung LP):**
> - Panel „Antrag an die Pflegekasse“ auf der Signaturseite nach der letzten Unterschrift,
>   nur für eingeloggte Mitarbeiter und nur bei §40-Abtretung (nicht AH).
> - Vor Ort Pflicht: **individuelle Begründung** (Standardsatz wird angehängt), Wohnsituation
>   (Eigentum/Miete + Vermieter-Zustimmung, vorbelegt aus dem Angebot), weitere
>   pflegebedürftige Personen im Bad, Ziel der Maßnahme.
> - Unterzeichner: „i. A.“ + Name des Mitarbeiters, der sendet. Nur EmC2 unterschreibt, nicht der Kunde.
> - Betreff (BARMER-Zuordnung): „Wohnumfeldverbesserung – Nachname Vorname – KVNR: X“.
> - Postversand: Mitarbeiter sieht, was passiert, und wählt **direkt per Onlinebrief24** oder **ans Büro**.
> - Bitrix wie bisher von Hand: Kommentar „Der Antrag wurde heute per Mail/Post bei der XX gestellt.“
>   wird fixiert, Deal → „[VI] Warten auf Freigabe Kasse“ (nur innerhalb Pipeline 38;
>   bei „ans Büro“ nur Notiz, Phase setzt das Büro).
> - Anschrift: Listen-Adresse (von LP geprüft) geht vor einer im Angebot getippten Adresse.
> - Absender live: service@e-m-c-2.de. Test: `KASSENANTRAG_REDIRECT_TO=<adresse>`.
> - Konto in den Formularen (Phase 2): EmC2-Konto ING (LP). Die AOK-Bayern-Vorlage hat noch das alte Konto.

---

## 1. Ausgangslage

| Baustein | Stand im OC |
|---|---|
| Geburtsdatum, Vers.-Nr., Kassenname, Kassenadresse | ✅ Felder `kk_*` im Kundendaten-Tab (`index.html` ab Z. 3176), Kassenname/-adresse nur Freitext |
| Vollmacht + Abtretung + Angebot unterschreiben (iPad vor Ort) | ✅ Online-Signatur (`signing.js`, Button „Vor Ort unterschreiben“) |
| Alle Antragswerte an einer Stelle | ✅ `resolveFields(sr, doc)` in `signing-docs.js` |
| Mailversand, Doppelversand-Sperre | ✅ `buildTransport`/`smtpFrom`, `claimSendLock` |
| Briefversand | ✅ Onlinebrief24 (`post.js`) |
| Ablage im Deal | ✅ `addTimelineComment` + `SIGNING_KASSE_FIELDS` (`bitrix.js`) |
| PDF-Formulare füllen | ⚠️ `pdf-lib` installiert, AcroForm-Füllen bisher nirgends |
| Kassen-Stammdaten | ❌ |
| Antragsdokument | ❌ |

Neu sind also nur: **Kassenliste**, **Antragsgenerator**, **Versand an die Kasse**.

## 2. Kassen und Formulare (Stand LP-Liste 29.10.)

30 Kassen · Formulare in `docs/pflegekassen/forms/` (19 Dateien aus Bitrix).

| Formular-Typ | Kassen | Umsetzung |
|---|---|---|
| **AcroForm** (ausfüllbar) | BARMER, IKK classic, Bahn-BKK, KKH, DAK, VIACTIV, PBeaKK, BKK Pfalz, Heimat BKK, mkk, IKK gesund plus, BKK Gildemeister, Knappschaft (13) | `pdf-lib` füllt Felder, danach flatten |
| **Flach** | AOK Plus, AOK Sachsen-Anhalt, SBK, AOK Bayern* (4) | Text auf Koordinaten (Muster `pdf-template.js`) |
| **Formlos** | TK, Mobil, DKV, Barmenia, Gothaer, Allianz, BKK Bosch, MH Plus, BKK 24, Generali, Audi BKK, hkk (12 + jede unbekannte Kasse) | HTML → PDF (Text aus Generali-Brief) |

\* AOK Bayern: EmC2-Vorlage mit vorausgefüllter Bankverbindung, AL-Unterschrift und Stempel. Feld-Widgets vorhanden, aber vom Formular gelöst.

Versand laut LP: 18 per Mail · 10 nur per Post · 2 Mail **und** Post.

## 3. Ablauf vor Ort

```
Kundendaten-Tab           Signatur (besteht)              NEU: Karte „Antrag an Kasse“
──────────────            ──────────────────              ──────────────────────────────
Kasse wählen  ──►  Angebot + Vollmacht + Abtretung  ──►  Vorschau Antrag-PDF
(füllt Adresse)    auf dem iPad unterschreiben           [Maßnahmen/Begründung anpassen]
Vers.-Nr., Geb.-Dat.                                     [An Kasse senden]
(Pflicht)                                                   ├─ Mail → Kasse (+ BCC Büro)
                                                            ├─ Post → Onlinebrief24
                                                            └─ Bitrix: Timeline + Felder
```

Bewusst **nicht automatisch** nach der Unterschrift versenden. Der Antrag geht an
eine Behörde, also soll TR vorher die Vorschau sehen und einmal „Senden“ drücken.

## 4. Bausteine

### 4.1 Kassenliste: `src/config/pflegekassen.json`
30 Einträge, ändern sich selten → JSON im Repo, kein neues Mongo-Model.

```json
{
  "id": "barmer",
  "name": "BARMER",
  "aliases": ["Barmer Pflegekasse"],
  "address": ["BARMER", "73524 Schwäbisch Gmünd"],
  "email": "service@barmer.de",
  "channel": "mail",                 // mail | post | both
  "form": {
    "type": "acroform",              // acroform | overlay | formlos
    "file": "PK_03_BARMER.pdf",
    "fields": { "DVAR_GRUENDE": "reason", "DVAR_TELEFON": "phone" }
  }
}
```

Wenn LP die Liste selbst pflegen soll, wird daraus später eine Mongo-Collection
plus Admin-Seite (`/admin/` gibt es schon). Für v1 nicht nötig.

### 4.2 UI: Kassenauswahl
- `kassenkundeName` bekommt eine native `<datalist>` aus der JSON. Kein neues Widget, Freitext bleibt möglich (unbekannte Kasse → formlos).
- Treffer füllt `kk_krankenkasseAdresse` und setzt verstecktes `kk_kasseId`.
- `kk_geburtsdatum` und `kk_versichertennr` werden bei Kassenkunde Pflicht. Die Signatur prüft sie schon (`VOLLMACHT_REQUIRED_FIELDS`), hier nur früher im Ablauf.
- Partnerfall (`_p2`): pro Person ein eigener Antrag (BARMER: „jede(r) Bewohner(in) einen eigenen Antrag“).

### 4.3 Generator: `src/templates/kassenantrag.js`
Eine Funktion: `buildKassenantragPdf(sr, kasse, overrides) → Buffer`.

Werte (aus `resolveFields` + Angebot):

| Schlüssel | Quelle |
|---|---|
| `fullName`, `firstName`, `lastName`, `street`, `postalCode`, `city`, `phone` | `resolveFields` |
| `geburtsdatum`, `kvnr`, `pflegegrad` | `resolveFields` |
| `measures[]` | Positionen des Angebots (Titel), in der Vorschau editierbar |
| `reason` | Standardtext, Objekt = Badewanne / Duschwanne / Dusche je nach Angebotstyp |
| `offerNumber`, `totalCost`, `date`, `place` | Angebot / heute / „Hof“ |
| `iban`, `bank`, `accountHolder` | EmC2-Konto (Abtretung), aus `.env` |

Standard-Begründung (aus den Beispielanträgen):
> Aufgrund der bestehenden körperlichen Einschränkungen ist die sichere Nutzung
> der bisherigen {Badewanne|Duschwanne} erheblich beeinträchtigt. Die
> beantragten Maßnahmen sind zur Reduzierung des Sturzrisikos, zur Erhaltung der
> Restselbstständigkeit sowie zur Verbesserung des individuellen Wohnumfeldes
> gemäß § 40 SGB XI erforderlich.

Die drei Typen:
- `acroform`: `form.getTextField(name).setText(values[key])`, Checkboxen per Map, dann `form.flatten()`.
- `overlay`: `page.drawText` auf Koordinaten aus der JSON.
- `formlos`: Anschreiben als HTML → `htmlToPdfBuffer`, der Text ist der des Generali-Briefs.

Bei Post kommt immer ein Anschreiben mit Kassenadresse im DIN-5008-Fenster als
Seite 1 dazu. `normalizeToA4` in `post.js` erledigt den Rest.

### 4.4 Versand: `POST /api/signing/:token/kassenantrag`
1. Signatur muss `completed` sein, Kassenkunde, Kasse bekannt bzw. Adresse vorhanden.
2. Paket: Antrag + signierte Vollmacht + signierte Abtretung + signiertes Angebot. Die PDFs gibt es schon (`signedPdfs`).
3. Kanal laut Kassenliste:
   - `mail`: `buildTransport().sendMail({ to: kasse.email, bcc: SIGNING_OFFICE_EMAIL })`, Text = formloses Anschreiben.
   - `post`: bestehende Onlinebrief24-Logik aus `post.js` (Funktion herausziehen, nicht kopieren).
   - `both`: beides.
4. Sperre gegen Doppelversand: `claimSendLock` mit eigenem Schlüssel `kassenantrag:<offerNumber>`.
5. Status in `SigningRequest` speichern: `kassenantrag: { sentAt, channel, to, by }`.
6. Bitrix: `addTimelineComment` mit allen PDFs, Text „📨 Antrag an {Kasse} gesendet (Mail/Post)“. Dazu Deal-Feld bzw. Stufe „Antrag an Kasse gestellt“ (Feld-ID mit SW/LP klären).

### 4.5 Testbarkeit
- Ein Unit-Test pro Formular-Typ: Beispiel-SR → PDF → Felder auslesen → Werte stimmen.
- `OB24_MODE=test` und Mail an eine Testadresse für den Durchlauf mit TR (Schritt 8).

## 5. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis | Aufwand |
|---|---|---|---|
| **1** | Kassenliste (JSON), Datalist, Pflichtfelder, **formloser Antrag für alle**, Versand Mail/Post, Bitrix-Ablage | Jede Kasse bekommt sofort einen vollständigen Antrag (formlos wird laut SW akzeptiert) | ~6 h |
| **2** | Offizielle Formulare Top 10: BARMER, IKK classic, Bahn-BKK, KKH, DAK (AcroForm), AOK Plus, AOK Sachsen-Anhalt, AOK Bayern (Overlay). Pro Kasse Feld-Mapping + Sichtprüfung | Erfolgskriterium „10 häufigste Kassen“ | ~0,5 h/Kasse AcroForm, ~1 h Overlay → ~6 h |
| **3** | Restliche AcroForm-Kassen nach Bedarf | – | je ~0,5 h |
| – | Test mit TR + Einweisung | Schritt 8 | ~1 h |

Gesamt Phase 1 + 2 + Test ≈ **13 h**. Die Schätzung von 12 h passt.

Feld-Mapping: Manche Feldnamen sind lesbar (BARMER `DVAR_GRUENDE`, IKK `Begründung 01`),
andere nicht (DAK `F4260`, KKH `1`…`12`, Bahn-BKK `Kontrollkästchen59`). Für die
unlesbaren füllt ein Skript jedes Feld mit seinem eigenen Namen. Dann sieht man im
PDF, welches Feld wohin gehört.

## 6. Offene Fragen

| # | Frage | An |
|---|---|---|
| 1 | Unterschrift auf dem Antrag: Kunde (zusätzliche Unterschrift auf dem iPad) oder EmC2 als Bevollmächtigter („i. A.“, hinterlegtes Bild wie bei AOK Bayern)? | SW / LP |
| 2 | Auszahlungskonto: immer das EmC2-Konto (Abtretung), wie bei AOK Bayern? | LP / AL |
| 3 | Absenderadresse für die Mail an die Kasse (`service@`?) und wer im Anschreiben unterzeichnet (bisher „i. A. LP“)? | LP |
| 4 | Post-Kassen: direkt aus dem OC über Onlinebrief24 abschicken (kostet pro Brief), oder in eine Warteschlange fürs Büro? | SW |
| 5 | Deal nach dem Versand: welche Stufe bzw. welches Feld („Antrag an Kasse gestellt“ + Datum)? | SW |
| 6 | Dürfen die Kassenformulare ins Repo? AOK Bayern enthält IBAN und Unterschrift von AL, also besser außerhalb ablegen (z. B. Bitrix-Disk zur Laufzeit holen oder als Asset ohne Git). | SW |
| 7 | Daten in der LP-Liste korrigieren: Bahn-BKK = persönliche Adresse, Generali `pflegenversicherung@` (Tippfehler?), DKV doppelt, AOK Bayern nur GS Hof, AOK S-A und Allianz haben E-Mail, Versand aber Post | LP |

## 7. Nicht im Umfang
- Einreichung über Kassen-Apps bzw. -Portale (der Kunde muss sich dort selbst einloggen; LP rät ab).
- Statusverfolgung der Bewilligung (Antwort der Kasse kommt weiter per Post bzw. Mail ins Büro).
- Private Zusatzbögen (z. B. Generali Einwilligung/Schweigepflicht). In v1 bleibt die PKV formlos, die Bögen kommen bei Bedarf in Phase 3.

## Prüfung durch das Büro (LP, 2026-11-03)

LP prüft jeden Antrag vor dem Versand (Vier-Augen-Prinzip):

1. Außendienst füllt das Panel aus → **„Zur Prüfung ans Büro“** (`POST …/kassenantrag/submit`). Entwurf in `sr.kassenantrag` (`status: "review"`), Bitrix-Aufgabe an LP (ID 248), SW (ID 6) beobachtet, Frist nächster Werktag 17:00, mit dem Deal verknüpft, Link `/sign/<token>`.
2. LP öffnet den Link im OC angemeldet → dasselbe Panel, vorausgefüllt, änderbar → **„An Pflegekasse senden“**. „i. A.“ bleibt der Außendienst.
3. Versand wie bisher; danach wird die Bitrix-Aufgabe automatisch erledigt.

Senden geht nur mit eingereichtem Entwurf und durch einen anderen Benutzer als den Einreicher. `KASSENANTRAG_DIRECT_SEND=1` schaltet später den Direktversand vor Ort wieder frei.
Braucht den Scope `task` am Server-Webhook (`BITRIX_WEBHOOK_BASE`).
