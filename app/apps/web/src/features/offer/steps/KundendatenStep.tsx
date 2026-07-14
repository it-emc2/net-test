import { type ReactNode } from "react";
import type { CustomerDetail } from "@emc2/shared";
import { useOffer } from "../OfferContext";
import { CustomerSearch } from "../CustomerSearch";
import { SUBSIDY_OPTIONS, SALUTATIONS, PFLEGEGRADE, type Payer } from "../payload";
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ansprechpartner (EmC²)"><Input value={k.emc2_contact} onChange={(e) => set({ emc2_contact: e.target.value })} /></Field>
        </div>

        {/* Kassenkunde-only conditional block */}
        {isKK && (
          <div className="mt-2 space-y-4 rounded-lg border border-primary/30 bg-primary/[0.03] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Kassenkunde-Angaben</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Zuschuss-Option">
                <Select value={k.budgetOption} onValueChange={(v) => set({ budgetOption: v })}>
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
              <Field label="Zuzahlung (€)"><Input inputMode="decimal" value={k.zuzahlung} onChange={(e) => set({ zuzahlung: e.target.value })} /></Field>
              <Field label="Wohnumfeld-Vorleistung (€)">
                <Input
                  inputMode="decimal"
                  value={k.wohnumfeld.amount}
                  onChange={(e) => setSection("Kundendaten", { ...k, wohnumfeld: { ...k.wohnumfeld, amount: e.target.value } })}
                />
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={k.wohnumfeld.done}
                onChange={(e) => setSection("Kundendaten", { ...k, wohnumfeld: { ...k.wohnumfeld, done: e.target.checked } })}
                className="size-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              Wohnumfeld-Zuschuss bereits in Anspruch genommen (reduziert verfügbaren Zuschuss)
            </label>
          </div>
        )}
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PayerButton({
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
