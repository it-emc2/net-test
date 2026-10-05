# Grundriss-Erfassung auf dem iPad — Ausbaustufen B und C

Stand: 2026-09-15. Stufe **A ist umgesetzt** (Commit `2b13f0e`): die Zone
„Grundriss / Fotos hinzufügen" in der Anhänge-Karte öffnet auf iOS das native
Sheet (Fotomediathek / Foto aufnehmen / Dateien), verkleinert das Bild
clientseitig auf 1600 px Kante (JPEG q0.85), benennt `image.png` in
`Grundriss_<Datum>_<n>.jpg` um und hängt es an die „Nur für Bitrix"-Liste, die
beim Senden über das Feld `bitrixDocs` in die Deal-Timeline geht.

Dieses Dokument beschreibt die zwei Ausbaustufen darüber hinaus. Beide sind
unabhängig voneinander umsetzbar; B bringt mehr Nutzen pro Aufwand.

---

## B — Grundriss direkt aus magicplan ziehen

**Ziel:** kein Screenshot mehr. Der Monteur legt in magicplan wie gewohnt den
Raum an; im Konfigurator erscheint der Grundriss auf Knopfdruck beim Deal.

### Warum das geht: der Abgleich ist schon da

Die automatisch angelegten magicplan-Projekte tragen ein
`external_reference_id`, das exakt der Bitrix-Deal-ID entspricht, und heißen
nach dem Muster `<Deal-ID>-<Nachname>` (geprüft am 2026-09-15 über den
magicplan-Connector, Stichprobe von 10 Projekten):

```
name:                   "<Deal-ID>-<Nachname>"
external_reference_id:  "<Deal-ID>"      ← identisch mit der Bitrix-Deal-ID
address:                Objektadresse    ← deckt sich mit der Deal-Adresse
```

Damit ist die Zuordnung Deal ↔ magicplan-Projekt **ein API-Filter, keine
Heuristik und keine Nutzereingabe**. Manuell in magicplan angelegte Projekte
haben kein `external_reference_id` und tragen nur einen freien Namen — die
fallen auf eine Namens-/Adresssuche zurück oder werden dem Nutzer als
Auswahlliste angeboten.

### Was die API liefert (verifiziert)

- **Projektliste**: `id`, `name`, `address`, `external_reference_id`,
  `assignee.email`, `thumbnail_url`, Zeitstempel; paginiert
  (Workspace aktuell: 766 Projekte).
- **Projektdetails**: u. a. `plan_id` — Einstieg in alles Planbezogene.
- **Dateien eines Projekts**: `id`, `filename`, `filetype`, `filesize` und eine
  **direkt ladbare, vorsignierte S3-URL** (Gültigkeit 24 h). Typisches
  aufgemessenes Projekt: 4 Baustellenfotos (JPEG, je ~0,3 MB), ein
  Rundgang-Video (117 MB) und `plan.thumb` (20 KB Vorschaubild des
  Grundrisses).
- **Plan**: strukturierte Geometrie (Räume, Maße) plus Statistiken,
  Formulare und Feuchtemesswerte.

**Offener Punkt:** in der Dateiliste liegt kein gerenderter Grundriss-PDF/-PNG
in voller Auflösung — nur `plan.thumb`. Vor der Umsetzung ist zu klären, ob die
magicplan-REST-API einen Export-Endpunkt (PDF/PNG-Rendering eines Plans)
anbietet. Drei Ausgänge, in dieser Reihenfolge prüfen:

1. Export-Endpunkt existiert → PDF holen, fertig.
2. Nur `plan.thumb` → für die Timeline reicht das oft; zusätzlich die
   Baustellenfotos anbieten.
3. Weder noch → Geometrie aus dem Plan-Endpunkt serverseitig als SVG rendern
   (mehr Arbeit, dafür exakt im Corporate-Design).

### Umsetzung

