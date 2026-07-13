import { useState, type ReactNode } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useOffer } from "./OfferContext";
import { useLivePricing } from "./pricing";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PricingSidebar({ className }: { className?: string }) {
  const { payload } = useOffer();
  const { result, loading, error } = useLivePricing(payload);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

          {/* Collapsible line-item breakdown */}
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="mt-2 flex w-full items-center justify-between border-t pt-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={detailsOpen}
          >
            Kostenübersicht
            {detailsOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {detailsOpen && result && <Breakdown result={result} />}
        </div>
      )}
    </div>
  );
}

function Breakdown({ result }: { result: any }) {
  const matLines: any[] = (result.materials?.lines ?? []).filter((l: any) => Number(l.lineTotal) !== 0);
  const svcCost: any[] = (result.services?.lines ?? []).filter((l: any) => Number(l.amount) > 0);
  const svcNotes: any[] = (result.services?.lines ?? []).filter((l: any) => !Number(l.amount) && l.label);

  return (
    <div className="mt-3 space-y-4 text-xs">
      {matLines.length > 0 && (
        <Group title="Material">
          {matLines.map((l, i) => (
            <DetailRow key={i} label={clean(l.label || l.name || l.productId)} value={l.lineTotal} />
          ))}
        </Group>
      )}

      <Group title="Leistungen">
        {svcCost.length === 0 && <p className="text-muted-foreground">Noch keine Leistungen.</p>}
        {svcCost.map((l, i) => (
          <DetailRow key={i} label={clean(l.label)} value={l.amount} />
        ))}
      </Group>

      {svcNotes.length > 0 && (
        <Group title="Auszuführende Arbeiten">
          {svcNotes.map((l, i) => (
            <p key={i} className="text-muted-foreground">{clean(l.label)}</p>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="shrink-0 tabular-nums">{formatEUR(Number(value) || 0)}</span>
    </div>
  );
}

/** Strip the leading "- " / bullet the engine prefixes onto line labels. */
function clean(s: unknown): string {
  return String(s ?? "").replace(/^[\s•·–—-]+/, "").trim();
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
