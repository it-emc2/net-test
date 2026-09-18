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
| 3 | `feat/zf-checkliste` | Checkliste; spiegelt Status aus 1 und „versendet?" aus 2. |

Integration/Test-Branch: `test/zusammenfassung`.

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
  checkliste: { skizzeErstellt: false, fotosErstellt: false },
}
```

`payload.zusammenfassung` wird in `buildPayload()` (script.js) geschrieben und
im `RestoreManager` zurückgelesen. `Offer.payload` ist `Mixed` — kein
Schema-Änderung nötig.

## Neue Regel hinzufügen

Ein Eintrag in `RULES` in `src/public/angebotscheck.js`:

```js
{ id: "kurz-und-eindeutig", group: "material", severity: "gelb",
  test: ({ services, materials, optionals }) => /* Text, Text[] oder nichts */ }
```

Ein Fehler in einer Regel wird verschluckt — eine kaputte Regel darf die
Prüfung nie blockieren.

## Offen

- Das aktuelle Regelset ist ein Platzhalter (Vollständigkeit/Plausibilität).
  Die fachlichen Regeln müssen noch definiert werden.
- KI-basierte Prüfung: später, gleiche Ausgabestruktur.
