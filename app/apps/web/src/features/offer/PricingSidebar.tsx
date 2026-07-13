import { Loader2 } from "lucide-react";
import { useOffer } from "./OfferContext";
import { useLivePricing } from "./pricing";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PricingSidebar({ className }: { className?: string }) {
  const { payload } = useOffer();
  const { result, loading, error } = useLivePricing(payload);
  const isKK = payload.Kundendaten.payer === "Kassenkunde";

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide">Kalkulation</h2>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {error ? (
        <p className="px-4 py-4 text-sm text-destructive">{error}</p>
      ) : (
        <div className="space-y-1.5 px-4 py-4 text-sm">
          <Row label="Material" value={result?.materials?.sum} />
          <Row label="Aufschlag" value={result?.markup} muted />
          <Row label="Dienstleistungen" value={result?.services?.sum} />
          <Divider />
          <Row label="Nettobetrag" value={result?.Nettobetrag} strong />
          {!!result?.rabattAmount && <Row label="Rabatt" value={-(result?.rabattAmount ?? 0)} muted />}
          {!!result?.bonusGross && <Row label="Bonus" value={-(result?.bonusGross ?? 0)} muted />}
          <Row label="MwSt." value={result?.vatOnNet} muted />
          <Divider />
          <Row label="Gesamt (brutto)" value={result?.total} strong big />

          {isKK && (
            <>
              <Divider />
              <Row label="Zuschuss" value={-(result?.subsidyAmount_max ?? 0)} muted />
              <Row label="Selbstkostenanteil" value={result?.selfPayAmount} strong big accent />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  big,
  accent,
}: {
  label: string;
  value: number | undefined;
  strong?: boolean;
  muted?: boolean;
  big?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={cn(muted ? "text-muted-foreground" : "", strong && "font-medium")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          strong && "font-semibold",
          big && "text-base",
          accent && "text-primary",
          muted && "text-muted-foreground",
        )}
      >
        {value == null ? "—" : formatEUR(value)}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="my-2 border-t" />;
}
