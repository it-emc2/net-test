import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { OfferPayload } from "./payload";

/** Subset of the pricing result the sidebar renders. The engine returns more. */
export interface PricingResult {
  total: number;
  Nettobetrag: number;
  markup: number;
  markupPct: number;
  vatOnNet: number;
  rabattAmount: number;
  netAfterRabatt_and_Bonus: number;
  bonusGross: number;
  subsidyKind: string;
  subsidyAmount: number;
  subsidyAmount_max: number;
  selfPayAmount: number;
  materials: { title: string; sum: number; lines: any[] };
  services: { title: string; sum: number; lines: any[] };
  [key: string]: any;
}

export function computePricing(payload: OfferPayload): Promise<PricingResult> {
  return api.post<PricingResult>("/api/pricing", payload);
}

/** Recompute pricing whenever the payload changes, debounced. */
export function useLivePricing(payload: OfferPayload, delay = 400) {
  const [result, setResult] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      computePricing(payload)
        .then((r) => {
          if (id === reqId.current) {
            setResult(r);
            setError(null);
          }
        })
        .catch((err) => {
          if (id === reqId.current) setError(err.message || "Preisberechnung fehlgeschlagen");
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false);
        });
    }, delay);
    return () => clearTimeout(t);
  }, [payload, delay]);

  return { result, loading, error };
}
