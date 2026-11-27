// Hauptmenü. Opening it ends the offer in progress: one assignment in the store, nothing else.
// Order (U-010 C5): today's appointments, offer tiles, „Öffnen“ (P7-1: deal number, ANG number or the
// search in stored drafts and offers — HomeSearch), saved on this device (U-016).
// U-063: a deal number whose deal has stored drafts/offers lists them first, also when the deal has
// an autosaved draft (before: straight into the draft, the stored ones only reachable by name).
// U-073: a deal with a draft shows its variants, its stored documents of the old app and „Neue
// Variante beginnen“ first (DealOverview); the variant list unknown → as U-063.
import type { DealVariant, HomeSearchRow } from "@oc/api-contract";
import { NEW_OFFER_TYPES, isNewOfferType } from "@oc/domain";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useSession } from "../auth/index.js";
import { call, ApiFailure } from "../../shared/api/index.js";
import { OFFER_TITLES, SecondOfferHost, isStepOf, typeTitle, useOfferStore } from "../offer/index.js";
import { Alert, Page, Tile } from "../../shared/ui/index.js";
import { OfferPicker, PlanningToday } from "./Planning.js";
import { OfferIcon } from "./offer-icons.js";
import { WeekCalendar } from "./WeekCalendar.js";
import type { PlanningEntry } from "./planning-rules.js";
import { DeviceDrafts } from "./DeviceDrafts.js";
import { DealDocuments, DealStart, HomeSearch, useOpenOutcome } from "./HomeSearch.js";
import { openOfferNumber } from "./open.js";
import { startTarget } from "./rules.js";
import { DealOverview } from "./DealOverview.js";
import { oldDocuments } from "./overview-rules.js";
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
  // the deal opened by number that has variants (U-073)
  const [overview, setOverview] = useState<{ id: string; variants: DealVariant[]; rows: HomeSearchRow[] } | null>(null);
  const [docs, setDocs] = useState<Promise<HomeSearchRow[]> | undefined>(undefined); // the lookup under way, for the list under „noch kein Angebot“
  const seq = useRef(0); // a newer „Öffnen“ (or typing) wins over an older answer

  // U-074 / U-075: `?offer=<number>` in the address opens that stored offer as „Öffnen“ with its
  // number does, `?deal=<number>[&step=…]` that deal as „Öffnen“ with a deal number does (once; the
  // address is cleaned so a reload or „Zurück“ does not open it again)
  const { search } = useLocation();
  const target = useRef(startTarget(search));
  const started = useRef(false);
  const opener = useOpenOutcome();
  const [opening, setOpening] = useState("");
  useEffect(() => {
    const t = target.current;
    if (!t || started.current) return;
    started.current = true;
    nav("/", { replace: true });
    if (t.kind === "deal") { void openDeal(t.id, t.step); return; }
    setOpening(t.number);
    void openOfferNumber(t.number).then((o) => { setOpening(""); opener.handle(o); });
  }, []); // once, for the address the page was opened with

  // „Öffnen“ with a deal number: its draft knows the offer type; no draft yet → pick a type below.
  // `step`: the step of a deal link (U-075), used when the deal opens straight into its draft
  const openDeal = async (id: string, step = "") => {
    const n = ++seq.current;
    setMsg(""); setStored(null); setOverview(null); setDocs(undefined);
    // asked at the same time; waited for at most DEAL_DOCS_WAIT_MS after the draft answered — never blocks
    const rows = call("homeByDeal", { params: { dealId: id } }).then((r) => r.rows);
    rows.catch(() => {}); // a failing lookup only means: open as before
    const variants = call("dealVariants", { params: { dealId: id } }).then((r) => r.variants);
    variants.catch(() => {});
    try {
      const d = await call("dealDraft", { params: { dealId: id } });
      const [found, list] = await Promise.all([within(rows, DEAL_DOCS_WAIT_MS), within(variants, DEAL_DOCS_WAIT_MS)]);
      if (n !== seq.current) return;
      if (list?.length) { setOverview({ id, variants: list, rows: oldDocuments(found, list) }); return; }
      const draftNumber = String((d.payload as Record<string, unknown>).offerNumber ?? "");
      if (found && storedFirst(found, draftNumber)) {
        setStored({ id, type: d.offerType, rows: found, draft: { offerType: d.offerType, updatedAt: String(d.updatedAt), revision: d.revision, title: typeTitle(d.offerType) } });
        return;
      }
      nav(`/deal/${id}/${d.offerType}${step && isNewOfferType(d.offerType) && isStepOf(d.offerType, step) ? `/${step}` : ""}`);
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
      {opening ? <div data-testid="start-opening"><Alert>Angebot {opening} wird geöffnet …</Alert></div> : null}
      {opener.message ? <div data-testid="start-error"><Alert kind="error">{opener.message}</Alert></div> : null}
      {opener.dialog}
      <PlanningToday onPick={setPick} />
      <h2>Neues Angebot</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {NEW_OFFER_TYPES.map((t) => <Tile key={t} to={`${base}/${t}`} title={OFFER_TITLES[t]} text={t.toUpperCase()} icon={<OfferIcon type={t} />} />)}
      </div>
      {/* with a mouse (PC) the search is the first thing under the title; on the iPad it stays here (owner 2026-11-27) */}
      <div className="grid min-w-0 gap-4 [@media(pointer:fine)]:row-start-2" data-testid="home-search-area">
        <HomeSearch onDeal={(id) => void openDeal(id)} onTyping={() => { seq.current++; setMsg(""); setDeal(""); setStored(null); setOverview(null); setDocs(undefined); }} />
        {msg ? <Alert>{msg}</Alert> : null}
        {deal ? <DealDocuments key={deal} dealId={deal} source={docs} /> : null}
        {stored ? (
          <section className="grid gap-3 rounded-xl border-2 border-border bg-card p-4 text-card-foreground" aria-label={`Auftrag ${stored.id}`}>
            <DealStart dealId={stored.id} rows={stored.rows} draft={stored.draft}
              continueLabel={autosavedButton(stored.draft)} onContinue={() => nav(`/deal/${stored.id}/${stored.type}`)} />
          </section>
        ) : null}
        {overview ? (
          <section className="grid gap-3 rounded-xl border-2 border-border bg-card p-4 text-card-foreground" aria-label={`Auftrag ${overview.id}`}>
            <DealOverview key={overview.id} dealId={overview.id} variants={overview.variants} rows={overview.rows} />
          </section>
        ) : null}
      </div>
      <WeekCalendar onPick={setPick} />
      <DeviceDrafts />
      {pick ? <OfferPicker entry={pick} onClose={() => setPick(null)} /> : null}
      <SecondOfferHost />
      <p className="text-[0.95rem] text-muted-foreground"><a className="text-primary underline" href={CLASSIC_HOME}>Zur bisherigen Ansicht</a>
        {admin ? <> · <Link className="text-primary underline" to="/admin/planung" data-testid="debug-link">Diagnose Planung</Link></> : null}</p>
    </Page>
  );
}
