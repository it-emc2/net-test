// AH service catalog + duration math, ported 1:1 from the legacy wizard
// (src/public/script.js). Task lists and frequencies are hardcoded there too —
// there is no DB/config for them.
import type { AhServiceType } from "./ahPayload";

export interface TaskDef {
  id: string;
  label: string;
}

export const REGELMAESSIGKEIT = [
  "Einmalig",
  "Wöchentlich",
  "14-tägig",
  "alle drei Wochen",
  "Monatlich",
  "Vierteljährlich",
  "Halbjährlich",
  "Jährlich",
] as const;

// Occurrences per month for each Regelmäßigkeit. "Einmalig" is handled separately
// (counted once, no monthly multiplier); anything not listed is not calculable.
export const FREQ_PER_MONTH: Record<string, number> = {
  Wöchentlich: 52 / 12,
  "14-tägig": 26 / 12,
  "alle drei Wochen": 52 / 3 / 12,
  Monatlich: 1,
  Vierteljährlich: 4 / 12,
  Halbjährlich: 2 / 12,
  Jährlich: 1 / 12,
};

export const ALLTAGSTASKS: TaskDef[] = [
  { id: "wohnungsreinigung", label: "Wohnungsreinigung (Staubsaugen, Wischen, Bad, Küche)" },
  { id: "fensterputzen", label: "Fenster putzen" },
  { id: "waeschewaschen", label: "Wäsche waschen, aufhängen, bügeln" },
  { id: "einkaufen", label: "Einkaufen (Lebensmittel, Drogerie, Apotheke)" },
  { id: "kochen", label: "Kochen / Mahlzeiten zubereiten" },
  { id: "geschirrspuelen", label: "Geschirr spülen / Küche aufräumen" },
  { id: "muell", label: "Müll rausbringen / Mülltrennung" },
  { id: "waeschereinigung", label: "Wäsche zum Reinigungsdienst bringen/abholen" },
  { id: "post", label: "Post holen und sortieren" },
  { id: "haustiere", label: "Haustierversorgung (Füttern, Gassi gehen)" },
];

export const BEGLEITUNG_TASKS: TaskDef[] = [
  { id: "arzttermine", label: "Begleitung zu Arztterminen" },
  { id: "behoerdengaenge", label: "Begleitung zu Behördengängen" },
  { id: "einkaufen_begl", label: "Begleitung zum Einkaufen (gemeinsam)" },
  { id: "spaziergaenge", label: "Spaziergänge / Bewegung an der frischen Luft" },
  { id: "gesellschaft", label: "Gesellschaft leisten / Gespräche führen" },
  { id: "vorlesen", label: "Vorlesen (Zeitung, Bücher)" },
  { id: "aktivitaeten", label: "Gemeinsame Aktivitäten (Spiele, Basteln, Kochen)" },
  { id: "gedaechtnis", label: "Gedächtnistraining / kognitive Aktivierung" },
  { id: "korrespondenz", label: "Unterstützung bei Korrespondenz (Briefe, Formulare)" },
  { id: "fahrdienste", label: "Fahrdienste (zum Friedhof, Friseur, Veranstaltungen)" },
  { id: "entlastung", label: "Entlastung pflegender Angehöriger (stundenweise Betreuung)" },
];

export function tasksFor(type: AhServiceType): TaskDef[] {
  return type === "Haushaltsnahedienstleistungen" ? ALLTAGSTASKS : BEGLEITUNG_TASKS;
}

export const SERVICE_META: { type: AhServiceType; label: string }[] = [
  { type: "Haushaltsnahedienstleistungen", label: "Haushaltsnahe Dienstleistungen" },
  { type: "Alltagsbegleitung", label: "Alltagsbegleitung" },
];

/** "H:MM" (or "H") → minutes. Blank/garbage → 0. */
export function parseDurationMinutes(v: string): number {
  if (!v) return 0;
  const parts = String(v).split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parts.length > 1 ? parseInt(parts[1], 10) || 0 : 0;
  return h * 60 + m;
}

/** minutes → "H:MM". */
export function formatDurationHHMM(mins: number): string {
  const t = Math.max(0, Math.round(mins));
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Monthly (or period-scaled) minutes for one schedule row.
 * periodMonths: 1 (/ Monat) or 12 (/ Jahr) — display scale only.
 * Returns null when not calculable (missing duration or an unlisted frequency).
 */
export function rowMinutes(dauer: string, regelmaessigkeit: string, periodMonths: number): number | null {
  const mins = parseDurationMinutes(dauer);
  if (!mins) return null;
  if (regelmaessigkeit === "Einmalig") return mins;
  const freq = FREQ_PER_MONTH[regelmaessigkeit];
  if (typeof freq !== "number") return null;
  return mins * freq * periodMonths;
}
