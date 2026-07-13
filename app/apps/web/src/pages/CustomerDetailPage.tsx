import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { CustomerDetail } from "@emc2/shared";
import { customersApi } from "@/features/customers/api";
import { customerName } from "./CustomersPage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" });

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    customersApi
      .get(id)
      .then((c) => !cancelled && setCustomer(c))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/kunden")}>
        <ArrowLeft /> Zurück zu Kunden
      </Button>

      {loading ? (
        <p className="text-muted-foreground">Wird geladen …</p>
      ) : error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : customer ? (
        <>
          <header>
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {customer.salutation ? `${customer.salutation} ` : ""}
              {customerName(customer)}
            </h1>
            {customer.customerNumber && (
              <p className="mt-1 text-sm text-muted-foreground">
                Kundennr. {customer.customerNumber}
              </p>
            )}
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Kontakt">
              <Field label="E-Mail" value={customer.email} />
              <Field label="Telefon" value={customer.phone} />
            </Section>

            <Section title="Adresse">
              <Field label="Straße" value={customer.street} />
              <Field label="PLZ / Ort" value={[customer.postalCode, customer.city].filter(Boolean).join(" ")} />
              <Field label="Bundesland" value={customer.state} />
              <Field label="Land" value={customer.country} />
            </Section>

            <Section title="Verwaltung">
              <Field label="Firma" value={customer.company} />
              <Field label="Herkunft (Angebotstyp)" value={customer.sourceOfferType} />
              <Field label="Bitrix-Kontakt-ID" value={customer.bitrixContactId} />
              <Field
                label="Angelegt"
                value={customer.createdAt ? dateFmt.format(new Date(customer.createdAt)) : ""}
              />
              <Field
                label="Aktualisiert"
                value={customer.updatedAt ? dateFmt.format(new Date(customer.updatedAt)) : ""}
              />
            </Section>

            <Kundendaten data={customer.kundendaten} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium break-words">{value || "—"}</span>
    </div>
  );
}

/** Renders the free-form kundendaten snapshot as a flat key/value list. */
function Kundendaten({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;

  const fmt = (v: unknown): string =>
    typeof v === "object" ? JSON.stringify(v) : String(v);

  return (
    <Card className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Weitere Angaben</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[10rem_1fr] gap-2 text-sm">
            <span className="truncate text-muted-foreground" title={key}>
              {key}
            </span>
            <span className="font-medium break-words">{fmt(value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
