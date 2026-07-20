// Holds the in-progress offer payload and exposes ergonomic update helpers.
// The payload is autosaved to localStorage so a refresh (or a crash) doesn't
// lose unsaved work.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultPayload, type OfferPayload } from "./payload";

interface OfferState {
  payload: OfferPayload;
  /** Shallow-merge a patch into one top-level section (e.g. "Kundendaten"). */
  patchSection: <K extends keyof OfferPayload>(section: K, patch: Record<string, any>) => void;
  /** Replace one section wholesale (e.g. after prefilling from a customer). */
  setSection: <K extends keyof OfferPayload>(section: K, value: any) => void;
  /** Replace the entire payload (e.g. loading a draft). */
  replacePayload: (p: OfferPayload) => void;
  reset: () => void;
}

const OfferCtx = createContext<OfferState | null>(null);

const AUTOSAVE_KEY = "emc2.offer.autosave.v1";

// Fill any missing top-level section from defaults. Older drafts (or a crash
// mid-edit) can lack a section like `optional`; steps read those directly, so a
// missing one white-screens. Normalising here keeps every step safe.
function normalize(p: Partial<OfferPayload> | null | undefined): OfferPayload {
  return { ...defaultPayload(), ...(p ?? {}) } as OfferPayload;
}

// A draft/deal loaded via URL owns the payload — don't restore the autosave over it.
function hasUrlOffer(): boolean {
  try {
    const sp = new URLSearchParams(window.location.search);
    return !!(sp.get("draft") || sp.get("dealId"));
  } catch {
    return false;
  }
}

function loadInitial(): OfferPayload {
  try {
    if (hasUrlOffer()) return defaultPayload();
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* corrupt/unavailable storage → fresh */
  }
  return defaultPayload();
}

export function OfferProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<OfferPayload>(loadInitial);

  // Autosave every change so an accidental refresh restores the work.
  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload));
    } catch {
      /* quota/unavailable — best effort */
    }
  }, [payload]);

  const patchSection = useCallback((section: any, patch: Record<string, any>) => {
    setPayload((p) => ({ ...p, [section]: { ...(p[section] as object), ...patch } }));
  }, []);

  const setSection = useCallback((section: any, value: any) => {
    setPayload((p) => ({ ...p, [section]: value }));
  }, []);

  const replacePayload = useCallback((p: OfferPayload) => setPayload(normalize(p)), []);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* ignore */
    }
    setPayload(defaultPayload());
  }, []);

  const value = useMemo(
    () => ({ payload, patchSection, setSection, replacePayload, reset }),
    [payload, patchSection, setSection, replacePayload, reset],
  );

  return <OfferCtx.Provider value={value}>{children}</OfferCtx.Provider>;
}

export function useOffer(): OfferState {
  const ctx = useContext(OfferCtx);
  if (!ctx) throw new Error("useOffer must be used within OfferProvider");
  return ctx;
}
