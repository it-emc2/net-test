// „Öffnen“ on the Hauptmenü: deal number, ANG number or a search in the stored drafts and offers
// (rules: search-rules.ts; opening: open.ts). One request per pause in typing (220 ms), an older
// answer never wins; the list closes with Escape or when the focus leaves it.
import { DEAL_NUMBER_RE, HOME_SEARCH_DELAY_MS, HOME_SEARCH_LIMIT, type HomeSearchRow } from "@oc/api-contract";
import { FilePlus, History, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { call } from "../../shared/api/index.js";
import { Alert, Button, Card, Input, Label, cn } from "../../shared/ui/index.js";
import { typeTitle } from "../offer/index.js";
import { classifyOpen } from "./rules.js";
import { openOfferNumber, openRow, sourceLabel, takeOver, type Outcome } from "./open.js";
import { Modal } from "./Modal.js";
import { TEXT, moveActive, reactTypeOf, rowView, storedIntro, type AutosavedInfo } from "./search-rules.js";
import { CLASSIC_HOME } from "../../shared/lib/classic-ui.js";

type Ask = Extract<Outcome, { kind: "ask" }>;
const isAbort = (e: unknown) => (e as Error)?.name === "AbortError";

/** One row of today's lists: a button (React types) or a link to today's view (unknown types). */
export function ResultRow({ row, active, busy, onOpen, id }: { row: HomeSearchRow; active?: boolean; busy?: boolean; onOpen: (r: HomeSearchRow) => void; id?: string }) {
  const v = rowView(row);
  const legacy = !reactTypeOf(row);
  const cls = cn("grid min-h-12 w-full gap-0.5 rounded-md border-2 px-3 py-2 text-left text-foreground no-underline hover:bg-accent-weak focus-visible:bg-accent-weak",
    active ? "border-primary bg-accent-weak" : "border-transparent");
  const body = (
    <>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold" data-part="title">{v.title}</span>
        <span className="flex gap-1.5" data-part="badges">
          {v.badges.map((b, i) => <span key={i} className={cn("rounded-full border px-2 text-[0.85rem] font-semibold", i === 0 && row.kind === "draft" ? "border-border bg-muted" : "border-border bg-card")}>{b}</span>)}
        </span>
      </span>
      {v.meta ? <span className="text-[0.95rem] text-muted-foreground" data-part="meta">{row.ref ? <strong className="text-foreground">{row.ref}</strong> : null}{v.meta.slice(row.ref.length)}</span> : null}
      {v.snippet ? <span className="text-[0.95rem]" data-part="snippet">{v.snippet}</span> : null}
      {legacy ? <span className="text-[0.95rem] font-semibold underline" data-part="legacy">{TEXT.legacy}</span> : null}
      {busy ? <span className="flex items-center gap-2 text-[0.95rem]" role="status"><LoaderCircle aria-hidden className="size-4 animate-spin" />Wird geöffnet …</span> : null}
    </>
  );
  return legacy
    ? <a id={id} href={CLASSIC_HOME} className={cls} data-testid="search-row" data-kind={row.kind}>{body}</a>
    : <button id={id} type="button" className={cls} data-testid="search-row" data-kind={row.kind} disabled={busy} onClick={() => onOpen(row)}>{body}</button>;
}

/** The question when the deal's draft differs from the stored document (U-057). */
function TakeOverQuestion({ q, onClose, onOutcome }: { q: Ask; onClose: () => void; onOutcome: (o: Outcome) => void }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const e = q.existing;
  const when = new Date(e.updatedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const own = reactTypeOf({ ...q.row, offerType: e.offerType });
  const label = sourceLabel(q.row);
  return (
    <Modal title="Automatisch gespeicherten Stand ersetzen?" onClose={onClose}>
      <div className="grid min-w-0 gap-3 [&>*]:min-w-0" data-testid="takeover-question">
        {q.moved ? <Alert className="my-0">Der Stand dieses Auftrags wurde gerade an anderer Stelle geändert.</Alert> : null}
        <p className="m-0">Zu Auftrag {q.key} gibt es bereits einen automatisch gespeicherten Stand{own ? ` (${typeTitle(own)}` : " ("}{e.variantName ? `, Variante „${e.variantName}“` : ""}, {when}, Version {e.revision}).</p>
        <p className="m-0">Wenn Sie {label} übernehmen, wird er zur neuen Version dieses Auftrags. Der bisherige Stand bleibt unter „Versionen“ erhalten.</p>
        {own ? <Button size="lg" className="h-auto min-h-12 w-full whitespace-normal break-words text-left" data-action="open-autosaved" disabled={busy} onClick={() => { onClose(); nav(`/deal/${q.key}/${own}`); }}>
          <History aria-hidden /><span className="min-w-0 whitespace-normal break-words">Automatisch gespeicherten Stand öffnen ({when}, Version {e.revision})</span>
        </Button> : null}
        <Button size="lg" variant="outline" className="h-auto min-h-12 w-full whitespace-normal break-words text-left" data-action="take-over" disabled={busy} aria-busy={busy}
          onClick={async () => { setBusy(true); const o = await takeOver(q); setBusy(false); onOutcome(o); }}>
          <span className="min-w-0 whitespace-normal break-words">{busy ? "Wird übernommen …" : `${label} übernehmen`}</span>
        </Button>
        <Button variant="ghost" className="justify-self-start" disabled={busy} onClick={onClose}>Abbrechen</Button>
      </div>
    </Modal>
  );
}

/** what happens after a tap: go, ask, or say why not */
export function useOpenOutcome() {
  const nav = useNavigate();
  const [ask, setAsk] = useState<Ask | null>(null);
  const [message, setMessage] = useState("");
  const handle = (o: Outcome) => {
    setAsk(null);
    if (o.kind === "go") nav(o.path);
    else if (o.kind === "ask") setAsk(o);
    else if (o.kind === "failed") setMessage(o.message);
    else window.location.assign(CLASSIC_HOME); // today's view (unknown types)
  };
  // in the page's body: a card around the field must not become the dialog's frame (it clipped it)
  const dialog = ask ? createPortal(<TakeOverQuestion q={ask} onClose={() => setAsk(null)} onOutcome={handle} />, document.body) : null;
  return { handle, dialog, message, setMessage };
}

/** Stored drafts/offers that open on a tap (U-057: copied into the deal's draft, asked when it differs). */
export function StoredRows({ rows }: { rows: readonly HomeSearchRow[] }) {
  const [busy, setBusy] = useState("");
  const { handle, dialog, message } = useOpenOutcome();
  const open = async (r: HomeSearchRow) => { setBusy(r.id + r.offerNumber); handle(await openRow(r)); setBusy(""); };
  return (
    <>
      <div className="grid gap-1">{rows.map((r) => <ResultRow key={r.kind + r.id + r.offerNumber} row={r} busy={busy === r.id + r.offerNumber} onOpen={(x) => void open(x)} />)}</div>
      {message ? <Alert kind="error" className="my-0">{message}</Alert> : null}
      {dialog}
    </>
  );
}

/** The rows of a deal's stored drafts and offers (today's deal dialog), under „Für Auftrag … gibt es noch kein Angebot“.
 *  `source`: the lookup already under way (U-063); otherwise asked here. */
export function DealDocuments({ dealId, source }: { dealId: string; source?: Promise<HomeSearchRow[]> | undefined }) {
  const [rows, setRows] = useState<HomeSearchRow[] | null>(null);
  useEffect(() => {
    const c = new AbortController();
    let live = true;
    // best effort, as today: the list never blocks starting a new offer
    (source ?? call("homeByDeal", { params: { dealId }, signal: c.signal }).then((r) => r.rows))
      .then((r) => { if (live) setRows(r); }, () => { if (live) setRows([]); });
    return () => { live = false; c.abort(); };
  }, [dealId, source]);
  if (!rows?.length) return null;
  return (
    <div className="grid gap-2" data-testid="deal-documents">
      <h3 className="m-0 text-lg">{TEXT.dealList}</h3>
      <StoredRows rows={rows} />
    </div>
  );
}

/**
 * U-063: a deal with stored drafts/offers, opened from an appointment or by its number — the list
 * first, then ONE way on without them: the autosaved draft, or a new empty offer.
 */
export function DealStart({ dealId, rows, draft, continueLabel, onContinue, onBack }: {
  dealId: string; rows: readonly HomeSearchRow[]; draft: (AutosavedInfo & { title: string }) | null;
  continueLabel: string; onContinue: () => void; onBack?: (() => void) | undefined;
}) {
  return (
    <div className="grid min-w-0 gap-3 [&>*]:min-w-0" data-testid="deal-start">
      <p className="m-0" data-part="intro">{storedIntro(dealId, draft)}</p>
      <div className="grid gap-2" data-testid="deal-documents">
        <h3 className="m-0 text-lg">{TEXT.dealList}</h3>
        <StoredRows rows={rows} />
      </div>
      <p className="m-0 text-muted-foreground">{TEXT.storedOr}</p>
      <Button size="lg" variant="outline" className="h-auto min-h-12 w-full whitespace-normal break-words text-left" data-action="continue" onClick={onContinue}>
        {draft ? <History aria-hidden /> : <FilePlus aria-hidden />}<span className="min-w-0 whitespace-normal break-words">{continueLabel}</span>
      </Button>
      {onBack ? <Button variant="ghost" className="min-h-12 justify-self-start" data-action="back" onClick={onBack}>{TEXT.back}</Button> : null}
    </div>
  );
}

/** The „Öffnen“ field with its result list. `onDeal`: Enter on a deal number. */
export function HomeSearch({ onDeal, onTyping }: { onDeal: (id: string) => void; onTyping: () => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<HomeSearchRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const { handle, dialog, message, setMessage } = useOpenOutcome();
  const { kind, value } = classifyOpen(text);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; ctl.current?.abort(); ctl.current = null; };
  useEffect(() => stop, []);

  const run = (q: string) => {
    stop();
    const c = new AbortController();
    ctl.current = c;
    setLoading(true); setFailed(false); setOpen(true);
    call("homeSearch", { query: `q=${encodeURIComponent(q)}&limit=${HOME_SEARCH_LIMIT}`, signal: c.signal }).then(
      (r) => { if (c.signal.aborted) return; setRows(r.rows); setActive(r.rows.length ? 0 : -1); setLoading(false); },
      (e) => { if (isAbort(e) || c.signal.aborted) return; setRows(null); setActive(-1); setFailed(true); setLoading(false); },
    );
  };
  const type = (v: string) => {
    setText(v); setMessage(""); onTyping();
    stop();
    const q = v.trim();
    if (!q) { setRows(null); setActive(-1); setLoading(false); setFailed(false); setOpen(false); return; }
    timer.current = setTimeout(() => run(q), HOME_SEARCH_DELAY_MS);
  };
  const openOne = async (r: HomeSearchRow) => {
    setBusy(r.kind + r.id + r.offerNumber);
    handle(await openRow(r));
    setBusy("");
  };
  const onKey = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // P7-1: a deal or an offer number opens that one
      if (kind === "deal" && DEAL_NUMBER_RE.test(value)) { stop(); setOpen(false); onDeal(value); return; }
      if (kind === "offer") { stop(); setOpen(false); setBusy("number"); handle(await openOfferNumber(value)); setBusy(""); return; }
      if (rows?.length && open) { const r = rows[Math.max(active, 0)]; if (r) { if (reactTypeOf(r)) void openOne(r); else window.location.assign(CLASSIC_HOME); } return; }
      if (text.trim()) run(text.trim());
      return;
    }
    if (!rows?.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive((a) => moveActive(a, e.key as "ArrowDown", rows.length)); }
    if (e.key === "Escape") setOpen(false);
  };
  const hint = kind === "deal" ? `Eingabetaste öffnet Deal ${value}` : kind === "offer" ? `Eingabetaste öffnet Angebot ${value}` : "";
  const listId = "home-search-results";
  const shown = open && (loading || failed || rows !== null);

  return (
    <Card data-testid="home-search">
      <div className="relative grid gap-1.5" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
        <Label htmlFor="home-open">{TEXT.label}</Label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input id="home-open" className="pl-10" placeholder={TEXT.placeholder} autoComplete="off" value={text}
            role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-describedby={hint ? "home-open-hint" : undefined}
            aria-activedescendant={shown && active >= 0 && rows?.[active] ? `home-row-${active}` : undefined}
            onChange={(e) => type(e.target.value)} onKeyDown={(e) => void onKey(e)} onFocus={() => { if (rows) setOpen(true); }} />
        </div>
        {hint ? <p className="m-0 text-[0.95rem] text-muted-foreground" id="home-open-hint" aria-live="polite">{hint}</p> : null}
        {kind === "deal" ? <Button className="justify-self-start" onClick={() => onDeal(value)}>Deal {value} öffnen</Button> : null}
        {kind === "offer" ? <Button className="justify-self-start" variant="secondary" disabled={busy === "number"} onClick={async () => { setBusy("number"); handle(await openOfferNumber(value)); setBusy(""); }}>Angebot {value} öffnen</Button> : null}
        {shown ? (
          <div id={listId} role="listbox" aria-label="Gefundene Entwürfe und Angebote" data-testid="search-results"
            className="grid max-h-[28rem] gap-1 overflow-y-auto rounded-lg border-2 border-border bg-card p-1">
            {loading ? <p className="m-0 flex items-center gap-2 px-3 py-2" role="status" data-part="status"><LoaderCircle aria-hidden className="size-5 animate-spin" />{TEXT.loading}</p>
              : failed ? (
                <div className="grid gap-2 p-2" data-testid="search-error">
                  <Alert kind="error" className="my-0">{TEXT.failed}</Alert>
                  <div><Button variant="outline" onClick={() => run(text.trim())}><RefreshCw aria-hidden />{TEXT.retry}</Button></div>
                </div>
              ) : rows && !rows.length ? <p className="m-0 px-3 py-2" role="status" data-part="status">{TEXT.empty}</p>
              : rows?.map((r, i) => (
                <div key={r.kind + r.id + i} role="option" aria-selected={i === active}>
                  <ResultRow id={`home-row-${i}`} row={r} active={i === active} busy={busy === r.kind + r.id + r.offerNumber} onOpen={(x) => { setActive(i); void openOne(x); }} />
                </div>
              ))}
          </div>
        ) : null}
        {message ? <Alert kind="error" className="my-0" data-testid="open-error">{message}</Alert> : null}
      </div>
      {dialog}
    </Card>
  );
}

