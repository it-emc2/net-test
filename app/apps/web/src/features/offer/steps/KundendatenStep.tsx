import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { CustomerDetail } from "@emc2/shared";
import { useOffer } from "../OfferContext";
import { CustomerSearch } from "../CustomerSearch";
import {
  SUBSIDY_OPTIONS,
  SALUTATIONS,
  PFLEGEGRADE,
  type Payer,
  emptyPartner,
  deriveBudgetOption,
  oppositeSalutation,
} from "../payload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function KundendatenStep() {
  const { payload, patchSection, setSection } = useOffer();
  const k = payload.Kundendaten;
  const set = (patch: Record<string, any>) => patchSection("Kundendaten", patch);
  const isKK = k.payer === "Kassenkunde";

  // Wohnumfeld: repeatable Wofür/Betrag rows. `amount` (total) and `done` are
  // kept in sync for the pricing engine (subsidy reduction).
  const w = k.wohnumfeld;
  function patchWohnumfeld(patch: Partial<typeof w>) {
    const next = { ...w, ...patch };
    const total = (next.entries || []).reduce(
      (s, e) => s + (parseFloat(String(e.amount).replace(",", ".")) || 0),
      0,
    );
    next.amount = total ? String(total) : "";
    next.done = next.status === "ja";
    setSection("Kundendaten", { ...k, wohnumfeld: next });
  }
  const setWohnStatus = (status: string) =>
    patchWohnumfeld({
      status,
      entries: status === "ja" && !(w.entries || []).length ? [{ purpose: "", amount: "" }] : w.entries,
    });
  const addWohnEntry = () => patchWohnumfeld({ entries: [...(w.entries || []), { purpose: "", amount: "" }] });
  const updateWohnEntry = (i: number, patch: Partial<{ purpose: string; amount: string }>) =>
    patchWohnumfeld({ entries: (w.entries || []).map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });
  const removeWohnEntry = (i: number) =>
    patchWohnumfeld({ entries: (w.entries || []).filter((_, idx) => idx !== i) });

  function addPartner() {
    const partner = {
      ...emptyPartner(),
      salutation: oppositeSalutation(k.salutation),
      lastName: k.lastName,
      krankenkasse: k.krankenkasse,
      pflegegrad: k.pflegegrad,
    };
    set(k.budgetOptionManuallySet ? { partner } : { partner, budgetOption: deriveBudgetOption({ ...k, partner }) });
  }

  function removePartner() {
    const next = { ...k, partner: undefined };
    set(k.budgetOptionManuallySet ? { partner: undefined } : { partner: undefined, budgetOption: deriveBudgetOption(next) });
  }

  function setPartner(patch: Partial<NonNullable<typeof k.partner>>) {
    const partner = { ...k.partner!, ...patch };
    set(k.budgetOptionManuallySet ? { partner } : { partner, budgetOption: deriveBudgetOption({ ...k, partner }) });
  }

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
                {SALUTATIONS.map((s) => (
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

        {isKK && (
          k.partner ? (
            <div className="space-y-4 rounded-lg border border-dashed border-primary/40 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Partner / Ehepartner</p>
                <button type="button" onClick={removePartner} className="text-xs text-muted-foreground hover:text-destructive">
                  ✕ entfernen
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr_1fr]">
                <Field label="Anrede">
                  <Select value={k.partner.salutation || undefined} onValueChange={(v) => setPartner({ salutation: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {SALUTATIONS.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Vorname"><Input value={k.partner.firstName} onChange={(e) => setPartner({ firstName: e.target.value })} /></Field>
                <Field label="Nachname"><Input value={k.partner.lastName} onChange={(e) => setPartner({ lastName: e.target.value })} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Krankenkasse"><Input value={k.partner.krankenkasse} onChange={(e) => setPartner({ krankenkasse: e.target.value })} /></Field>
                <Field label="Pflegegrad">
                  <Select value={k.partner.pflegegrad || undefined} onValueChange={(v) => setPartner({ pflegegrad: v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {PFLEGEGRADE.filter(Boolean).map((g) => (
                        <SelectItem key={g} value={g}>Pflegegrad {g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          ) : (
            <button type="button" onClick={addPartner} className="text-sm font-medium text-primary hover:underline">
              + Partner/Ehepartner hinzufügen
            </button>
          )
        )}
      </Section>

      {/* Address */}
      <Section title="Adresse">
        <Field label="Straße & Nr."><Input value={k.street} onChange={(e) => set({ street: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <Field label="PLZ"><Input value={k.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></Field>
          <Field label="Ort"><Input value={k.city} onChange={(e) => set({ city: e.target.value })} /></Field>
        </div>
      </Section>

      {/* Billing / payer */}
      <Section title="Abrechnung">
        <Field label="Zahler">
          <div className="flex gap-2">
            <PayerButton current={k.payer} value="Selbstzahler" label="Selbstzahler" onSelect={(v) => set({ payer: v })} />
            <PayerButton current={k.payer} value="Kassenkunde" label="Kassenkunde" onSelect={(v) => set({ payer: v })} />
          </div>
        </Field>

        {/* Kassenkunde-only conditional block */}
        {isKK && (
          <div className="mt-2 space-y-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Kassenkunde-Angaben</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Zuschuss-Option">
                <Select
                  value={k.budgetOption}
                  onValueChange={(v) => set({ budgetOption: v, budgetOptionManuallySet: true })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBSIDY_OPTIONS.map((o) => (
                      <SelectItem key={o.value || "none"} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pflegegrad">
                <Select value={k.pflegegrad || undefined} onValueChange={(v) => set({ pflegegrad: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {PFLEGEGRADE.filter(Boolean).map((g) => (
                      <SelectItem key={g} value={g}>Pflegegrad {g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Krankenkasse"><Input value={k.krankenkasse} onChange={(e) => set({ krankenkasse: e.target.value })} /></Field>
              <Field label="Zuzahlung (€)"><Input inputMode="decimal" value={k.zuzahlung} onChange={(e) => set({ zuzahlung: e.target.value })} /></Field>
            </div>

            {/* Wohnumfeldverbessernde Maßnahmen — repeatable Wofür/Betrag rows */}
            <Field label="Wurden wohnumfeldverbessernde Maßnahmen schon mal durchgeführt?">
              <ChoiceGroup
                value={w.status}
                onChange={setWohnStatus}
                options={[
                  { value: "ja", label: "Ja" },
                  { value: "nein", label: "Nein" },
                  { value: "unbekannt", label: "Unbekannt" },
                ]}
              />
            </Field>
            {w.status === "ja" && (
              <div className="space-y-2">
                {(w.entries || []).map((e, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1 space-y-1.5">
                      <Label>Wofür?</Label>
                      <Input
                        value={e.purpose}
                        onChange={(ev) => updateWohnEntry(i, { purpose: ev.target.value })}
                        placeholder="z. B. Treppenlift, Türverbreiterung"
                      />
                    </div>
                    <div className="w-32 space-y-1.5">
                      <Label>Betrag (€)</Label>
                      <Input inputMode="decimal" value={e.amount} onChange={(ev) => updateWohnEntry(i, { amount: ev.target.value })} />
                    </div>
                    {(w.entries || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeWohnEntry(i)}
                        aria-label="Entfernen"
                        className="mb-1.5 flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addWohnEntry} className="text-sm font-medium text-primary hover:underline">
                  + Weitere Maßnahme hinzufügen
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ansprechpartner (EmC²)"><Input value={k.emc2_contact} onChange={(e) => set({ emc2_contact: e.target.value })} /></Field>
        </div>
      </Section>

      {/* Objekt- & Förderinformationen */}
      <CollapsibleSection title="Weitere Objekt- und Förderinformationen">
        <Field label="Antrag auf Zuschuss bei Pflegekasse gestellt?">
          <ChoiceGroup
            value={k.pflegekasseAntrag}
            onChange={(v) => set({ pflegekasseAntrag: v })}
            options={[
              { value: "ja", label: "Ja" },
              { value: "nein", label: "Nein" },
            ]}
          />
        </Field>
        {k.pflegekasseAntrag === "ja" && (
          <Field label="Genehmigung von Pflegekasse ist vorhanden?">
            <ChoiceGroup
              value={k.pflegekasseGenehmigung}
              onChange={(v) => set({ pflegekasseGenehmigung: v })}
              options={[
                { value: "ja", label: "Ja" },
                { value: "nein", label: "Nein" },
              ]}
            />
          </Field>
        )}
        {k.pflegekasseAntrag === "nein" && (
          <Field label="Darf EmC² für Sie diesen Antrag stellen?">
            <ChoiceGroup
              value={k.pflegekasseEmc2Antrag}
              onChange={(v) => set({ pflegekasseEmc2Antrag: v })}
              options={[
                { value: "ja", label: "Ja" },
                { value: "nein", label: "Nein" },
              ]}
            />
          </Field>
        )}

        <Field label="Genehmigung des Vermieters liegt vor?">
          <ChoiceGroup
            value={k.vermieterGenehmigung}
            onChange={(v) => set({ vermieterGenehmigung: v })}
            options={[
              { value: "ja", label: "Ja" },
              { value: "nein", label: "Nein" },
              { value: "ausstehend", label: "Noch ausstehend" },
            ]}
          />
        </Field>

        <Field label="Angabe zur Wohnsituation">
          <ChoiceGroup
            value={k.wohnsituation}
            onChange={(v) => set({ wohnsituation: v })}
            options={[
              { value: "Eigentum", label: "Eigentum" },
              { value: "Miete", label: "Miete" },
            ]}
          />
        </Field>

        <Field label="Parken vor dem Objekt möglich?">
          <ChoiceGroup
            value={k.parkenMoeglich}
            onChange={(v) => set({ parkenMoeglich: v })}
            options={[
              { value: "ja", label: "Ja" },
              { value: "nein", label: "Nein" },
            ]}
          />
        </Field>
        <Field label="Weitere Angaben zur Parksituation">
          <Input
            value={k.parkDetails}
            onChange={(e) => set({ parkDetails: e.target.value })}
            placeholder="z. B. Hinterhof, Halteverbot, Fußweg zum Eingang"
          />
        </Field>

      </CollapsibleSection>

      {/* Notizen — always visible, outside the collapsible section */}
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

export function StepHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header>
      <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </header>
  );
}

export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-4">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </section>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ChoiceGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        // Re-click clears the choice (so "unanswered" stays possible).
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(active ? "" : o.value)}
            className={cn(
              "rounded-md border px-4 py-2 text-sm font-medium transition-colors",
              active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PayerButton({
  current,
  value,
  label,
  onSelect,
}: {
  current: Payer;
  value: Payer;
  label: string;
  onSelect: (v: Payer) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={cn(
        "flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
