// Auszuführende Arbeiten — task catalogue ported from the legacy ARBEITSZEIT_RULES.
// key = stored value (duschwanne.workTasks); label = short UI text; minutes = basis
// for the work-time suggestion. The deprecated "replace_shower_system" is omitted.

export interface TaskDef {
  key: string;
  label: string;
  minutes: number;
}

export interface TaskGroup {
  title: string;
  tasks: TaskDef[];
}

export const TASK_GROUPS: TaskGroup[] = [
  {
    title: "Badewanne",
    tasks: [
      { key: "remove_tub", label: "Badewanne entfernen", minutes: 45 },
      { key: "install_bathtub", label: "Badewanne einbauen", minutes: 90 },
      { key: "install_bathtub_screen", label: "Wannenaufsatz montieren", minutes: 60 },
    ],
  },
  {
    title: "Duschwanne",
    tasks: [
      { key: "remove_showertub", label: "Duschwanne entfernen", minutes: 30 },
      { key: "remove_enclosure", label: "Duschabtrennung entfernen", minutes: 25 },
      { key: "install_tray", label: "Duschwanne installieren", minutes: 75 },
      { key: "install_sitzbath", label: "Sitzbadewanne einbauen", minutes: 120 },
    ],
  },
  {
    title: "Duschabtrennung",
    tasks: [
      { key: "remove_shower_curtain", label: "Duschvorhang entfernen", minutes: 15 },
      { key: "install_shower_curtain", label: "Duschvorhang montieren", minutes: 15 },
      { key: "install_enclosure", label: "Duschabtrennung montieren", minutes: 60 },
      { key: "install_box_enclosure", label: "Kasten verkleiden", minutes: 60 },
      { key: "install_distance_profile", label: "Abstandprofil montieren", minutes: 20 },
    ],
  },
  {
    title: "Thermostat / Duschsystem",
    tasks: [
      { key: "close_valve", label: "Armatur stilllegen", minutes: 45 },
      { key: "relocate_faucet", label: "Armatur versetzen", minutes: 90 },
      { key: "relocate_drain", label: "Abfluss verlegen", minutes: 30 },
      { key: "convert_faucet", label: "Armatur umbauen", minutes: 90 },
      { key: "replace_thermostat", label: "Thermostat auswechseln", minutes: 30 },
      { key: "replace_shower_no_thermo", label: "Duschsystem auswechseln", minutes: 30 },
      { key: "replace_shower_with_thermo", label: "Duschsystem + Thermostat auswechseln", minutes: 45 },
      { key: "install_shower_basket", label: "Duschkorb montieren", minutes: 15 },
    ],
  },
  {
    title: "Waschbecken",
    tasks: [
      { key: "remove_sink", label: "Waschbecken entfernen", minutes: 30 },
      { key: "install_sink", label: "Waschbecken einbauen", minutes: 45 },
      { key: "replace_sink_faucet", label: "Waschbecken-Armatur auswechseln", minutes: 30 },
    ],
  },
  {
    title: "Bademöbel",
    tasks: [
      { key: "remove_furniture", label: "Bademöbel entfernen", minutes: 20 },
      { key: "install_furniture", label: "Bademöbel einbauen", minutes: 30 },
    ],
  },
  {
    title: "Toilette",
    tasks: [
      { key: "remove_toilet", label: "Toilette entfernen", minutes: 50 },
      { key: "install_toilet", label: "Toilette montieren", minutes: 20 },
      { key: "install_shower_wc", label: "Dusch-WC einbauen", minutes: 60 },
    ],
  },
];

/** key → minutes, for the work-time suggestion. */
export const TASK_MINUTES: Record<string, number> = Object.fromEntries(
  TASK_GROUPS.flatMap((g) => g.tasks.map((t) => [t.key, t.minutes])),
);
