# Context for n8n: workflow "Handwerk – Arbeitszeiten je Tätigkeit"

## Goal
Build an n8n form that our tradespeople (Handwerk) fill in on a tablet. They check how long each task takes during a bathroom conversion (BU offer, section "Auszuführende Arbeiten"). The answers are later entered as minutes in our configurator's admin panel.

## Form (all text the tradespeople see in German)
- Start: n8n Form Trigger, page 1: "Kürzel des Handwerkers" (text, required), "Datum" (date, default today).
- Then one form page per `gruppe` (in this order): Badewanne, Duschwanne, Duschabtrennung, Thermostat / Duschsystem, Waschbecken, Bademöbel, Toilette, Wandverkleidung, Fußboden, Optional. Use "Form" nodes (Next Form Page), ideally define the fields from JSON so they can be generated from the list below.
- For each row of the group, show the sentence `satz` as a heading/label, then:
  1. If `benoetigt` = ja: dropdown "Wird diese Arbeit in der Praxis benötigt?" (ja / nein / weiß nicht), required.
  2. Number field with the text `zeit_frage`, pre-filled with `min` (if `min` = "-": empty, placeholder "Zeit fehlt"). Unit `einheit` in the hint text. Optional: dropdown with steps 0, 5, 10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240 + "andere Zeit" with a free number field.
  3. If `beschreibung` = ja: text area "Können Sie diese Arbeit erklären? Was genau wird gemacht?".
  4. Always: optional text field "Bemerkung".
- Field names: `<id>__benoetigt`, `<id>__minuten`, `<id>__beschreibung`, `<id>__bemerkung`.
- Last page: "Danke!", no further questions.

## Storage
- After submission, flatten the answers into one row per task: kuerzel, datum, id, gruppe, satz, vorbelegung_min, antwort_min, abweichung_min (= antwort − vorbelegung), benoetigt, beschreibung, bemerkung, admin_key.
- Write them to an n8n Data Table (or Google Sheet) "handwerk_arbeitszeiten". Do not overwrite anything; every submission is new rows.
- Optional summary per `id` (several tradespeople): median of antwort_min, count of answers.
- Do NOT write automatically into the configurator. The minutes are entered manually in the admin panel (section "Arbeitszeiten je Tätigkeit"); `admin_key` shows the field there ("-" = no admin field yet).

## Notes
- Times are in minutes for the whole crew on site (normally 2 fitters), not per person.
- Wandverkleidung: base time per panel (wv_platte_*); the types (wv_*) only ask about extra effort on top of the panels.
- Optional rows waschtisch/batterie/thermostat may duplicate a task from the Arbeiten tab, so the "benötigt" question matters there.

