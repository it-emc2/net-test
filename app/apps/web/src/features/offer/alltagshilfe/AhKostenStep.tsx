import { AhKostenOverview } from "./AhKostenOverview";
import { useAhTotals } from "./useAhTotals";
import { StepHeader } from "../steps/KundendatenStep";

export function AhKostenStep() {
  const { totals } = useAhTotals();
  return (
    <div className="space-y-6">
      <StepHeader title="Kosten" hint="Automatisch aus den erfassten Leistungen berechnet." />
      <AhKostenOverview totals={totals} />
    </div>
  );
}
