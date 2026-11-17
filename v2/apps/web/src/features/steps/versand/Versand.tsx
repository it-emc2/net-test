// Angebotsversand / Zusammenfassung (ADR 026, phase 4) — slice 1, the frame of the page: contact
// person, name and greeting of a two-person offer, how the offer was sent, enclosed documents.
// Slice 2: the Dokumentenstudio (Dokumente.tsx). Slice 3: adjustments to the offer and the
// internal note (Anpassungen.tsx). Slice 4, part 1: the mail form (Mail.tsx). Slice 4b, part 1:
// sending by mail (Senden.tsx). Slice 5: the letter (Post.tsx) behind the tab "Angebot per Post". Slice 6:
// signing on site on both tabs (Unterschrift.tsx) and the signed documents by post (Post.tsx).
// The history of sends: Verlauf.tsx (U-015).
// U-024 (owner-approved mock 2026-11-17), top to bottom: contact person and send status, the
// enclosed documents, the history (only when something was sent), the choice "Per E-Mail" /
// "Per Post", and "Mehr Optionen" (closed) with the Dokumentenstudio and "Angebot anpassen".
import { useQuery } from "@tanstack/react-query";
import { CircleCheck, Mail as MailIcon, Mailbox } from "lucide-react";
import { useEffect } from "react";
import { call } from "../../../shared/api/index.js";
import { Card, CardTitle, Check, Collapsible, Field, SelectField, TabsList, TabsPanel, TextAreaField, cn } from "../../../shared/ui/index.js";
import { useOfferStore, useOfferType } from "../../offer/index.js";
import { Anpassungen } from "./Anpassungen.js";
import { Dokumente } from "./Dokumente.js";
import { Mail } from "./Mail.js";
import { Post } from "./Post.js";
import { Verlauf } from "./Verlauf.js";
import { Senden } from "./Senden.js";
import { chooseContact, contactDefault, contactOf, documents, sendStatus, titleOf, twoPersons, type User } from "./rules.js";

const TABS = [{ id: "mail", label: <><MailIcon aria-hidden />Per E-Mail</> }, { id: "post", label: <><Mailbox aria-hidden />Per Post</> }] as const;
const kdNow = () => ((useOfferStore.getState().offer as Record<string, any> | null)?.Kundendaten ?? {}) as Record<string, unknown>;
const setKd = (fields: Record<string, unknown>) => useOfferStore.getState().patch("Kundendaten" as never, fields as never);

export function Versand() {
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

  const tab = useOfferStore((s) => s.scratch.sendTab) === "post" ? "post" : "mail";
  const more = useOfferStore((s) => s.scratch.moreOptions) === true;
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

      {docs ? (
        <section className="grid gap-2" aria-labelledby="zf-docs-title" data-testid="zf-docs">
          <h3 id="zf-docs-title" className="m-0 text-[1.05rem] font-semibold">Mitgesendete Unterlagen</h3>
          <p className="m-0 text-muted-foreground">Bestimmt, welche Unterlagen mitgehen — in der E-Mail, als PDF-Anhang, im Postversand und in der Online-Unterschrift. Das Angebot ist immer enthalten. Bei Selbstzahlern sind Abtretung und Vollmacht voreingestellt abgewählt.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {docs.map((d) => <Check key={d.id} id={`zf-doc-${d.id}`} checked={d.checked} onChange={(on) => { const st = useOfferStore.getState(); if (on) st.remember("mailRemoved", ((st.scratch.mailRemoved as string[] | undefined) ?? []).filter((x) => x !== d.id)); st.patch("docSelection" as never, { [d.id]: on } as never); }}>{d.label}</Check>)}
          </div>
        </section>
      ) : null}

      <Verlauf />

      {/* the first choice: mail or post; the ticks above feed mail, post and signing alike */}
      <section className="grid gap-4" aria-label="Versandart">
        <TabsList label="Versandart" idPrefix="zf" data-testid="zf-tabs" tabs={TABS} value={tab} onChange={(id) => useOfferStore.getState().remember("sendTab", id)} />
        <TabsPanel idPrefix="zf" id="mail" value={tab} className="grid gap-4">
          <Mail />
          <Senden />
        </TabsPanel>
        <TabsPanel idPrefix="zf" id="post" value={tab} className="grid gap-4">
          <Post />
        </TabsPanel>
      </section>

      <Collapsible id="zf-more" title="Mehr Optionen" hint="Dokumentenstudio, Angebot anpassen, interne Notiz" open={more} onOpenChange={(open) => useOfferStore.getState().remember("moreOptions", open)}>
        <Dokumente />
        <Anpassungen />
      </Collapsible>
    </Card>
  );
}
