import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [qc] = useState(() => client ?? newQueryClient());
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
