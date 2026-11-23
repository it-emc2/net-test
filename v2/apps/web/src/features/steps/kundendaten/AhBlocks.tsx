// The Alltagshilfe-only blocks of Kundendaten (UX-CHANGES U-052): „Vorbereitung vor dem Termin“,
// „2 Personen mit Pflegegrad im Haushalt“, „Besondere Hinweise“, „Lebenssituation“. Stored fields
// exactly today's (rules and the one deliberate difference: ah.ts). Shown for offer type `ah` only.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useAhConfig, useOfferField, useOfferStore } from "../../offer/index.js";
import { Card, CardTitle, Field, cn } from "../../../shared/ui/index.js";
import { ChipGroup, TickRow } from "../../../shared/ui/controls.js";
import { useFollowUp } from "./follow-ups.js";
import {
  HINTS, LIFE, P2_LEVELS, PREP, PREP_TIP, chooseHint, hasSecondPersonData, hintChoice, hintDetails, hintDetailsOpen, isOn, prepDone, togglePrep, toggleTwoPersons, typeHint, type HintChoice,
} from "./ah.js";

const KD = "Kundendaten";
type Fields = Record<string, unknown>;
const kdNow = (): Fields => (useOfferStore.getState().offer as Record<string, any> | null)?.Kundendaten ?? {};
const setKd = (fields: Fields) => useOfferStore.getState().patch(KD as never, fields as never);
const opts = (list: readonly string[]) => list.map((v) => ({ value: v, label: v }));
const useKd = () => useOfferStore((s) => ((s.offer as Record<string, any> | null)?.Kundendaten ?? {}) as Fields);

/** „Vorbereitung vor dem Termin“: one row „n von 5 erledigt“, opened on tap (internal only). */
export function AhPreparation() {
  const [open, setOpen] = useState(false);
  const kd = useKd();
  const done = prepDone(kd);
  return (
    <Card data-testid="ah-kd-prep" className="gap-2 py-2">
      <button type="button" aria-expanded={open} aria-controls="ah-kd-prep-list" onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-transparent px-1 text-left text-[1.05rem] font-semibold text-foreground">
        <span className="flex flex-wrap items-center gap-2">
          <span>Vorbereitung · {done} von {PREP.length} erledigt</span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold text-muted-foreground">nur intern</span>
        </span>
        <ChevronDown aria-hidden className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id="ah-kd-prep-list" className="grid gap-2">
          <p className="sr-only">Vorbereitung vor dem Termin</p>
          <div className="grid gap-x-3 min-[720px]:grid-cols-2">
            {PREP.map(([k, label]) => <TickRow key={k} id={`ah-kd-${k}`} checked={kd[k] === "Ja"} onChange={(on) => setKd(togglePrep(k, on))}>{label}</TickRow>)}
          </div>
          <p className="m-0 rounded-lg border-l-4 border-warning-strong bg-warning-weak px-3 py-2 text-[0.95rem]" data-testid="ah-kd-prep-tip"><strong>Tipp:</strong> {PREP_TIP}</p>
        </div>
      ) : null}
    </Card>
  );
}

/** „2 Personen mit Pflegegrad im Haushalt“: the tick; the second person's fields while ticked — and
 *  while they hold entries, until the tick is answered on this page (B3, U-047). */
