// Hauptmenü. Opening it ends the offer in progress: one assignment in the store, nothing else.
// Order (U-010 C5): today's appointments, offer tiles, „Öffnen“ (P7-1: deal number, ANG number or the
// search in stored drafts and offers — HomeSearch), saved on this device (U-016).
// U-063: a deal number whose deal has stored drafts/offers lists them first, also when the deal has
// an autosaved draft (before: straight into the draft, the stored ones only reachable by name).
import type { HomeSearchRow } from "@oc/api-contract";
import { NEW_OFFER_TYPES } from "@oc/domain";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useSession } from "../auth/index.js";
import { call, ApiFailure } from "../../shared/api/index.js";
import { OFFER_TITLES, SecondOfferHost, typeTitle, useOfferStore } from "../offer/index.js";
import { Alert, Page, Tile } from "../../shared/ui/index.js";
import { OfferPicker, PlanningToday } from "./Planning.js";
import { WeekCalendar } from "./WeekCalendar.js";
import type { PlanningEntry } from "./planning-rules.js";
import { DeviceDrafts } from "./DeviceDrafts.js";
import { DealDocuments, DealStart, HomeSearch } from "./HomeSearch.js";
import { DEAL_DOCS_WAIT_MS, autosavedButton, storedFirst, within } from "./search-rules.js";
import { CLASSIC_HOME } from "../../shared/lib/classic-ui.js";

export function HomePage() {
  const close = useOfferStore((s) => s.close);
  const admin = useSession().user?.role === "admin";
  useEffect(() => { close(); }, [close]);
  const nav = useNavigate();
  const [deal, setDeal] = useState(""); // a deal without a draft yet: the tiles start its offer
  const [msg, setMsg] = useState("");
  const [pick, setPick] = useState<PlanningEntry | null>(null); // the appointment the offer picker is open for

  // the deal opened by number whose stored drafts/offers come first (U-063)
  const [stored, setStored] = useState<{ id: string; type: string; rows: HomeSearchRow[]; draft: { offerType: string; updatedAt: string; revision: number; title: string } } | null>(null);
  const [docs, setDocs] = useState<Promise<HomeSearchRow[]> | undefined>(undefined); // the lookup under way, for the list under „noch kein Angebot“
  const seq = useRef(0); // a newer „Öffnen“ (or typing) wins over an older answer

  // „Öffnen“ with a deal number: its draft knows the offer type; no draft yet → pick a type below
  const openDeal = async (id: string) => {
    const n = ++seq.current;
    setMsg(""); setStored(null); setDocs(undefined);
    // asked at the same time; waited for at most DEAL_DOCS_WAIT_MS after the draft answered — never blocks
    const rows = call("homeByDeal", { params: { dealId: id } }).then((r) => r.rows);
    rows.catch(() => {}); // a failing lookup only means: open as before
    try {
      const d = await call("dealDraft", { params: { dealId: id } });
      const found = await within(rows, DEAL_DOCS_WAIT_MS);
      if (n !== seq.current) return;
      const draftNumber = String((d.payload as Record<string, unknown>).offerNumber ?? "");
      if (found && storedFirst(found, draftNumber)) {
        setStored({ id, type: d.offerType, rows: found, draft: { offerType: d.offerType, updatedAt: String(d.updatedAt), revision: d.revision, title: typeTitle(d.offerType) } });
        return;
      }
      nav(`/deal/${id}/${d.offerType}`);
    } catch (e) {
      if (n !== seq.current) return;
      if (e instanceof ApiFailure && e.code === "NO_DRAFT") {
        setDocs(rows); setDeal(id); setMsg(`Für Auftrag ${id} gibt es noch kein Angebot. Wählen Sie unten die Angebotsart.`);
      }
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
      <HomeSearch onDeal={(id) => void openDeal(id)} onTyping={() => { seq.current++; setMsg(""); setDeal(""); setStored(null); setDocs(undefined); }} />
      {msg ? <Alert>{msg}</Alert> : null}
      {deal ? <DealDocuments key={deal} dealId={deal} source={docs} /> : null}
      {stored ? (
        <section className="grid gap-3 rounded-xl border-2 border-border bg-card p-4 text-card-foreground" aria-label={`Auftrag ${stored.id}`}>
          <DealStart dealId={stored.id} rows={stored.rows} draft={stored.draft}
            continueLabel={autosavedButton(stored.draft)} onContinue={() => nav(`/deal/${stored.id}/${stored.type}`)} />
        </section>
      ) : null}
      <WeekCalendar onPick={setPick} />
      <DeviceDrafts />
      {pick ? <OfferPicker entry={pick} onClose={() => setPick(null)} /> : null}
      <SecondOfferHost />
      <p className="text-[0.95rem] text-muted-foreground"><a className="text-primary underline" href={CLASSIC_HOME}>Zur bisherigen Ansicht</a>
        {admin ? <> · <Link className="text-primary underline" to="/admin/planung" data-testid="debug-link">Diagnose Planung</Link></> : null}</p>
    </Page>
  );
}
