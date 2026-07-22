import type { CustomerDetail } from "@emc2/shared";
import { useAhOffer } from "./AhOfferContext";
import { AH_SALUTATIONS, AH_PFLEGEGRADE } from "./ahPayload";
import { CustomerSearch } from "../CustomerSearch";
import {
  StepHeader,
  Section,
  CollapsibleSection,
  Field,
  ChoiceGroup,
  PayerButton,
} from "../steps/KundendatenStep";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function AhKundendatenStep() {
  const { payload, patchSection } = useAhOffer();
  const k = payload.Kundendaten;
  const set = (patch: Record<string, any>) => patchSection("Kundendaten", patch);
  const isKK = k.payer === "Kassenkunde";

  function prefillFromCustomer(c: CustomerDetail) {
    set({
      salutation: c.salutation || "",
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      email: c.email || "",
      phone: c.phone || "",
      street: c.street || "",
      city: c.city || "",
      postalCode: c.postalCode || "",
      customerNumber: c.customerNumber || "",
      bitrixContactId: c.bitrixContactId || "",
    });
  }

  return (
    <div className="space-y-8">
      <StepHeader title="Kundendaten" hint="Bestandskunde suchen oder neu erfassen." />

      <CustomerSearch onSelect={prefillFromCustomer} />

      {/* Contact */}
      <Section title="Kontakt">
        <Field label="Neukunde oder Bestandskunde? *">
          <ChoiceGroup
            value={k.customerType}
            onChange={(v) => set({ customerType: v })}
            options={[
              { value: "neu", label: "Neu" },
              { value: "bestand", label: "Bestandskunde" },
            ]}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
          <Field label="Anrede">
            <Select value={k.salutation || undefined} onValueChange={(v) => set({ salutation: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {AH_SALUTATIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Vorname"><Input value={k.firstName} onChange={(e) => set({ firstName: e.target.value })} /></Field>
          <Field label="Nachname"><Input value={k.lastName} onChange={(e) => set({ lastName: e.target.value })} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-Mail"><Input type="email" value={k.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Telefon"><Input value={k.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        </div>

        <Field label="Ansprechpartner vorhanden?">
          <ChoiceGroup
            value={k.hasContactPerson ? "ja" : "nein"}
            onChange={(v) => set({ hasContactPerson: v === "ja" })}
            options={[
              { value: "ja", label: "Ja" },
              { value: "nein", label: "Nein" },
            ]}
          />
        </Field>
        {k.hasContactPerson && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name Ansprechpartner"><Input value={k.contactPersonName} onChange={(e) => set({ contactPersonName: e.target.value })} /></Field>
            <Field label="Telefon Ansprechpartner"><Input value={k.contactPersonPhone} onChange={(e) => set({ contactPersonPhone: e.target.value })} /></Field>
          </div>
        )}
      </Section>

      {/* Address */}
      <Section title="Adresse">
        <Field label="Straße & Nr."><Input value={k.street} onChange={(e) => set({ street: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="PLZ"><Input value={k.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></Field>
          <Field label="Ort"><Input value={k.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        </div>
        <Field label="Abweichender Einsatzort">
          <Input
            value={k.deployment}
            onChange={(e) => set({ deployment: e.target.value })}
            placeholder="nur falls Leistung nicht an der Wohnadresse erbracht wird"
          />
        </Field>
      </Section>

      {/* Billing / payer */}
      <Section title="Abrechnung">
        <Field label="Zahler">
          <div className="flex gap-2">
            <PayerButton current={k.payer} value="Selbstzahler" label="Selbstzahler" onSelect={(v) => set({ payer: v })} />
            <PayerButton current={k.payer} value="Kassenkunde" label="Kassenkunde" onSelect={(v) => set({ payer: v })} />
          </div>
        </Field>

        {/* Kassenkunde: only the fields AH needs — no Wohnumfeld/subsidy (BU-only). */}
        {isKK && (
          <div className="mt-2 grid gap-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-4 sm:grid-cols-2">
            <Field label="Krankenkasse"><Input value={k.krankenkasse} onChange={(e) => set({ krankenkasse: e.target.value })} /></Field>
            <Field label="Pflegegrad">
              <Select value={k.pflegegrad || undefined} onValueChange={(v) => set({ pflegegrad: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {AH_PFLEGEGRADE.map((g) => (
                    <SelectItem key={g} value={g}>{g === "beantragt" ? "Beantragt" : `Pflegegrad ${g}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <Field label="Ansprechpartner (EmC²)"><Input value={k.emc2_contact} onChange={(e) => set({ emc2_contact: e.target.value })} /></Field>
      </Section>

      {/* AH-only: Vorbereitung vor dem Termin */}
      <Section title="Vorbereitung vor dem Termin">
        <div className="grid gap-2 sm:grid-cols-2">
          <CheckField label="Termin bestätigt" checked={k.prep_terminBestaetigt} onChange={(v) => set({ prep_terminBestaetigt: v })} />
          <CheckField label="Erstberatungsbogen" checked={k.prep_erstberatungsbogen} onChange={(v) => set({ prep_erstberatungsbogen: v })} />
          <CheckField label="Visitenkarten" checked={k.prep_visitenkarten} onChange={(v) => set({ prep_visitenkarten: v })} />
          <CheckField label="Leistungsübersicht" checked={k.prep_leistungsuebersicht} onChange={(v) => set({ prep_leistungsuebersicht: v })} />
          <CheckField label="Mustervertrag" checked={k.prep_mustervertrag} onChange={(v) => set({ prep_mustervertrag: v })} />
        </div>
      </Section>

      {/* AH-only: Besondere Hinweise */}
      <CollapsibleSection title="Besondere Hinweise">
        <Field label="Mobilität"><Input value={k.ah_mobilitaet} onChange={(e) => set({ ah_mobilitaet: e.target.value })} placeholder="z. B. Rollator, Rollstuhl, gehfähig" /></Field>
        <Field label="Allergien"><Input value={k.ah_allergien} onChange={(e) => set({ ah_allergien: e.target.value })} /></Field>
        <Field label="Demenz"><Input value={k.ah_demenz} onChange={(e) => set({ ah_demenz: e.target.value })} /></Field>
        <Field label="Sprache"><Input value={k.ah_sprache} onChange={(e) => set({ ah_sprache: e.target.value })} /></Field>
        <Field label="Sonstiges"><Input value={k.ah_sonstiges} onChange={(e) => set({ ah_sonstiges: e.target.value })} /></Field>
      </CollapsibleSection>

      {/* AH-only: Lebenssituation */}
      <Section title="Lebenssituation">
        <Field label="Lebt die Person allein?">
          <ChoiceGroup value={k.ah_alleinLebend} onChange={(v) => set({ ah_alleinLebend: v })} options={JA_NEIN} />
        </Field>
        <Field label="Haustiere vorhanden?">
          <ChoiceGroup value={k.ah_haustiere} onChange={(v) => set({ ah_haustiere: v })} options={JA_NEIN} />
        </Field>
        <Field label="Schlüssel für die Wohnung vorhanden?">
          <ChoiceGroup
            value={k.ah_schluessel}
            onChange={(v) => set({ ah_schluessel: v })}
            options={[
              { value: "ja", label: "Ja" },
              { value: "nein", label: "Nein" },
              { value: "klaeren", label: "Schlüsselübergabe klären" },
            ]}
          />
        </Field>
        <Field label="Bestehende Hilfe?">
          <ChoiceGroup
            value={k.ah_bestehendeHilfe}
            onChange={(v) => set({ ah_bestehendeHilfe: v })}
            options={[
              { value: "pflegedienst", label: "Pflegedienst" },
              { value: "angehoerige", label: "Angehörige" },
              { value: "nachbarn", label: "Nachbarn" },
              { value: "keine", label: "Keine" },
            ]}
          />
        </Field>
      </Section>

      {/* Parken */}
      <Section title="Parken">
        <Field label="Parken vor dem Objekt möglich?">
          <ChoiceGroup value={k.parkenMoeglich} onChange={(v) => set({ parkenMoeglich: v })} options={JA_NEIN} />
        </Field>
        <Field label="Weitere Angaben zur Parksituation">
          <Input value={k.parkDetails} onChange={(e) => set({ parkDetails: e.target.value })} placeholder="z. B. Hinterhof, Halteverbot, Fußweg zum Eingang" />
        </Field>
      </Section>

      {/* Notizen */}
      <Section title="Notizen">
        <textarea
          value={k.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={4}
          placeholder="Freie Notizen …"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </Section>
    </div>
  );
}

const JA_NEIN = [
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
];

function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn(
      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
      checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
    )}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-input accent-[hsl(var(--primary))]"
      />
      {label}
    </label>
  );
}
