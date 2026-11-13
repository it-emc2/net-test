// The work tasks of a Badumbau: groups, values, titles and hints as in today's UI.
// Written from the recording of today's page (test/fixtures/arbeiten.json → `tasks`); the test
// compares this list with it.
export interface Task { value: string; title: string; hint: string }
export interface TaskGroup { title: string; tasks: readonly Task[] }
export const TASK_GROUPS: readonly TaskGroup[] = [
  { title: "1. Badewanne", tasks: [
    { value: "remove_tub", title: "Entfernen und Entsorgen der Badewanne inkl. Befliesung", hint: "Demontage, Abtransport & fachgerechte Entsorgung" },
    { value: "install_bathtub", title: "Einbau der Badewanne", hint: "Montage, Ausrichtung & Anschluss" },
    { value: "install_bathtub_screen", title: "Einbau des Wannenaufsatzes", hint: "Montage & Abdichtung gemäß Herstellerangaben" },
  ] },
  { title: "2. Duschwanne", tasks: [
    { value: "remove_showertub", title: "Entfernen und Entsorgen der Duschwanne inkl. Befliesung", hint: "Demontage, Abtransport & fachgerechte Entsorgung" },
    { value: "install_tray", title: "Einbau der Duschwanne", hint: "Montage, Ausrichtung & Anschluss" },
    { value: "install_sitzbath", title: "Einbau einer Sitzbadewanne inkl. Tür", hint: "Montage, Abdichtung & Türanschluss" },
  ] },
  { title: "3. Duschabtrennung", tasks: [
    { value: "remove_shower_curtain", title: "Entfernen und Entsorgen des Duschvorhangs", hint: "Demontage, Abtransport & fachgerechte Entsorgung" },
    { value: "remove_enclosure", title: "Entfernen und Entsorgen der Duschabtrennung", hint: "Demontage vorhandener Abtrennung inkl. Entsorgung" },
    { value: "install_shower_curtain", title: "Einbau eines Duschvorhangs", hint: "Montage & Befestigung" },
    { value: "install_enclosure", title: "Einbau der Duschabtrennung", hint: "Montage & Abdichtung gemäß Herstellerangaben" },
    { value: "trockenbau_duschbereich", title: "Trockenbau im Duschbereich", hint: "Montage & Verkleidung" },
    { value: "install_distance_profile", title: "Einbau eines Abstandsprofils", hint: "Montage & Befestigung" },
  ] },
  { title: "4. Thermostat / Duschsystem", tasks: [
    { value: "close_valve", title: "Stilllegen der Armatur", hint: "Armatur vorübergehend stilllegen" },
    { value: "relocate_faucet", title: "Versetzen, Verlegen einer Armatur", hint: "Versetzen/Anpassen der Armaturenposition" },
    { value: "relocate_drain", title: "Versetzen, verlegen eines Abflusses", hint: "Versetzen/Anpassen der Abflussposition" },
    { value: "install_lifting_unit", title: "Einbau einer Schmutzwasserhebeanlage", hint: "Montage, Abwasseranschluss & elektrischer Anschluss" },
    { value: "convert_faucet", title: "Umbau einer Unterputz-Armatur in eine Aufputz-Armatur", hint: "Umbau & Anschluss" },
    { value: "replace_thermostat", title: "Auswechseln eines Aufputz-Thermostats", hint: "Demontage Altteil + Montage/Anschluss neues Thermostat" },
    { value: "replace_shower_no_thermo", title: "Auswechseln des Duschsystems ohne Thermostat", hint: "Demontage Altteil + Montage/Anschluss neues Duschsystem" },
    { value: "replace_shower_with_thermo", title: "Auswechseln des Duschsystems inkl. Aufputz-Thermostat", hint: "Demontage Altteil + Montage/Anschluss Duschsystem & Thermostat" },
    { value: "install_shower_basket", title: "Einbau eines Duschkorbes", hint: "Montage & Befestigung" },
  ] },
  { title: "5. Waschbecken", tasks: [
    { value: "remove_sink", title: "Entfernen und Entsorgen eines Waschbeckens", hint: "Demontage, Abtransport & fachgerechte Entsorgung" },
    { value: "install_sink", title: "Einbau eines Waschbeckens", hint: "Montage, Ausrichtung & Anschluss" },
    { value: "replace_sink_faucet", title: "Auswechseln einer Waschbecken-Armatur", hint: "Demontage Altteil + Montage/Anschluss neue Armatur" },
  ] },
  { title: "6. Bademöbel", tasks: [
    { value: "remove_furniture", title: "Entfernen und Entsorgen von Bademöbel", hint: "Demontage, Abtransport & fachgerechte Entsorgung" },
    { value: "install_furniture", title: "Einbau von Bademöbel", hint: "Montage & Ausrichtung" },
  ] },
  { title: "7. Toilette", tasks: [
    { value: "remove_toilet", title: "Entfernen und Entsorgen einer Toilette", hint: "Demontage, Abtransport & fachgerechte Entsorgung" },
    { value: "install_toilet", title: "Einbau einer Toilette", hint: "Montage, Ausrichtung & Anschluss" },
    { value: "install_shower_wc", title: "Einbau eines Dusch-WCs", hint: "Montage, Ausrichtung & elektrischer Anschluss" },
    { value: "trockenbau_wc", title: "Trockenbau für das WC", hint: "Montage & Verkleidung" },
  ] },
];
/** every task in page order — the order `workTasks` is stored in */
export const TASKS: readonly Task[] = TASK_GROUPS.flatMap((g) => g.tasks);
