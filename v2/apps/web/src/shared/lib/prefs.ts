// What a user sets for themself: colour theme, light/dark, automatic saving. Kept in the
// browser under the SAME keys as today's UI ("emc2.theme", "emc2.mode", "oc.autosave"), so a
// choice made in either UI applies in both.
import { create } from "zustand";

export const THEMES = [
  { value: "", label: "Je Angebotsart" },
  { value: "base", label: "Standard" },
  { value: "wohnen", label: "Wohnen" },
  { value: "pflege", label: "Pflege" },
  { value: "gesundheit", label: "Gesundheit" },
  { value: "kfz", label: "KFZ" },
] as const;
/** today's default accent per offer type, used while the user has not chosen a theme */
const OFFER_THEME: Record<string, string> = { bu: "wohnen", bwt: "gesundheit", ah: "pflege", hl: "pflege" };

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage blocked: the choice holds for this page only */ }
};

export type Mode = "light" | "dark" | "system";
const systemDark = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; } };
const isDark = (m: Mode) => (m === "system" ? systemDark() : m === "dark");

interface Prefs {
  /** "" = follow the offer type */
  theme: string;
  /** "system" = follow prefers-color-scheme */
  mode: Mode;
  /** the mode in effect now (mode, or the system's choice) */
  dark: boolean;
  autosave: boolean;
  /** the offer type whose accent applies while no theme is chosen (null: Hauptmenü) */
  offerType: string | null;
  setTheme(theme: string): void;
  setMode(mode: Mode): void;
  setAutosave(on: boolean): void;
  setOfferType(type: string | null): void;
}

function paint(p: Pick<Prefs, "theme" | "mode" | "offerType">) {
  const root = document.documentElement;
  const theme = p.theme || (p.offerType ? OFFER_THEME[p.offerType] : undefined) || "base";
  if (theme === "base") delete root.dataset.theme; else root.dataset.theme = theme;
  root.dataset.mode = isDark(p.mode) ? "dark" : "light";
}

export const usePrefs = create<Prefs>()((set, get) => {
  const known = (t: string | null) => (t && THEMES.some((x) => x.value === t) ? t : "");
  // the stored "dark"/"light" of today's toggle stay as they are; nothing stored = follow the system
  const stored = read("emc2.mode");
  const mode: Mode = stored === "dark" || stored === "light" ? stored : "system";
  const initial = { theme: known(read("emc2.theme")), mode, dark: isDark(mode), autosave: read("oc.autosave") !== "off", offerType: null };
  const update = (part: Partial<Prefs>) => { set(part); paint(get()); set({ dark: isDark(get().mode) }); };
  try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (get().mode === "system") update({}); }); } catch { /* no matchMedia: light */ }
  return {
    ...initial,
    setTheme: (theme) => { write("emc2.theme", theme || null); update({ theme }); },
    setMode: (mode) => { write("emc2.mode", mode === "system" ? null : mode); update({ mode }); },
    setAutosave: (autosave) => { write("oc.autosave", autosave ? "on" : "off"); set({ autosave }); },
    setOfferType: (offerType) => update({ offerType }),
  };
});

/** apply the stored choices before the first paint */
export const applyPrefs = () => paint(usePrefs.getState());
