import { cn } from "@/lib/utils";

/** EmC² wordmark — the squared exponent is the brand's one flourish. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-extrabold tracking-tight select-none", className)}>
      EmC
      <sup className="text-primary">2</sup>
    </span>
  );
}
