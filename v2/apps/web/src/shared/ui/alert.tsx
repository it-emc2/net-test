import { CircleAlert, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** An inline message. `error` is announced at once (role="alert"). */
export function Alert({ kind = "info", children, className }: { kind?: "info" | "error"; children: ReactNode; className?: string }) {
  const Icon = kind === "error" ? CircleAlert : Info;
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={cn("my-3 flex items-start gap-3 rounded-lg border-2 bg-card px-4 py-3", kind === "error" ? "border-destructive" : "border-border", className)}
    >
      <Icon aria-hidden className={cn("mt-1 size-5 shrink-0", kind === "error" ? "text-destructive" : "text-muted-foreground")} />
      <span>{children}</span>
    </p>
  );
}
