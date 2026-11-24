// Pending settings changes, kept while the admin moves between sections (as today's panel:
// one "Speichern" for all sections). Only in memory; a reload drops them.
import { create } from "zustand";
import type { Parsed } from "./rules.js";

interface Draft {
  /** key → the value "Speichern" sends */
  changes: Record<string, unknown>;
  /** key → the text in the field while it differs from the value (keeps "12," or invalid JSON visible) */
  texts: Record<string, string>;
  /** keys whose text is not valid (JSON) */
  invalid: Record<string, true>;
  edit: (key: string, parsed: Parsed, text?: string) => void;
  drop: (key: string) => void;
  clear: () => void;
}

const without = <T,>(o: Record<string, T>, k: string) => { const { [k]: _gone, ...rest } = o; return rest; };

export const useSettingsDraft = create<Draft>((set) => ({
  changes: {}, texts: {}, invalid: {},
  edit: (key, parsed, text) => set((s) => ({
    changes: parsed.kind === "change" ? { ...s.changes, [key]: parsed.value } : without(s.changes, key),
    texts: text === undefined ? without(s.texts, key) : { ...s.texts, [key]: text },
    invalid: parsed.kind === "invalid" ? { ...s.invalid, [key]: true } : without(s.invalid, key),
  })),
  drop: (key) => set((s) => ({ changes: without(s.changes, key), texts: without(s.texts, key), invalid: without(s.invalid, key) })),
  clear: () => set({ changes: {}, texts: {}, invalid: {} }),
}));
