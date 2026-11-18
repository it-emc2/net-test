// Where a customer's data comes from besides typing (today's Kundendaten, recorded in
// test/fixtures/kundendaten-bitrix.json):
//  - the Bitrix deal of a NEW offer: its contact, the deal number and the landlord answers
//    (today: Hauptmenü „Bitrix Deal laden“). ONE request (GET /api/deals/:id/customer, one Bitrix
//    batch on the server), kept as long as the server keeps it; no refetch on focus/reconnect.
//  - „Kontakt aus Bitrix laden“ with the Bitrix contact number
//  - „Kunde suchen“ in the local customer list (no Bitrix)
// Nothing here blocks: a failure is said in German with „Erneut versuchen“; the fields can always
// be typed by hand.
import { DEAL_NUMBER_RE, ERROR_AREAS, ERROR_CODES, customerOfContact, type DealCustomerResponse } from "@oc/api-contract";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { call, dealCustomerKey, dealCustomerQuery, loadDealCustomerFresh } from "../../../shared/api/index.js";
import { Alert, Button, Card, CardTitle, Input, Label } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { useOfferField, useOfferStore, useOfferType } from "../../offer/index.js";
import { failureOf, isAbort, type Failure } from "./failures.js";
import { SEARCH_DELAY_MS, dealFill, dealNumberTop, hitLines, isFreshForDeal, landlordChanges, restoreChanges, savedKundendaten, searchable, type Changes, type SearchHit } from "./fill.js";
import { dealNumber } from "./uploads.js";

const KD = "Kundendaten";
const LOAD = ERROR_AREAS.kundendatenBitrixLoad;
const offerNow = () => useOfferStore.getState().offer as Record<string, any> | null;
const apply = (sections: Changes, top?: Record<string, unknown>) => {
  const st = useOfferStore.getState();
  const kd = sections.Kundendaten ?? {};
  const rest = Object.fromEntries(Object.entries(sections).filter(([s, f]) => s !== KD && Object.keys(f).length));
  if (Object.keys(kd).length || Object.keys(rest).length) st.patchAll({ ...(Object.keys(kd).length ? { [KD]: kd } : {}), ...rest });
  if (top && Object.keys(top).length) st.setTop(top);
};

const loadFresh = loadDealCustomerFresh;

