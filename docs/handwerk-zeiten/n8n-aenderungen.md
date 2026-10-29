# Changes to the n8n form "Arbeitszeiten je Tätigkeit"

Goal of the form (new): TR only selects products + quantities in the configurator. Tasks AND time must be derivable from that automatically. So the form must ask not only "how long", but also (a) what makes a task longer, (b) which tasks belong to a product, (c) site conditions, (d) fixed effort per job. All text the tradespeople see stays German.

## A. Fixes to the current form (keep structure)

1. **Remove internal notes** – the tradespeople must not see these texts (keep them only in the stored data):
   - "FCM rechnet Wandverkleidung nur über die Plattenanzahl …"
   - "FCM unterscheidet nicht zwischen den beiden Arten."
   - "Wird aktuell nicht im automatischen Arbeitszeit-Vorschlag gezählt."
   - "Wird zusätzlich zu „…" gedruckt – evtl. doppelt."
   - "(kein eigener Satz – Zeitbasis …)" / "(kein eigener Satz)" → heading instead: "Montage einer Platte 997×2550", "Montage einer Platte 1497×2550", "Silikonieren".
2. **German system texts:** dropdown placeholder "Select an option ..." → "Bitte wählen …"; error "This field is required" → "Bitte ausfüllen".
3. **Confirm the pre-filled value:** right now someone can just click "Weiter" and the pre-filled value counts as an answer. Per task instead:
   - Dropdown "Passt die Zeit von X Min?" (ja / nein, eher mehr / nein, eher weniger / weiß nicht), required.
   - Number field "Ihre Zeit (Minuten)" only if not "ja" (or always visible, but empty instead of pre-filled).
4. **Fewer fields:** instead of "Bemerkung" under every task → one text area "Bemerkungen zu dieser Seite" at the end of each page.
5. **Wording:** "pro Ausführung" → "pro Bad". Add a hint at the top of every page: "Zeit = reine Arbeitszeit vor Ort für den ganzen Trupp (normal 2 Monteure), ohne Anfahrt."
6. **Fußboden:** keep both types separate (they will get separate admin fields). Add: "Wie lange dauert es, wenn die Fläche unbekannt ist (pauschal)?" pre-filled with 25.

## B. New per task: "Was verlängert die Arbeit?"

After each time question (only for the tasks listed here), one multi-select + number field per selected factor: "Wie viele Minuten zusätzlich?" Options:

| Task | Options (multi-select) |
|---|---|
| Entfernen Badewanne | Wanne eingemauert/eingefliest · Stahlwanne (schwer) · Fliesen müssen mit ab · enger Raum · andere: ___ |
| Entfernen Duschwanne | eingefliest · bodengleich/gemauert · Fliesen müssen mit ab · andere: ___ |
| Einbau Duschwanne | Größe über 90×120 · bodengleich/ebenerdig · Untergrund muss ausgeglichen werden · Abfluss passt nicht · andere: ___ |
| Einbau Badewanne | Wannenträger nötig · Einmauern/Verkleiden · andere: ___ |
| Einbau Duschabtrennung | Walk-in · Eckeinstieg · Nische · schräge/unebene Wand · Sondermaß · andere: ___ |
| Versetzen Armatur / Abfluss | Wand/Boden muss geöffnet werden · lange Leitungsstrecke · andere: ___ |
| Einbau Toilette / Dusch-WC | Vorwandelement nötig · Stromanschluss nötig (Dusch-WC) · andere: ___ |
| Einbau Waschbecken | Unterschrank · neue Anschlüsse nötig · andere: ___ |

## C. New per product: "Welche Arbeiten gehören dazu?" (basis for automatic ticking)

One page "Was fällt bei diesen Produkten an?". For each product, the list of matching tasks, each with the dropdown **immer / oft / selten / nie** + text field "Woran erkennt man vor Ort, ob es nötig ist?":

