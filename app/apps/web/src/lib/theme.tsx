// Theme + light/dark state, mirrored onto <html data-theme> / <html data-mode>
// and persisted under the same localStorage keys the legacy app uses.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ThemeName, ColorMode } from "@emc2/shared";

const THEME_KEY = "emc2.theme";
const MODE_KEY = "emc2.mode";

export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "base", label: "Standard" },
  { id: "wohnen", label: "Wohnen" },
  { id: "gesundheit", label: "Gesundheit" },
  { id: "pflege", label: "Pflege" },
  { id: "kfz", label: "KFZ" },
];

interface ThemeState {
  theme: ThemeName;
  mode: ColorMode;
  setTheme: (t: ThemeName) => void;
  setMode: (m: ColorMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => readStored(THEME_KEY, "base"));
  const [mode, setModeState] = useState<ColorMode>(() => readStored(MODE_KEY, "light"));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const value: ThemeState = {
    theme,
    mode,
    setTheme: setThemeState,
    setMode: setModeState,
    toggleMode: () => setModeState((m) => (m === "dark" ? "light" : "dark")),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
