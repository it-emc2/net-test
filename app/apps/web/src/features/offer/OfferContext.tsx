// Holds the in-progress offer payload and exposes ergonomic update helpers.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
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

export function OfferProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<OfferPayload>(defaultPayload);

  const patchSection = useCallback((section: any, patch: Record<string, any>) => {
    setPayload((p) => ({ ...p, [section]: { ...(p[section] as object), ...patch } }));
  }, []);

  const setSection = useCallback((section: any, value: any) => {
    setPayload((p) => ({ ...p, [section]: value }));
  }, []);

  const replacePayload = useCallback((p: OfferPayload) => setPayload(p), []);
  const reset = useCallback(() => setPayload(defaultPayload()), []);

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