| Product (selected in the configurator) | Tasks to rate |
|---|---|
| Duschwanne | Entfernen alte Duschwanne · Entfernen Badewanne · Abstandsprofil · Trockenbau Duschbereich · Aluprofil statt Verbindungsprofil · Abfluss versetzen · Armatur versetzen · Silikon |
| Duschabtrennung | Entfernen alte Duschabtrennung · Abstandsprofil · Silikon |
| Duschvorhang | Entfernen alter Duschvorhang |
| Badewanne | Entfernen alte Badewanne · Wannenaufsatz |
| Wandverkleidung | Trockenbau Duschbereich · Fehlstellen schließen · Silikon · Armatur stilllegen |
| Fußboden | Fehlstellen schließen · Bademöbel entfernen/wieder einbauen · Toilette ab- und wieder anbauen |
| Toilette / Dusch-WC | Entfernen alte Toilette · Trockenbau WC |
| Waschtisch | Entfernen altes Waschbecken · Armatur wechseln · Bademöbel entfernen |
| Thermostat / Duschsystem | Armatur stilllegen · Umbau Unterputz → Aufputz |

"immer" becomes an automatic rule, "oft/selten" becomes a yes/no question for TR, "nie" drops out.

## D. New page: Wandverkleidung in detail

Replace the "Zusätzlicher Aufwand für diese Art" fields with:
- Minutes per panel, **per type** (pre-filled 30 for 997, 40 for 1497): Fehlstellen · deckenhoch Dusch-/Wannenbereich · bis Fliesenspiegel · Innenraum der Kabine · alle Bad-Wände.
- Minutes **per outside corner** (Außenecke).
- Minutes **per cutout** (Armatur, Steckdose, Fenster, Rohr).
- Minutes **per running metre of silicone joint** (instead of flat-rate "Silikonieren").
- "Müssen alte Fliesen vorher entfernt werden?" (nie / manchmal / oft) + minutes per m².
- "Was verlängert die Wandverkleidung sonst?" (free text).

## E. New page: conditions on site (surcharges)

For each: "Wie viel länger dauert der gesamte Auftrag?" (minutes or %, plus selection **pro Auftrag / pro Tag**):
- Wohnung ab 2. OG ohne Aufzug
- Parken weit entfernt / Material weit zu tragen
- Altbau (unebene Wände, alte Leitungen)
- sehr kleines Bad (unter 4 m²)
- Kunde wohnt während des Umbaus im Bad (täglich aufräumen/nutzbar machen)
- andere: ___

## F. New page: fixed effort per job / per day

- Baustelle einrichten (abdecken, Material reintragen) – minutes per job
- Tägliches Aufräumen / Baustelle sichern – minutes per day
- Endreinigung + Übergabe an Kunden – minutes per job
- Entsorgung (Fahrt zum Wertstoffhof etc.) – minutes per job
- Trocknungszeiten (Kleber, Silikon, Estrich): "Muss gewartet werden, bevor weitergearbeitet werden kann?" + hours + "bei welcher Arbeit?"

## G. New page: products without their own task

Time per piece (currently not captured at all): Duschhocker · Rampe · REHA-Produkte · WC-Zubehör (Sitz, Halterung) · Wandeinbau-Siphon · Duschzubehör (except Duschkorb) · Sonderprodukte (free text: "welche, wie lange?").

## H. Storage (extend)

- New column `typ`: zeit | faktor | produkt_regel | bedingung | fix | produkt_zeit.
- For C: one row per product × task with `haeufigkeit` (immer/oft/selten/nie) + `kriterium`.
- For "Passt die Zeit?": column `bestaetigt` (ja/mehr/weniger/weiß nicht) next to `antwort_min`.
- Empty number = no answer (do not use the pre-filled value as the answer).

## Order of pages (suggestion)

1. Start (Kürzel, Datum) → 2. Feste Zeiten (F) → 3–10. Task groups as now, incl. B → 11. Wandverkleidung (D) → 12. Fußboden → 13. Optional + products without task (G) → 14. Products → tasks (C) → 15. Conditions on site (E) → submit.

Note: pages 14/15 are new but short; C is the most important page for automatic ticking.