/** the customer of the offer's deal: asked once per deal while the answer is fresh */
export function useDealCustomer(dealId: string) {
  return useQuery({
    ...dealCustomerQuery(dealId),
    enabled: DEAL_NUMBER_RE.test(dealId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    // the server already waited out Bitrix's rate limit; one more try only for a lost connection
    retry: (n, err) => n < 1 && (err as { code?: string })?.code === "OFFLINE",
  });
}

/** Fills a NEW offer from its deal once the answer is there; says what happened. */
function DealLoad({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const type = useOfferType() ?? "";
  const q = useDealCustomer(dealId);
  const [retrying, setRetrying] = useState(false);
  const noContact = q.data && !q.data.customer;
  useEffect(() => {
    const r = q.data;
    const st = useOfferStore.getState();
    if (!r || st.scratch.dealFilled === r.dealId) return;
    st.remember("dealFilled", r.dealId); // once per offer and deal
    const offer = offerNow();
    if (!offer || !isFreshForDeal(offer) || dealNumber(offer, st.dealId) !== r.dealId) return; // typed meanwhile, or another deal: nothing is overwritten
    const { sections, top } = dealFill(offer, r, type);
    apply(sections, top);
  }, [q.data, type]);
  if (!DEAL_NUMBER_RE.test(dealId)) return null;
  if (q.isPending && q.fetchStatus === "fetching") {
    return <p className="m-0 flex items-center gap-2 text-muted-foreground" role="status"><LoaderCircle aria-hidden className="size-5 animate-spin" />Kundendaten werden aus Bitrix geladen …</p>;
  }
  if (q.isError) {
    const f = failureOf(LOAD, q.error, ERROR_CODES.BITRIX_UNAVAILABLE);
    const retry = async () => { setRetrying(true); try { await loadFresh(qc, dealId); } catch { /* shown by the query */ } finally { setRetrying(false); } };
    return (
      <div className="grid gap-2" data-testid="kd-bitrix-error" data-code={f.code}>
        {/* a load in the background: said politely (status), not as an interrupting alert */}
        <p role="status" className="m-0 flex items-start gap-3 rounded-lg border-2 border-destructive bg-card px-4 py-3">
          <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-destructive" /><span>{f.message}</span>
        </p>
        <div><Button variant="outline" onClick={() => void retry()} disabled={retrying}><RefreshCw aria-hidden className={retrying ? "animate-spin" : undefined} />Erneut versuchen</Button></div>
      </div>
    );
  }
  if (noContact) return <Alert className="my-0">Zu diesem Deal ist kein Kontakt hinterlegt. Bitte geben Sie die Kundendaten von Hand ein.</Alert>;
  return null;
}

/** „Bitrix Kontakt ID“ + „Kontakt aus Bitrix laden“ (today's row at the top of the form) */
function ContactLoad() {
  const qc = useQueryClient();
  const type = useOfferType() ?? "";
  const id = useOfferField<string>(KD, "bitrixContactId") ?? "";
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const opened = useRef<string | null>(null);
  const load = async () => {
    const st = useOfferStore.getState();
    const contactId = id.trim();
    setFailure(null);
    if (!contactId) { setFailure({ code: "NO_CONTACT_ID", message: "Bitte eine Bitrix Kontakt ID eingeben", requestId: "" }); return; }
    opened.current = st.dealId;
    const still = () => useOfferStore.getState().dealId === opened.current; // the offer may be left meanwhile
    const deal = dealNumber(offerNow(), st.dealId);
    setBusy(true);
    try {
      // the deal's own contact: one Bitrix request through the deal; any other number: today's contact route
      const cached = deal ? qc.getQueryData<DealCustomerResponse>(dealCustomerKey(deal)) : undefined;
      let customer;
      if (deal && cached?.customer?.bitrixContactId === contactId) customer = (await loadFresh(qc, deal)).customer;
      else {
        const res = await call("bitrixContact", { params: { id: contactId } });
        if (!res.result || !(res.result as Record<string, unknown>).ID) throw Object.assign(new Error("Kontakt nicht gefunden"), { notFound: true });
        customer = customerOfContact(res.result as Record<string, unknown>);
      }
      if (!still()) return;
      if (!customer) throw Object.assign(new Error("Kontakt nicht gefunden"), { notFound: true });
      apply(restoreChanges(offerNow()!, { ...customer }, type));
      toast.success("Kontakt aus Bitrix übernommen");
      // the contact's deal becomes the offer's — only for an offer without a deal number (as today: exactly one deal)
      if (!deal) {
        const list = await call("bitrixContactDeals", { params: { id: contactId } }).then((r) => r.deals ?? [], () => []);
        if (list.length === 1 && still()) {
          const dealId = String(list[0]!.id);
          apply({}, dealNumberTop(offerNow()!, dealId));
          const r = await qc.fetchQuery(dealCustomerQuery(dealId)).catch(() => null);
          const now = offerNow();
          if (r && now && still()) {
            const kd = now.Kundendaten ?? {};
            const changes = landlordChanges(type, r.vermieter, kd, r.customer?.bitrixContactId ?? null);
            if (Object.keys(changes).length) apply({ [KD]: changes });
          }
        }
      }
    } catch (err) {
      if (isAbort(err) || !still()) return;
      setFailure((err as { notFound?: boolean }).notFound ? { code: "CONTACT_NOT_FOUND", message: "Kontakt nicht gefunden", requestId: "" } : failureOf(LOAD, err, ERROR_CODES.BITRIX_UNAVAILABLE, true));
    } finally {
      setBusy(false);
    }
  };
  const setId = (v: string) => useOfferStore.getState().patch(KD as never, { bitrixContactId: v, customerNumber: v } as never);
  return (
    <div className="grid gap-2">
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="kd-bitrixContactId">Bitrix Kontakt ID</Label>
          <Input id="kd-bitrixContactId" placeholder="z.B. 12345" autoComplete="off" inputMode="numeric" value={id}
            onChange={(e) => setId(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void load(); } }} />
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={busy} aria-busy={busy}>{busy ? "Laden…" : "Kontakt aus Bitrix laden"}</Button>
      </div>
      {failure ? (
        <div className="grid gap-2" data-testid="kd-contact-error" data-code={failure.code}>
          <Alert kind="error" className="my-0">{failure.message}</Alert>
          {failure.code !== "NO_CONTACT_ID" && failure.code !== "CONTACT_NOT_FOUND" ? <div><Button variant="outline" onClick={() => void load()} disabled={busy}><RefreshCw aria-hidden />Erneut versuchen</Button></div> : null}
        </div>
      ) : null}
    </div>
  );
}

export function BitrixCustomer() {
  const dealId = useOfferStore((s) => dealNumber(s.offer as Record<string, unknown> | null, s.dealId));
  return (
    <Card aria-labelledby="kd-bitrix" data-testid="kd-bitrix">
      <CardTitle id="kd-bitrix">Kunde aus Bitrix</CardTitle>
      <DealLoad dealId={dealId} />
      <ContactLoad />
    </Card>
  );
}

/** „Kunde suchen“: the local customer list, 250 ms after the last key; an older answer never wins */
export function CustomerSearch() {
  const type = useOfferType() ?? "";
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; ctl.current?.abort(); ctl.current = null; };
  useEffect(() => stop, []);
  const run = (text: string) => {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setFailure(null);
    call("customerSearch", { query: `q=${encodeURIComponent(text)}`, signal: c.signal }).then(
      (r) => { if (!c.signal.aborted) setHits((r.items ?? []) as SearchHit[]); },
      (err) => { if (isAbort(err) || c.signal.aborted) return; setHits(null); setFailure(failureOf(ERROR_AREAS.kundendatenCustomerSearch, err, ERROR_CODES.CUSTOMER_SEARCH_FAILED)); },
    );
  };
  const type_ = (v: string) => {
    setQ(v);
    stop();
    if (!searchable(v)) { setHits(null); setFailure(null); return; }
    const text = v.trim();
    timer.current = setTimeout(() => run(text), SEARCH_DELAY_MS);
  };
  const pick = async (c: SearchHit) => {
    stop();
    setHits(null);
    setQ("");
    const opened = useOfferStore.getState().dealId;
    let k = savedKundendaten(c as Record<string, unknown>), msg = "Kundendaten-Seite geladen";
    if (c._id) {
      try { const r = await call("customer", { params: { id: c._id } }); k = savedKundendaten((r.customer ?? c) as Record<string, unknown>); }
      catch (err) { failureOf(ERROR_AREAS.kundendatenCustomerSearch, err, ERROR_CODES.CUSTOMER_LOAD_FAILED); msg = "Kundendaten geladen"; } // as today: the hit itself is used
    }
    const offer = offerNow();
    if (!offer || useOfferStore.getState().dealId !== opened) return;
    apply(restoreChanges(offer, k, type));
    toast.info(msg);
  };
  return (
    <Card data-testid="kd-search">
      <div className="relative grid gap-1.5" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHits(null); }}
        onKeyDown={(e) => { if (e.key === "Escape") setHits(null); }}>
        <Label htmlFor="kd-customerSearch">Kunde suchen</Label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input id="kd-customerSearch" className="pl-10" placeholder="Name / Kundennummer" autoComplete="off" value={q} onChange={(e) => type_(e.target.value)}
            role="combobox" aria-expanded={!!hits} aria-controls="kd-search-results" aria-autocomplete="list" />
        </div>
        {hits ? (
          <ul id="kd-search-results" role="listbox" aria-label="Gefundene Kunden" data-testid="kd-search-results"
            className="m-0 grid max-h-80 list-none gap-1 overflow-y-auto rounded-lg border-2 border-border bg-card p-1">
            {hits.length ? hits.map((c, i) => {
              const l = hitLines(c);
              return (
                <li key={c._id ?? i} role="option" aria-selected={false}>
                  <button type="button" className="grid min-h-12 w-full gap-0.5 rounded-md px-3 py-2 text-left hover:bg-accent-weak focus-visible:bg-accent-weak" onClick={() => void pick(c)}>
                    <span className="font-semibold" data-part="main">{l.main}</span>
                    {l.meta ? <span className="text-[0.95rem] text-muted-foreground" data-part="meta">{l.meta}</span> : null}
                  </button>
                </li>
              );
            }) : <li className="px-3 py-2"><span data-part="main">Kein Kunde gefunden</span></li>}
          </ul>
        ) : null}
        {failure ? (
          <div className="grid gap-2" data-testid="kd-search-error" data-code={failure.code}>
            <Alert kind="error" className="my-0">{failure.message}</Alert>
            <div><Button variant="outline" onClick={() => run(q.trim())}><RefreshCw aria-hidden />Erneut versuchen</Button></div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