export function AhTwoPersons() {
  const kd = useKd();
  const cfg = useAhConfig();
  const on = isOn(kd.ahZweiPersonen);
  const [show, answered] = useFollowUp(on, hasSecondPersonData(kd));
  const eb = cfg.entlastungsbetragMonat;
  const euro = (n: number) => `${n.toLocaleString("de-DE")} €`;
  return (
    <Card aria-labelledby="ah-kd-two" data-testid="ah-kd-two">
      <CardTitle id="ah-kd-two">2 Personen mit Pflegegrad</CardTitle>
      <TickRow id="ah-kd-ahZweiPersonen" checked={on} onChange={(v) => { answered(); setKd(toggleTwoPersons(kdNow(), v)); }}
        suffix={<span data-part="sub" className="block">Entlastungsbetrag 2 × {euro(eb)}/Monat = {euro(eb * 2)}/Monat</span>}>
        <span className="font-semibold">2 Personen mit Pflegegrad im Haushalt</span>
      </TickRow>
      {show ? (
        <fieldset className="m-0 grid min-w-0 gap-3 rounded-lg border-2 border-border p-3" data-testid="ah-kd-p2">
          <legend className="px-1 font-bold">2. Person</legend>
          <ChipGroup legend="Anrede" name="ah-kd-p2Salutation" options={opts(["Frau", "Herr"])} value={String(kd.p2Salutation ?? "")} onChange={(v) => setKd({ p2Salutation: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vorname" id={`${KD}-p2FirstName`} name="p2FirstName" autoComplete="off" value={String(kd.p2FirstName ?? "")} onChange={(e) => setKd({ p2FirstName: e.target.value })} />
            <Field label="Nachname" id={`${KD}-p2LastName`} name="p2LastName" autoComplete="off" value={String(kd.p2LastName ?? "")} onChange={(e) => setKd({ p2LastName: e.target.value })} />
          </div>
          <ChipGroup legend="Pflegegrad" name="ah-kd-p2Pflegegrad" options={opts(P2_LEVELS)} value={String(kd.p2Pflegegrad ?? "")} onChange={(v) => setKd({ p2Pflegegrad: v })} />
        </fieldset>
      ) : null}
    </Card>
  );
}

function HintQuestion({ field, label }: { field: string; label: string }) {
  const choice = useOfferStore((s) => hintChoice(((s.offer as Record<string, any> | null)?.Kundendaten ?? {}) as Fields, field));
  const details = useOfferStore((s) => hintDetails(((s.offer as Record<string, any> | null)?.Kundendaten ?? {}) as Fields, field));
  // details hidden by „Nein“ are kept for this page visit (not stored) and come back with „Ja“ / „Sonstiges“
  const pick = (v: HintChoice) => {
    const st = useOfferStore.getState();
    const kept = (st.scratch.ahHintDetails as Record<string, string> | undefined) ?? {};
    const r = chooseHint(kdNow(), field, v, kept[field] ?? "");
    st.remember("ahHintDetails", { ...kept, [field]: r.kept });
    setKd(r.changes);
  };
  return (
    <div className="grid gap-2" data-testid={`ah-kd-${field}`}>
      <ChipGroup legend={label} name={`ah-kd-${field}_choice`} options={opts(["Ja", "Nein", "Sonstiges"])} value={choice} onChange={(v) => pick(v as HintChoice)} />
      {hintDetailsOpen(choice) ? (
        <Field label={`Details zu „${label}“`} id={`${KD}-${field}`} name={field} placeholder="Details eintragen" autoComplete="off"
          value={details} onChange={(e) => setKd(typeHint(kdNow(), field, e.target.value))} />
      ) : null}
    </div>
  );
}

/** „Besondere Hinweise“: four questions Ja / Nein / Sonstiges with details, and the free text. */
export function AhHints() {
  const other = useOfferField<string>(KD, "ah_sonstiges") ?? "";
  return (
    <Card aria-labelledby="ah-kd-hints" data-testid="ah-kd-hints">
      <CardTitle id="ah-kd-hints">Besondere Hinweise</CardTitle>
      {HINTS.map(([field, label]) => <HintQuestion key={field} field={field} label={label} />)}
      <Field label="Sonstiges (Wünsche, Abneigungen, Gewohnheiten)" id={`${KD}-ah_sonstiges`} name="ah_sonstiges" autoComplete="off" value={other} onChange={(e) => setKd({ ah_sonstiges: e.target.value })} />
    </Card>
  );
}

/** „Lebenssituation“: four questions with today's answers. */
export function AhLiving() {
  const kd = useKd();
  return (
    <Card aria-labelledby="ah-kd-living" data-testid="ah-kd-living">
      <CardTitle id="ah-kd-living">Lebenssituation</CardTitle>
      {LIFE.map(([field, label, answers]) => (
        <ChipGroup key={field} legend={label} name={`ah-kd-${field}`} options={opts(answers)} value={String(kd[field] ?? "")} onChange={(v) => setKd({ [field]: v })} />
      ))}
    </Card>
  );
}
