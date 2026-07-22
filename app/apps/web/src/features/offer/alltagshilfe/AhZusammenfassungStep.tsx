import type { ReactNode } from "react";
import { useAhOffer } from "./AhOfferContext";
import { SERVICE_META, tasksFor } from "./ahServices";
import { useAhTotals } from "./useAhTotals";
import { StepHeader } from "../steps/KundendatenStep";
import { formatEUR } from "@/lib/format";

export function AhZusammenfassungStep() {
  const { payload } = useAhOffer();
  const { totals, zone } = useAhTotals();
  const k = payload.Kundendaten;
  const name = `${k.salutation} ${k.firstName} ${k.lastName}`.trim() || "—";
  const addr = [k.street, [k.postalCode, k.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <StepHeader title="Zusammenfassung" hint="Angaben prüfen und über die Kopfzeile speichern." />

      <Block title="Kunde">
        <Row label="Name" value={name} />
        {addr && <Row label="Adresse" value={addr} />}
        {k.phone && <Row label="Telefon" value={k.phone} />}
        {k.email && <Row label="E-Mail" value={k.email} />}
        <Row label="Zahler" value={k.payer || "—"} />
        {k.payer === "Kassenkunde" && (
          <>
            {k.krankenkasse && <Row label="Krankenkasse" value={k.krankenkasse} />}
            {k.pflegegrad && <Row label="Pflegegrad" value={k.pflegegrad === "beantragt" ? "Beantragt" : k.pflegegrad} />}
          </>
        )}
      </Block>

      <Block title="Leistungen">
        {payload.ah.services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Leistungen erfasst.</p>
        ) : (
          SERVICE_META.filter((m) => payload.ah.services.some((s) => s.type === m.type)).map((m) => {
            const svc = payload.ah.services.find((s) => s.type === m.type)!;
            const taskLabels = tasksFor(m.type).filter((t) => svc.tasks.includes(t.id));
            return (
              <div key={m.type} className="space-y-2 border-t py-3 first:border-t-0 first:pt-0">
                <p className="text-sm font-semibold">{m.label}</p>
                <ul className="space-y-0.5 text-sm text-muted-foreground">
                  {svc.schedules
                    .filter((s) => s.dauer || s.regelmaessigkeit)
                    .map((s, i) => (
                      <li key={i}>
                        {s.dauer || "—"} · {s.regelmaessigkeit || "—"}
                      </li>
                    ))}
                </ul>
                {taskLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {taskLabels.map((t) => (
                      <span key={t.id} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{t.label}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        {payload.ah.note && <p className="border-t pt-3 text-sm text-muted-foreground">Notiz: {payload.ah.note}</p>}
      </Block>

      <Block title="Kosten">
        {zone && <Row label="Reisezone" value={`Zone ${zone.zone} · ${zone.billMin} min Hinfahrt`} />}
        <Row label="Gesamt / Monat" value={formatEUR(totals.gesamt)} strong />
        {!totals.isSelbstzahler && <Row label="Eigenanteil / Monat" value={formatEUR(totals.eigenanteil)} strong />}
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
