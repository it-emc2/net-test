import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { flushNow } from "../features/offer/index.js";

export const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [qc] = useState(() => client ?? newQueryClient());
  useEffect(() => { // the page goes away within the autosave delay: keep what was typed
    const hidden = () => { if (document.visibilityState === "hidden") flushNow(); };
    window.addEventListener("pagehide", flushNow);
    document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("pagehide", flushNow); document.removeEventListener("visibilitychange", hidden); };
  }, []);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
