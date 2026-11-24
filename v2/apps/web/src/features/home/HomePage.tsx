// Hauptmenü. Opening it ends the offer in progress: one assignment in the store, nothing else.
// Order (U-010 C5): today's appointments, offer tiles, „Öffnen“ (P7-1: deal number, ANG number or the
// search in stored drafts and offers — HomeSearch), saved on this device (U-016).
import { NEW_OFFER_TYPES } from "@oc/domain";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useSession } from "../auth/index.js";
import { call, ApiFailure } from "../../shared/api/index.js";
import { OFFER_TITLES, SecondOfferHost, useOfferStore } from "../offer/index.js";
import { Alert, Page, Tile } from "../../shared/ui/index.js";
import { OfferPicker, PlanningToday } from "./Planning.js";
import { WeekCalendar } from "./WeekCalendar.js";
import type { PlanningEntry } from "./planning-rules.js";
import { DeviceDrafts } from "./DeviceDrafts.js";
import { DealDocuments, HomeSearch } from "./HomeSearch.js";
import { CLASSIC_HOME } from "../../shared/lib/classic-ui.js";

export function HomePage() {
  const close = useOfferStore((s) => s.close);
  const admin = useSession().user?.role === "admin";
  useEffect(() => { close(); }, [close]);
  const nav = useNavigate();
  const [deal, setDeal] = useState(""); // a deal without a draft yet: the tiles start its offer
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<PlanningEntry | null>(null); // the appointment the offer picker is open for

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

  return (
    <Page title="Hauptmenü">
      <PlanningToday onPick={setPick} />
      <h2>Neues Angebot</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {NEW_OFFER_TYPES.map((t) => <Tile key={t} to={`${base}/${t}`} title={OFFER_TITLES[t]} text={t.toUpperCase()} />)}
      </div>
      <HomeSearch onDeal={(id) => void openDeal(id)} onTyping={() => { setMsg(""); setDeal(""); }} />
      {msg ? <Alert>{msg}</Alert> : null}
      {deal ? <DealDocuments key={deal} dealId={deal} /> : null}
      <WeekCalendar onPick={setPick} />
      <DeviceDrafts />
      {pick ? <OfferPicker entry={pick} onClose={() => setPick(null)} /> : null}
      <SecondOfferHost />
      <p className="text-[0.95rem] text-muted-foreground"><a className="text-primary underline" href={CLASSIC_HOME}>Zur bisherigen Ansicht</a>
        {admin ? <> · <a className="text-primary underline" href={CLASSIC_HOME} data-testid="debug-link">Debug-Ansicht Planung (bisherige Ansicht)</a></> : null}</p>
    </Page>
  );
}
