# Zusammenfassung: Angebotscheck / Angebotsversand / Checkliste

Quelle: handschriftliche Notiz. Drei Blöcke auf der Zusammenfassung-Seite,
**vorerst nur für BU**.

```
Zusammenfassung
1. Angebotscheck   – regelbasierte Prüfung (später KI), Ampel grün/gelb/rot
2. Angebotsversand – Mail / Post
3. Checkliste      – Status Angebotscheck, Angebot versendet? Ja/Nein,
                     Magicplan Skizze erstellt, Fotoaufnahmen erstellt
```

## Aufteilung in Tasks / Branches

| # | Branch | Umfang |
|---|--------|--------|
| 1 | `feat/zf-angebotscheck` | Regelwerk + Ampel-Block. **Fertig.** |
| 2 | `feat/zf-angebotsversand` | Versandstatus (Mail/Post + Zeitpunkt). **Fertig.** |
| 3 | `feat/zf-checkliste` | Checkliste; spiegelt Status aus 1 und „versendet?" aus 2. **Fertig.** |

Integration/Test-Branch: `test/zusammenfassung`.

## Seiten

Für **bu** ist die Zusammenfassung seit dem Umbau eine Sidebar-Gruppe mit drei
Schritten (ohne Nummern-Badge):

| Schritt | Page-ID | Inhalt |
|---|---|---|
| Angebotscheck | `page-Angebotscheck` | Ampel + Findings |
| Angebotsversand | `page-Zusammenfassung` | Dokumentenstudio, Vorschau, Unterlagen, Mail/Post |
| Checkliste | `page-Checkliste` | abgeleitete Zeilen + zwei Haken |

Die Versand-Seite behält bewusst die alte ID `Zusammenfassung`: sämtlicher
bestehender Code (Preview-Refresh, `onEnterZusammenfassung`, Mail/Post) hängt
daran. Für bu wird nur das Sidebar-Label auf „Angebotsversand" umgestellt;
alle anderen Angebotstypen behalten die eine Seite mit altem Namen.

## Gruppierung

Ergebnisse werden nach den BU-Abschnitten der Übersicht gruppiert
(wie `SIDEBAR_GROUPS` in `script.js`):

- **I** Auszuführende Arbeiten → `servicesDisplayUI`
- **II** Material für Badumbau → `materialsDisplayUI`
- **III** Optionale Produkte → `optionalDisplayUI`

## Schnittstelle für Task 2 + 3

`src/public/angebotsversand.js` hält den Versandstatus:

```js
window.__zfVersand = { art: "mail" | "post" | null, versendetAm: "<ISO>" | null };
window.markAngebotVersendet(art);   // von showSentDialog() in EmailManager.js
window.setZfVersand(versand);       // vom RestoreManager beim Öffnen
window.addEventListener("versand:updated", …);
```

Der Versand selbst bleibt unverändert (Mail/Post-Tabs). Gebucht wird in
`showSentDialog()` — der gemeinsamen Erfolgsstelle beider Wege; ein reiner
Bitrix-Upload (`bitrixOnly`) zählt nicht als Versand.

`src/public/angebotscheck.js` setzt nach jeder Prüfung:

```js
window.__angebotscheck = {
  status: "gruen" | "gelb" | "rot",      // schlechtester Gruppenstatus
  groups: [{ key, num, title, status, findings: [{ id, severity, text }] }],
  geprueftAm: "<ISO>",
};
window.dispatchEvent(new CustomEvent("angebotscheck:updated", { detail: result }));
```

Geplantes Persistenz-Objekt am Angebot (Task 2 + 3 füllen ihren Zweig):

```js
zusammenfassung: {
  check:      { status, findings, geprueftAm },   // noch nicht persistiert
  versand:    { art: "mail" | "post" | null, versendetAm: null },  // fertig
  checkliste: { skizzeErstellt: false, fotosErstellt: false },  // fertig
}
```

`payload.zusammenfassung` wird in `buildPayload()` (script.js) geschrieben und
im `RestoreManager` zurückgelesen. `Offer.payload` ist `Mixed` — kein
Schema-Änderung nötig.

