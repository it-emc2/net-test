// Angebotsversand / Zusammenfassung (ADR 026, phase 4) — slice 1, the frame of the page: contact
// person, name and greeting of a two-person offer, how the offer was sent, enclosed documents.
// Slice 2: the Dokumentenstudio (Dokumente.tsx). Adjustments, mail, post and signing are still
// done in today's view (link below).
import { useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { call } from "../../../shared/api/index.js";
import { Card, CardTitle, Check, Field, SelectField, TextAreaField, cn } from "../../../shared/ui/index.js";
import { LegacyLink, useOfferStore, useOfferType } from "../../offer/index.js";
import { Dokumente } from "./Dokumente.js";
import { chooseContact, contactDefault, contactOf, documents, sendStatus, titleOf, twoPersons, type User } from "./rules.js";

const kdNow = () => ((useOfferStore.getState().offer as Record<string, any> | null)?.Kundendaten ?? {}) as Record<string, unknown>;
const setKd = (fields: Record<string, unknown>) => useOfferStore.getState().patch("Kundendaten" as never, fields as never);

export function Versand() {
  const { dealId = "" } = useParams();
  const type = useOfferType();
  const offer = (useOfferStore((s) => s.offer) ?? {}) as Record<string, any>;
  // the list of contact persons, and who is signed in (asked here: this step must not pull the login screen into its chunk)
  const people = useQuery({ queryKey: ["users-and-me"], staleTime: 10 * 60_000, retry: false,
    queryFn: async ({ signal }) => { const [users, me] = await Promise.all([call("users", { signal }) as unknown as Promise<User[]>, call("me", { signal }).then((r) => r.user?.email ?? null).catch(() => null)]); return { users, me }; } });
  const list = people.data?.users ?? [];
  // a new offer gets its contact person as soon as the list is known (as today)
  useEffect(() => {
    if (!people.data) return;
    const change = contactDefault(kdNow(), people.data.users, people.data.me);
    if (change) setKd(change);
  }, [people.data]);

  const two = twoPersons(offer), status = sendStatus(offer), docs = documents(offer);
  return (
    <Card aria-labelledby="versand-title">
      <CardTitle id="versand-title">{titleOf(type)}</CardTitle>
      <SelectField label="Ansprechpartner" id="zf-ansprechpartner" value={contactOf(offer.Kundendaten ?? {}, list)} onChange={(email) => setKd(chooseContact(list, email))}
        options={list.map((u) => ({ value: u.email, label: u.name || u.email }))} />
      {people.error ? <p className="m-0 text-[0.9rem] text-muted-foreground" role="status">Die Liste der Ansprechpartner konnte nicht geladen werden.</p> : null}

      {two ? (
        <section className="grid gap-3" aria-labelledby="zf-two-title" data-testid="zf-two">
          <h3 id="zf-two-title" className="m-0 text-[1.05rem] font-semibold">Anrede &amp; Namen (2 Personen)</h3>
          <p className="m-0 text-muted-foreground">So erscheinen Name und Begrüßung im Angebot. Automatisch befüllt – bei Bedarf anpassbar.</p>
          <TextAreaField label="Anschrift / Namen (oben im Angebot)" id="zf-kunden-name" rows={2} value={two.name} onChange={(v) => setKd({ kundenName: v })} placeholder="z. B. Herr Max Mustermann und Frau Erika Mustermann" />
          <Field label="Begrüßung (Anrede im Anschreiben)" id="zf-greeting" value={two.greeting} onChange={(e) => setKd({ greetingLine: e.target.value })} placeholder="z. B. Sehr geehrter Herr Mustermann, sehr geehrte Frau Mustermann" />
        </section>
      ) : null}

        <p role="status" data-testid="zf-status" data-sent={status.sent ? "true" : "false"} className={cn("m-0 flex items-center gap-2 rounded-lg border px-3 py-3", status.sent ? "border-[#bfe3cf] bg-[#e8f5ee] font-semibold text-[#1e8449]" : "border-border bg-card text-muted-foreground")}>
          {status.sent ? <CircleCheck aria-hidden className="size-5 shrink-0" /> : null}<span data-part="text">{status.text}</span>
        </p>

      <Dokumente />

      {docs ? (
        <section className="grid gap-2" aria-labelledby="zf-docs-title" data-testid="zf-docs">
          <h3 id="zf-docs-title" className="m-0 text-[1.05rem] font-semibold">Mitgesendete Unterlagen</h3>
          <p className="m-0 text-muted-foreground">Bestimmt, welche Unterlagen mitgehen — in der E-Mail, als PDF-Anhang, im Postversand und in der Online-Unterschrift. Das Angebot ist immer enthalten. Bei Selbstzahlern sind Abtretung und Vollmacht voreingestellt abgewählt.</p>
          {docs.map((d) => <Check key={d.id} id={`zf-doc-${d.id}`} checked={d.checked} onChange={(on) => useOfferStore.getState().patch("docSelection" as never, { [d.id]: on } as never)}>{d.label}</Check>)}
        </section>
      ) : null}

      <section className="grid gap-2 border-t border-border pt-4">
        <h3 className="m-0 text-[1.05rem] font-semibold">Anpassungen und Versand</h3>
        <p className="m-0 text-muted-foreground">Anpassungen am Angebot, Versand per E-Mail oder Post und die Unterschrift vor Ort werden noch in der bisherigen Ansicht erledigt. Ihre Eingaben werden mitgenommen.</p>
        <LegacyLink dealId={dealId} step="Zusammenfassung">In der bisherigen Ansicht öffnen</LegacyLink>
      </section>
    </Card>
  );
}
