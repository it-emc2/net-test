import { cn } from "@/lib/utils";

/** Live stock indicator from the daily Vigor refresh. */
export function StockBadge({
  inStock,
  quantity,
  className,
}: {
  inStock: boolean;
  quantity: number | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        inStock
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-muted text-muted-foreground",
        className,
      )}
      title={quantity != null ? `${quantity} auf Lager` : "Kein Bestand hinterlegt"}
    >
      <span
        className={cn("size-1.5 rounded-full", inStock ? "bg-emerald-500" : "bg-muted-foreground/50")}
        aria-hidden
      />
      {inStock ? (quantity != null ? `${quantity} verfügbar` : "Verfügbar") : "Nicht verfügbar"}
    </span>
  );
}