`src/public/checkliste.js` — zwei Zeilen sind abgeleitet und read-only
(Angebotscheck-Ampel aus Task 1, „Angebot versendet?" aus Task 2), zwei werden
von Hand abgehakt und landen in `payload.zusammenfassung.checkliste`:

```js
window.__zfCheckliste = { skizzeErstellt: false, fotosErstellt: false };
window.setZfCheckliste(checkliste);  // vom RestoreManager beim Öffnen
```

## Arbeit ⇄ Produkt

`WORK_RULES` koppelt einen angehakten Arbeitsschritt an die Auswahl, die er
braucht. **Nicht angehakt = keine Regel** — der Angebotscheck listet nur, was
dieses Angebot wirklich enthält.

12 harte Kopplungen (🔴) und 4 weiche (🟡):

| Arbeit | braucht | 🚦 |
|---|---|---|
| Auswechseln eines Aufputz-Thermostats | Thermostat-Produkt | 🔴 |
| Duschsystem ohne Thermostat | Duschsystem-Produkt | 🔴 |
| Duschsystem inkl. Thermostat | Duschsystem-Produkt (ein Produkt deckt beides) | 🔴 |
| Waschbecken-Armatur auswechseln | Einhand-Waschtischbatterie | 🔴 |
| Einbau eines Waschbeckens | Waschtisch | 🔴 |
| Einbau eines Duschkorbes | Duschzubehör | 🔴 |
| Einbau der Badewanne | Produkt aus „Wanne" | 🔴 |
| Einbau einer Toilette / eines Dusch-WCs | Produkt aus „WC" | 🔴 |
| Einbau Duschwanne / Duschabtrennung / Duschvorhang | passendes Material | 🔴 |
| Trockenbau Duschbereich / WC | Wandverkleidung | 🟡 |
| Einbau eines Abstandsprofils | Duschabtrennung | 🟡 |
| Einbau des Wannenaufsatzes | Duschabtrennung oder Wanne | 🟡 |

Beide Richtungen werden geprüft:

- Arbeitsschritt angehakt, Produkt fehlt → 🔴/🟡
- Produkt gewählt, Arbeitsschritt fehlt → 🟡 („wer baut das ein?"), Zeile
  zeigt auf **Arbeiten**. Die weichen Kopplungen haben bewusst keine
  Gegenrichtung (`noReverse`) — eine Wandverkleidung ohne Trockenbau ist
  normal. Teilen sich zwei Arbeitsschritte dasselbe Produkt (`sharesWith`,
  z. B. WC/Dusch-WC), meldet keiner das Produkt als verwaist.
- beides vorhanden → 🟢

**Erfüllte Regeln verschwinden nicht**, sie werden grün. Nur eine Kopplung,
die dieses Angebot gar nicht berührt, erzeugt keine Zeile.

Gelesen wird über `readSelection()`:

- Arbeitsschritte und Optionalprodukte aus dem DOM
- Materialkategorien aus den bepreisten Zeilen
- Duschvorhang und Duschabtrennung aus ihren Konfiguratoren
  (`__vorhangConfigurator`, `__daConfigurator`) — der Vorhang hängt seine
  Zeilen an `duschabtrennung.quickAdd`, die bepreiste Kategorie kann beide
  also nicht unterscheiden.

Kategorien, deren Produkte erst zur Laufzeit geladen werden (Wanne, WC),
melden 🟡 „kein Produkt hinterlegt", solange der Katalog leer ist — die Regel
wäre sonst nicht erfüllbar. Sobald ein Produkt existiert und gewählt ist,
wird die Zeile von allein grün.

Bewusst ohne Regel: alle „Entfernen und Entsorgen"-Schritte, Stilllegen/
Versetzen von Armatur und Abfluss, UP→AP-Umbau, Bademöbel, Sitzbadewanne.

## Darstellung

Gesamtstatus oben, darunter je Abschnitt eine nach Schwere sortierte Liste
(🔴 → 🟡 → 🟢) mit Zählern im Abschnittstitel. Jede Zeile ist ein Button und
springt per `location.hash` auf die Seite, die sie behebt — reine
Schrittnavigation, das Formular bleibt unangetastet.

## Neue Regel hinzufügen

Ein Eintrag in `RULES` in `src/public/angebotscheck.js`:

```js
{ id: "kurz-und-eindeutig", group: "material", severity: "gelb",
  test: ({ services, materials, optionals }) => /* Text, Text[] oder nichts */ }
```

Ein Fehler in einer Regel wird verschluckt — eine kaputte Regel darf die
Prüfung nie blockieren.

## Offen

- Der Angebotscheck-Status wird noch **nicht** persistiert (nur zur Laufzeit
  berechnet). Für einen historischen Nachweis müsste `check` in
  `buildPayload()` mitgeschrieben werden.
- Kein manuelles „als versendet markieren" — nur ein Versand aus der App
  setzt den Status.
- KI-basierte Prüfung: später, gleiche Ausgabestruktur.
