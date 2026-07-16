import { useEffect, useRef, useState, type ReactNode } from "react";
import { MapPin, Loader2, AlertTriangle, Lock, Unlock } from "lucide-react";
import { useOffer } from "../OfferContext";
import { StepHeader } from "./KundendatenStep";
import { computeArbeitszeit, suggestDistance, secondsToHHMM } from "../arbeitszeit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ArbeitszeitStep() {
  const { payload, patchSection } = useOffer();
  const az = payload.Arbeitszeit;
  const [calcLoading, setCalcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Merge an input change, recompute the derived values, patch both at once.
  function update(patch: Record<string, any>) {
    const next = { ...az, ...patch };
    const d = computeArbeitszeit(next);
    patchSection("Arbeitszeit", { ...patch, ...d });
  }

  async function calcDistance() {
    setError(null);
    setCalcLoading(true);
    try {
      const r = await suggestDistance(payload.Kundendaten);
      update({ distanceKm: String(r.oneWayKm), travelTimeHHMM: secondsToHHMM(r.oneWaySeconds) });
    } catch (e: any) {
      setError(e?.message || "Entfernung konnte nicht berechnet werden");
    } finally {
      setCalcLoading(false);
    }
  }

  const hasAddress = Boolean(payload.Kundendaten.street && payload.Kundendaten.city);
  const locked = !!az.distanceLocked;
  const derived = computeArbeitszeit(az);

  // Auto-calc the distance the first time the step opens: address present, no
  // value yet, and not locked. Once computed it persists, so revisits don't refire.
  const autoRef = useRef(false);
  useEffect(() => {
    if (autoRef.current) return;
    autoRef.current = true;
    if (hasAddress && !az.distanceKm && !locked) void calcDistance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-8">
      <StepHeader title="Arbeitszeit" hint="Fahrstrecke aus der Adresse berechnen; Stunden werden zu Tagen verrechnet." />

      {/* Distance */}
      <Section title="Fahrstrecke">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Entfernung (einfach, km)" className="w-40">
            <Input inputMode="decimal" value={az.distanceKm} onChange={(e) => update({ distanceKm: e.target.value })} />
          </Field>
          <Field label="Fahrzeit (einfach, Std:Min)" className="w-40">
            <Input value={az.travelTimeHHMM} onChange={(e) => update({ travelTimeHHMM: e.target.value })} placeholder="0:45" />
          </Field>
          <Button type="button" variant="outline" onClick={calcDistance} disabled={!hasAddress || calcLoading || locked}>
            {calcLoading ? <Loader2 className="animate-spin" /> : <MapPin />} Aus Adresse berechnen
          </Button>
          <Button
            type="button"
            variant={locked ? "default" : "ghost"}
            onClick={() => patchSection("Arbeitszeit", { distanceLocked: !locked })}
            title={locked ? "Entfernung entsperren" : "Entfernung sperren (keine Neuberechnung)"}
          >
            {locked ? <Lock /> : <Unlock />} {locked ? "Gesperrt" : "Sperren"}
          </Button>
        </div>
        {!hasAddress && (
          <p className="text-xs text-muted-foreground">Straße & Ort auf der Kundendaten-Seite angeben, um die Strecke zu berechnen.</p>
        )}
        {locked && (
          <p className="text-xs text-muted-foreground">Entfernung gesperrt — wird beim erneuten Öffnen nicht neu berechnet.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Section>

      {/* Hours */}
      <Section title="Stunden">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Arbeitszeit (Std:Min)">
            <Input value={az.laborHoursHHMM} onChange={(e) => update({ laborHoursHHMM: e.target.value })} placeholder="8:00" />
          </Field>
          <Field label="Übernachtungen">
            <Input inputMode="numeric" value={az.uebernachten} onChange={(e) => update({ uebernachten: e.target.value })} placeholder="0" />
          </Field>
          <Field label="Reise-Zuschlag 2. Kraft">
            <Select
              value={String(az.travelSecondWorkerRate)}
              onValueChange={(v) => update({ travelSecondWorkerRate: Number(v) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 €/Std</SelectItem>
                <SelectItem value="35">35 €/Std</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Die Arbeitszeit-Empfehlung aus den Produkt-/Aufgaben-Auswahlen folgt, sobald die nächsten Seiten gebaut sind.
        </p>
      </Section>

      {/* Derived summary */}
      {derived.infeasible ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          Die einfache Fahrzeit ist zu lang — pro Tag bleibt keine Arbeitszeit übrig. Bitte Fahrzeit prüfen.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Arbeitstage" value={derived.workDays} />
          <Stat label="Reisetage" value={derived.travelDays} />
          <Stat label="Gesamtstunden" value={derived.totalHoursHHMM} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={"space-y-1.5 " + (className ?? "")}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