## Rows (46)
Format: id | gruppe | satz | min | einheit | benoetigt | beschreibung | zeit_frage | admin_key
remove_tub | Badewanne | Entfernen und Entsorgen der Badewanne inkl. Befliesung | 45 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_tub
install_bathtub | Badewanne | Einbau der Badewanne | 90 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_bathtub
install_bathtub_screen | Badewanne | Einbau des Wannenaufsatzes | 60 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_bathtub_screen
remove_showertub | Duschwanne | Entfernen und Entsorgen der Duschwanne inkl. Befliesung | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_showertub
install_tray | Duschwanne | Einbau der Duschwanne | 75 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_tray
install_sitzbath | Duschwanne | Einbau einer Sitzbadewanne inkl. Tür | 120 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_sitzbath
remove_shower_curtain | Duschabtrennung | Entfernen und Entsorgen des Duschvorhangs | 15 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_shower_curtain
remove_enclosure | Duschabtrennung | Entfernen und Entsorgen der Duschabtrennung | 25 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_enclosure
install_shower_curtain | Duschabtrennung | Einbau eines Duschvorhangs | 15 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_shower_curtain
install_enclosure | Duschabtrennung | Einbau der Duschabtrennung | 60 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_enclosure
trockenbau_duschbereich | Duschabtrennung | Trockenbau im Duschbereich | - | pro Ausführung | ja | ja | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_trockenbau_duschbereich
install_distance_profile | Duschabtrennung | Einbau eines Abstandsprofils | 20 | pro Ausführung | ja | ja | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_distance_profile
aluprofil_trockenbau | Duschabtrennung | Aluprofil für Trockenbau (… mm) statt Verbindungsprofil | 120 | pro Stelle | nein | ja | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | -
close_valve | Thermostat / Duschsystem | Stilllegen der Armatur | 45 | pro Ausführung | ja | ja | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_close_valve
relocate_faucet | Thermostat / Duschsystem | Versetzen, Verlegen einer Armatur | 90 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_relocate_faucet
relocate_drain | Thermostat / Duschsystem | Versetzen, verlegen eines Abflusses | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_relocate_drain
convert_faucet | Thermostat / Duschsystem | Umbau einer Unterputz-Armatur in eine Aufputz-Armatur | 90 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_convert_faucet
replace_thermostat | Thermostat / Duschsystem | Auswechseln eines Aufputz-Thermostats | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_replace_thermostat
replace_shower_no_thermo | Thermostat / Duschsystem | Auswechseln des Duschsystems ohne Thermostat | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_replace_shower_no_thermo
replace_shower_with_thermo | Thermostat / Duschsystem | Auswechseln des Duschsystems inkl. Aufputz-Thermostat | 45 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_replace_shower_with_thermo
install_shower_basket | Thermostat / Duschsystem | Einbau eines Duschkorbes | 15 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_shower_basket
remove_sink | Waschbecken | Entfernen und Entsorgen eines Waschbeckens | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_sink
install_sink | Waschbecken | Einbau eines Waschbeckens | 45 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_sink
replace_sink_faucet | Waschbecken | Auswechseln einer Waschbecken-Armatur | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_replace_sink_faucet
remove_furniture | Bademöbel | Entfernen und Entsorgen von Bademöbel | 20 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_furniture
install_furniture | Bademöbel | Einbau von Bademöbel | 30 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_furniture
remove_toilet | Toilette | Entfernen und Entsorgen einer Toilette | 50 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_remove_toilet
install_toilet | Toilette | Einbau einer Toilette | 20 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_toilet
install_shower_wc | Toilette | Einbau eines Dusch-WCs | 60 | pro Ausführung | nein | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_install_shower_wc
trockenbau_wc | Toilette | Trockenbau für das WC | - | pro Ausführung | ja | ja | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | AZ_MIN_trockenbau_wc
wv_platte_997 | Wandverkleidung | (kein eigener Satz – Zeitbasis für alle Wandverkleidungs-Arten) | 30 | pro Platte | nein | nein | Wie lange dauert die Montage einer Platte 997×2550 (Minuten)? | AZ_MIN_wv997
wv_platte_1497 | Wandverkleidung | (kein eigener Satz – Zeitbasis für alle Wandverkleidungs-Arten) | 40 | pro Platte | nein | nein | Wie lange dauert die Montage einer Platte 1497×2550 (Minuten)? | AZ_MIN_wv1497
wv_silikon | Wandverkleidung | (kein eigener Satz) | 10 | pro Angebot | nein | nein | Wie lange dauert das Silikonieren (Minuten)? | AZ_MIN_silikon
wv_fehlstellen | Wandverkleidung | Schließen der Fehlstellen | 0 | pro Ausführung | nein | ja | Zusätzlicher Aufwand für diese Art, außer der Plattenmontage (Minuten)? | -
wv_deckenhoch | Wandverkleidung | Verkleidung deckenhoch im Dusch-/Wannenbereich | 0 | pro Ausführung | nein | nein | Zusätzlicher Aufwand für diese Art, außer der Plattenmontage (Minuten)? | -
wv_fliesenspiegel | Wandverkleidung | Verkleidung bis zur Höhe des Fliesenspiegels im Dusch-/Wannenbereich | 0 | pro Ausführung | nein | ja | Zusätzlicher Aufwand für diese Art, außer der Plattenmontage (Minuten)? | -
wv_innenraum_kabine | Wandverkleidung | Verkleidung im Innenraum der Kabine | 0 | pro Ausführung | nein | ja | Zusätzlicher Aufwand für diese Art, außer der Plattenmontage (Minuten)? | -
wv_alle_wande | Wandverkleidung | Verkleidung deckenhoch aller Bad-Wände | 0 | pro Ausführung | nein | nein | Zusätzlicher Aufwand für diese Art, außer der Plattenmontage (Minuten)? | -
wandverkleidung_duschbereich | Wandverkleidung | Wandverkleidung in Duschbereich bis in einer Höhe von … cm | 0 | pro Ausführung | ja | ja | Zusätzlicher Aufwand für diese Art, außer der Plattenmontage (Minuten)? | -
floor_fehlstellen | Fußboden | Schließen der Fehlstellen im Fußbodenbereich | 8 | pro m² | nein | ja | Wie lange dauert diese Arbeit pro m² (Minuten)? | AZ_MIN_flooring_m2
floor_gesamt | Fußboden | Fußbodenverkleidung im gesamten Badbereich | 8 | pro m² | nein | nein | Wie lange dauert diese Arbeit pro m² (Minuten)? | AZ_MIN_flooring_m2
opt_haltegriffe | Optional | Anbringen zusätzlicher Haltegriffe | 30 | pro Stück | nein | nein | Wie lange dauert die Montage eines Haltegriffs (Minuten)? | AZ_MIN_grab
opt_stuetzklappgriffe | Optional | Anbringen zusätzlicher Stützklappgriffe | - | pro Stück | nein | nein | Wie lange dauert die Montage eines Stützklappgriffs (Minuten)? | -
opt_waschtisch | Optional | Auswechseln eines Waschtisches (bei CL60: „Anbringen zusätzliches/zusätzlicher Waschbecken ohne Unterschrank“) | - | pro Ausführung | ja | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | -
opt_waschtischbatterie | Optional | Einbau einer Einhand-Waschtischbatterie | - | pro Ausführung | ja | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | -
opt_thermostat | Optional | Austausch eines Thermostats | - | pro Ausführung | ja | nein | Wie lange dauert diese Arbeit (Minuten, 2 Monteure)? | -