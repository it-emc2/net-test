// Arbeitszeit (ADR 026, phase 4). Rebuilt: the way to the customer (distance, route suggestion,
// nights away; Alltagshilfe: travel zone), time on site, travel time with the second worker's
// rate, and the extra work of a Badewannentür. The stored fields are exactly today's
// (test/arbeitszeit.test.tsx compares with what today's UI stores for the same inputs).
// Still in today's UI: the cost overview and the automatic suggestion (it is built from the
// steps that follow).
import { useState } from "react";
import { useParams } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, Field, Input, Label, SelectField } from "../../../shared/ui/index.js";
import { LegacyLink, useOfferField, useOfferStore, useOfferType } from "../../offer/index.js";
import {
  EMPTY_EXTRA, NO_ADDRESS, TOO_LONG, ZONE_BUTTONS, addMinutes, derived, extraRows, fromRoute, fromSeconds, hoursText, leaveDuration,
  roundTripText, storedExtra, totalText, travelDaysText, travelTooLong, typeDuration, zoneText, type ExtraRow,
} from "./rules.js";

const AZ = "Arbeitszeit";
type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** change entries; everything that follows from them is brought up to date in the same change */
function write(fields: Fields) {
  const o = offerNow();
  useOfferStore.getState().patch(AZ as never, derived({ ...(o.Arbeitszeit ?? {}), ...fields }, { type: o.activeOffer, payer: o.Kundendaten?.payer, postalCode: o.Kundendaten?.postalCode }) as never);
}
/** typing a duration: digits become H:MM; deleting is left alone so the field can be emptied */
const typed = (before: string, raw: string) => (raw.length < before.length && before.startsWith(raw) ? raw : typeDuration(raw));

