// AH offer state — mirrors the BU OfferContext but typed to AhPayload and with
// its own autosave key so BU and AH drafts never clobber each other.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { defaultAhPayload, defaultAhKundendaten, type AhPayload } from "./ahPayload";

interface AhOfferState {
  payload: AhPayload;
  patchSection: <K extends keyof AhPayload>(section: K, patch: Record<string, any>) => void;
  setSection: <K extends keyof AhPayload>(section: K, value: any) => void;
  replacePayload: (p: AhPayload) => void;
  reset: () => void;
}

const AhOfferCtx = createContext<AhOfferState | null>(null);

const AUTOSAVE_KEY = "emc2.offer.ah.autosave.v1";

// Fill missing sections/fields from defaults so an older draft (or crash) doesn't
// leave a field undefined and white-screen a step.
function normalize(p: Partial<AhPayload> | null | undefined): AhPayload {
  const d = defaultAhPayload();
  const src = (p ?? {}) as Partial<AhPayload>;
  return {
    ...d,
    ...src,
    Kundendaten: { ...defaultAhKundendaten(), ...((src.Kundendaten ?? {}) as object) },
    ah: { ...d.ah, ...((src.ah ?? {}) as object) },
  } as AhPayload;
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

function loadInitial(): AhPayload {
  try {
    if (hasUrlOffer()) return defaultAhPayload();
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* corrupt/unavailable storage → fresh */
  }
  return defaultAhPayload();
}

export function AhOfferProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<AhPayload>(loadInitial);

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
  const replacePayload = useCallback((p: AhPayload) => setPayload(normalize(p)), []);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* ignore */
    }
    setPayload(defaultAhPayload());
  }, []);

  const value = useMemo(
    () => ({ payload, patchSection, setSection, replacePayload, reset }),
    [payload, patchSection, setSection, replacePayload, reset],
  );

  return <AhOfferCtx.Provider value={value}>{children}</AhOfferCtx.Provider>;
}

export function useAhOffer(): AhOfferState {
  const ctx = useContext(AhOfferCtx);
  if (!ctx) throw new Error("useAhOffer must be used within AhOfferProvider");
  return ctx;
}
