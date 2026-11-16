// Hauptmenü. Opening it ends the offer in progress: one assignment in the store, nothing else.
// Order (U-010 C5): today's appointments, offer tiles, „Öffnen“ (P7-1), saved on this device (U-016).
import { NEW_OFFER_TYPES } from "@oc/domain";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { call, ApiFailure } from "../../shared/api/index.js";
import { OFFER_TITLES, useOfferStore } from "../offer/index.js";
import { Alert, Button, Card, Field, Page, Tile } from "../../shared/ui/index.js";
import { Appointments } from "./Appointments.js";
import { DeviceDrafts } from "./DeviceDrafts.js";
import { classifyOpen } from "./rules.js";

export function HomePage() {
  const close = useOfferStore((s) => s.close);
  useEffect(() => { close(); }, [close]);
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [deal, setDeal] = useState(""); // a deal without a draft yet: the tiles start its offer
  const [msg, setMsg] = useState("");
  const { kind, value } = classifyOpen(text);

  // „Öffnen“ with a deal number: its draft knows the offer type; no draft yet → pick a type below
  const openDeal = async (id: string) => {
    setMsg("");
    try {
      const d = await call("dealDraft", { params: { dealId: id } });
      nav(`/deal/${id}/${d.offerType}`);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "NO_DRAFT") { setDeal(id); setMsg(`Für Auftrag ${id} gibt es noch kein Angebot. Wählen Sie unten die Angebotsart.`); }
      else setMsg(e instanceof ApiFailure ? e.message : "Der Auftrag konnte nicht geöffnet werden.");
    }
  };
  const base = deal ? `/deal/${deal}` : "/neu";
  const hint = kind === "deal" ? `Eingabetaste öffnet Deal ${value}` : kind === "offer" ? `Eingabetaste öffnet Angebot ${value}` : "";

  return (
    <Page title="Hauptmenü">
      <Appointments onOpenDeal={(id) => void openDeal(id)} />
      <h2>Neues Angebot</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {NEW_OFFER_TYPES.map((t) => <Tile key={t} to={`${base}/${t}`} title={OFFER_TITLES[t]} text={t.toUpperCase()} />)}
      </div>
      <Card>
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (kind === "deal") void openDeal(value); }}>
          <Field label="Öffnen" id="home-open" placeholder="Name, Ort, Telefon, Angebots- oder Deal-Nummer" autoComplete="off"
            value={text} onChange={(e) => { setText(e.target.value); setMsg(""); setDeal(""); }} hint={hint || undefined} />
          {kind === "deal" ? <Button type="submit" className="justify-self-start">Deal {value} öffnen</Button> : null}
          {kind === "offer" || kind === "text" ? (
            // search and offer numbers load into today's forms — not ported yet
            <Button asChild variant="secondary" className="justify-self-start"><a href="/">In der bisherigen Ansicht suchen</a></Button>
          ) : null}
        </form>
        {msg ? <Alert>{msg}</Alert> : null}
      </Card>
      <DeviceDrafts />
      <p className="text-[0.95rem] text-muted-foreground"><a className="text-primary underline" href="/">Zur bisherigen Ansicht</a></p>
    </Page>
  );
}