| Schritt | Ort | Inhalt |
|---|---|---|
| 1 | `.env` | `MAGICPLAN_API_KEY`, `MAGICPLAN_BASE_URL` — Key **nur** serverseitig, nie ins Frontend |
| 2 | `src/routes/magicplan.js` (neu) | `GET /api/magicplan/project?dealId=` → Projekt über `external_reference_id` suchen, Fallback Name/Adresse; `GET /api/magicplan/project/:id/files` → Dateiliste; `POST /api/magicplan/import` → gewählte Dateien serverseitig laden, verkleinern, zurückgeben |
| 3 | Caching | Projektliste pro Deal ~10 min im Speicher halten; die S3-URLs **nicht** cachen (24 h Signatur) und nie an den Client durchreichen — der Server lädt die Bytes |
| 4 | Frontend | In der Zone aus Stufe A ein zweiter Knopf „Aus magicplan laden": öffnet eine kleine Liste (Thumbnail, Dateiname, Größe) mit Mehrfachauswahl; Auswahl landet in derselben `bitrixFiles`-Liste wie ein manueller Upload |
| 5 | Fehlerfälle | kein Projekt gefunden / kein Key gesetzt / API down → Hinweiszeile und Rückfall auf den Screenshot-Weg aus Stufe A. Die Stufe A bleibt dauerhaft bestehen, sie ist der Notausgang |

**Aufwand:** ~1 Tag, wenn ein Export-Endpunkt existiert; +1–2 Tage für den
SVG-Rendering-Weg. Kein Eingriff in die native App.

**Nebennutzen:** derselbe Endpunkt liefert die Baustellenfotos — damit ist die
Foto-Dokumentation zum Deal ohne einen einzigen manuellen Upload möglich.

---

## C — iOS Share Extension („Teilen → EmC2")

**Ziel:** Screenshot in magicplan → Teilen-Symbol → „EmC2" → das Bild liegt im
offenen Angebot. Kein App-Wechsel, kein Umweg über die Fotomediathek.

### Ausgangslage

Der Wrapper ist eine schlanke `WKWebView`-App
([`ios/EmC2Konfigurator/`](../ios/EmC2Konfigurator/)) mit bereits vorhandener
JS-Brücke (`DurabilityMirror`, registriert über
`config.userContentController`) und einem Session-Keychain. Eine Share
Extension ist ein **zweites Target** im selben Xcode-Projekt.

### Umsetzung

1. **Neues Target** „ShareExtension" (`NSExtensionActivationRule`:
   `NSExtensionActivationSupportsImageWithMaxCount = 5`).
2. **App Group** (`group.de.emc2.konfigurator`) anlegen und bei App **und**
   Extension aktivieren — der gemeinsame Container ist der einzige Weg, wie die
   Extension Daten an die Haupt-App übergibt.
3. Extension schreibt die Bilder (bereits auf 1600 px verkleinert, gleiche
   Logik wie Stufe A) in den Group-Container und öffnet die App per
   Custom-URL-Scheme (`emc2konfigurator://plan-import`).
4. `SceneDelegate` fängt die URL ab, liest den Container leer und schiebt die
   Dateien über die bestehende `userContentController`-Brücke als
   Base64-Nachricht in die WebView.
5. Im Frontend ein Empfänger (`window.__emc2PlanImport(files)`), der genau die
   Funktion `addPlanFiles()` aus Stufe A aufruft — kein zweiter Codepfad.

### Kosten

- Xcode-Target, App-Group-Entitlement, **neues Provisioning-Profil**, App neu
  signieren und an alle Geräte verteilen.
- Jede Änderung braucht danach einen App-Rollout, keinen Deploy.

**Aufwand:** 2–3 Tage inkl. Verteilung. **Empfehlung: erst nach B**, und nur
wenn der Monteur den Weg über die Fotomediathek im Alltag tatsächlich als
störend meldet — B macht den Screenshot für magicplan-Pläne ohnehin überflüssig.

---

## Reihenfolge

```
A (fertig) ──> B (magicplan-Abruf)  ──> C (Share Extension, optional)
   Notausgang       ersetzt den            spart im Restfall
   bleibt immer     Screenshot             zwei Taps
```

Vor B zu klären: Export-Endpunkt der magicplan-API (siehe oben) und wer den
API-Key bereitstellt.