function Duration({ id, label, field, manual }: { id: string; label: string; field: "laborHoursHHMM" | "travelTimeHHMM"; manual?: boolean }) {
  const value = useOfferField<string>(AZ, field) ?? "";
  const set = (text: string) => write(manual ? { [field]: text, laborHoursSource: "manual" } : { [field]: text });
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        {/* the width is on a wrapper: the input's own w-full must not be overridden (see cn) */}
        <div className="w-28 shrink-0"><Input id={id} inputMode="numeric" autoComplete="off" placeholder="HH:MM" value={value} onChange={(e) => set(typed(value, e.target.value))} onBlur={(e) => { const v = leaveDuration(e.target.value); if (v !== value) set(v); }} /></div>
        <div className="flex gap-2" role="group" aria-label={`${label}: Schnellwahl`}>
          {[-15, -5, 5, 15].map((d) => (
            <Button key={d} variant="outline" className="px-3" aria-label={`${label} ${d > 0 ? "plus" : "minus"} ${Math.abs(d)} Minuten`} onClick={() => set(addMinutes(value, d))}>{d > 0 ? `+${d}m` : `−${-d}m`}</Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Way() {
  const type = useOfferType();
  const distance = useOfferField<string>(AZ, "distanceKm") ?? "";
  const nights = useOfferField<number>(AZ, "uebernachten") ?? 0;
  const travelDays = useOfferField<number>(AZ, "travelDays") ?? 0;
  const workDays = useOfferField<number>(AZ, "workDays") ?? 0;
  const travelTime = useOfferField<string>(AZ, "travelTimeHHMM") ?? "";
  const zone = useOfferField<number>(AZ, "ahTravelZone") ?? 0;
  const pressed = useOfferStore((s) => s.scratch.zonePressed as number | undefined);
  const [hint, setHint] = useState<{ text: string; basis?: string }>({ text: "" });
  const ah = type === "ah";
  const suggest = async () => {
    const kd = offerNow().Kundendaten ?? {};
    const address = { street: String(kd.street ?? "").trim(), city: String(kd.city ?? "").trim(), postalCode: String(kd.postalCode ?? "").trim(), state: kd.state ?? "", country: kd.country ?? "" };
    if (!address.street && !address.city && !address.postalCode) { setHint({ text: NO_ADDRESS }); return; }
    setHint({ text: "Berechne Routenvorschlag …" });
    try {
      const route = await call("suggestDistance", { body: { Kundendaten: address } });
      const found = route.ok ? fromRoute(route) : null;
      if (!found) { setHint({ text: route.ok ? "Keine sinnvolle Strecke ermittelt." : "Routenvorschlag fehlgeschlagen." }); return; }
      write(found.fields);
      setHint({ text: found.text, basis: found.basis });
    } catch (err) {
      setHint({ text: err instanceof ApiFailure && err.status ? err.message : "Routenvorschlag fehlgeschlagen (Netzwerkfehler)." });
    }
  };
  const view = { distanceKm: distance, travelDays, workDays, uebernachten: nights };
  return (
    <Card aria-labelledby="az-way">
      <CardTitle id="az-way">Anfahrt</CardTitle>
      <div><Button variant="secondary" onClick={() => { void suggest(); }}>Strecke aus Adresse vorschlagen</Button></div>
      {hint.text ? <p className="m-0 text-muted-foreground" role="status" data-testid="az-routing">{hint.text}{hint.basis ? <><br /><span className="text-[0.9rem]">{hint.basis}</span></> : null}</p> : null}
      {ah ? (
        <div className="grid gap-2">
          <p className="m-0 text-[0.95rem] text-muted-foreground">Funktioniert nicht? Reisezone manuell wählen (setzt die Reisezeit, Hinfahrt):</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Reisezone manuell wählen">
            {ZONE_BUTTONS.map((min, i) => (
              <Button key={min} id={`az-zone-${min}`} variant="outline" aria-pressed={pressed === min && travelTime === fromSeconds(min * 60)} className="aria-pressed:border-primary aria-pressed:bg-accent-weak"
                onClick={() => { useOfferStore.getState().remember("zonePressed", min); write({ travelTimeHHMM: fromSeconds(min * 60) }); }}>{`Zone ${i + 1} · ${min} Min`}</Button>
            ))}
          </div>
        </div>
      ) : null}
      <Field
        label="Wie viele Kilometer ist der Kunde von uns entfernt?" id="az-distance" type="number" min={0} step={0.1} inputMode="decimal" placeholder="z. B. 25 oder 25,5" required
        value={distance} onChange={(e) => write({ distanceKm: e.target.value.trim() })}
        hint="Kilometerpauschale, Hin- und Rückfahrt wird automatisch kalkuliert. Bitte nur die einfache Strecke (Hin-Fahrt) eintragen."
      />
      <p className="m-0" aria-live="polite"><strong data-testid="az-roundtrip">{roundTripText(view)}</strong><br /><span className="text-muted-foreground" data-testid="az-traveldays">{travelDaysText(view)}</span></p>
      {ah ? (
        <div className="rounded-lg border-2 border-border p-3">
          <p className="m-0">Reisezone (AH): <strong data-testid="az-zone">{zoneText(zone)}</strong></p>
          <p className="m-0 text-[0.9rem] text-muted-foreground">Wird aus der Reisezeit (Hinfahrt) berechnet und fließt in die AH-Kosten ein. Rückfahrt wird nicht berechnet.</p>
        </div>
      ) : (
        <Field label="Übernachten (Tage ohne Rückfahrt)" id="az-nights" type="number" min={0} step={1} inputMode="numeric" className="max-w-xs" value={String(nights)} onChange={(e) => write({ uebernachten: Number(e.target.value) || 0 })} />
      )}
    </Card>
  );
}

function OnSite() {
  const total = useOfferField<number>(AZ, "totalHoursNumeric") ?? 0;
  const workDays = useOfferField<number>(AZ, "workDays") ?? 0;
  const labor = useOfferField<string>(AZ, "laborHoursHHMM") ?? "";
  const travel = useOfferField<string>(AZ, "travelTimeHHMM") ?? "";
  const suggested = useOfferField<number>(AZ, "autoSuggestedHoursNumeric") ?? 0;
  return (
    <Card aria-labelledby="az-onsite">
      <CardTitle id="az-onsite">Arbeitszeit</CardTitle>
      <Duration id="az-labor" label="Dauer vor Ort (HH:MM)" field="laborHoursHHMM" manual />
      {suggested > 0 ? <p className="m-0 text-muted-foreground">Automatischer Vorschlag: {hoursText(suggested)}</p> : null}
      <p className="m-0" aria-live="polite" data-testid="az-total">
        {totalText({ totalHoursNumeric: total, workDays })}
        {travelTooLong({ laborHoursHHMM: labor, travelTimeHHMM: travel }) ? <span className="font-semibold text-destructive"> {TOO_LONG}</span> : null}
      </p>
    </Card>
  );
}

function Travel() {
  const rate = useOfferField<number>(AZ, "travelSecondWorkerRate") ?? 25; // an old offer without the value is priced at 25 €/h
  return (
    <Card aria-labelledby="az-travel-title">
      <CardTitle id="az-travel-title">Reisezeit</CardTitle>
      <div className="grid gap-3">
        <Duration id="az-travel" label="Reisezeit, nur Hin-Fahrt (HH:MM)" field="travelTimeHHMM" />
        <div className="max-w-sm"><SelectField label="2. Mitarbeiter bei Reisezeit" id="az-second" value={String(rate === 35 ? 35 : 25)} onChange={(v) => write({ travelSecondWorkerRate: Number(v) })} options={[{ value: "25", label: "25 €/h (alt)" }, { value: "35", label: "35 €/h (neu / Standard)" }]} /></div>
      </div>
      <details>
        <summary className="cursor-pointer text-muted-foreground">Hinweis anzeigen</summary>
        <p className="mb-0 mt-2 text-[0.95rem]"><strong>Hinweis für BU:</strong> Reisezeit wird separat gerechnet: Fahrer = voller Stundensatz, 2. Mitarbeiter = auswählbar 25 €/h oder 35 €/h. Für neue Angebote ist 35 €/h der Standard. Für alte Angebote bleibt ohne gespeicherten Wert automatisch 25 €/h erhalten.</p>
      </details>
    </Card>
  );
}

/** Badewannentür: rows of extra work (duration and task). */
function ExtraWork() {
  const stored = useOfferField(AZ, "extraTasks");
  const remembered = useOfferStore((s) => s.scratch.extraWorkRows);
  const rows = extraRows({ extraTasks: stored }, remembered);
  const set = (next: ExtraRow[]) => { useOfferStore.getState().remember("extraWorkRows", next); write(storedExtra(next)); };
  const edit = (i: number, change: Partial<ExtraRow>) => set(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <Card aria-labelledby="az-extra">
      <CardTitle id="az-extra">Extra Arbeitszeit</CardTitle>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`az-extra-d-${i}`}>Dauer (HH:MM)</Label>
            <Input id={`az-extra-d-${i}`} aria-label={`Dauer ${i + 1}`} inputMode="numeric" autoComplete="off" placeholder="z. B. 01:30" value={r.duration} onChange={(e) => edit(i, { duration: typed(r.duration, e.target.value) })} onBlur={(e) => { const v = leaveDuration(e.target.value); if (v !== r.duration) edit(i, { duration: v }); }} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`az-extra-t-${i}`}>Aufgabe / Tätigkeit</Label>
            <Input id={`az-extra-t-${i}`} aria-label={`Aufgabe ${i + 1}`} autoComplete="off" placeholder="z. B. Zusätzliche Anpassungsarbeiten" value={r.task} onChange={(e) => edit(i, { task: e.target.value })} />
          </div>
          <Button variant="ghost" size="icon" aria-label={`Extra-Arbeitszeit ${i + 1} entfernen`} onClick={() => set(rows.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
        </div>
      ))}
      <div><Button variant="outline" onClick={() => set([...rows, EMPTY_EXTRA])}><Plus aria-hidden />Extra-Arbeitszeit hinzufügen</Button></div>
    </Card>
  );
}

export function Arbeitszeit() {
  const type = useOfferType();
  const { dealId = "" } = useParams();
  return (
    <>
      <Way />
      {type !== "ah" ? <><OnSite /><Travel /></> : null}
      {type === "bwt" ? <ExtraWork /> : null}
      {type !== "ah" ? (
        <Card aria-labelledby="az-more">
          <CardTitle id="az-more">Kostenübersicht und automatischer Vorschlag</CardTitle>
          <p className="m-0">Die Kostenübersicht der Zeiten und der automatische Arbeitszeit-Vorschlag werden noch in der bisherigen Ansicht angezeigt. Ihre Eingaben werden mitgenommen.</p>
          <LegacyLink dealId={dealId} step="Arbeitszeit">Arbeitszeit in der bisherigen Ansicht</LegacyLink>
        </Card>
      ) : null}
    </>
  );
}
