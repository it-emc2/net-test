// Logs and statistics (today's views "Bitrix-Fehler", "Aktivitäts-Log", "PDF-Engine"): the same
// requests and columns. "Erneut senden" asks first (today: no question) and shows a failure on the
// page (today: a browser alert).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { ApiFailure, call } from "../../shared/api/index.js";
import { Alert, Button, Field } from "../../shared/ui/index.js";
import { Badge, Confirm, Empty, Refresh, Select, Stats, TD, Table, useSettled } from "./parts.js";
import { PDF_DAYS, PDF_ENGINE, PDF_KIND, USER_EVENTS, fmtMs, fmtTs, pdfBaseline, pdfSummary, queryOf, sortPdfRows } from "./rules.js";

const failText = (e: unknown) => (e instanceof ApiFailure ? e.message : "Fehler beim Laden.");
type Row = Record<string, any>;

// ---------- Bitrix-Fehler ----------
const BX_KEY = ["admin", "bitrix-logs"] as const;
export function BitrixLogsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: BX_KEY, queryFn: ({ signal }) => call("adminBitrixLogs", { signal }), retry: false, staleTime: 0 });
  const [ask, setAsk] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const items = (q.data?.items ?? []) as Row[];
  const retry = async (it: Row) => {
    setBusy(true);
    try {
      await call("adminBitrixRetry", { params: { id: String(it._id) } });
      setMsg({ ok: true, text: `${it.method} erneut gesendet – erledigt.` });
      await qc.invalidateQueries({ queryKey: BX_KEY });
    } catch (e) { setMsg({ ok: false, text: `Erneut senden fehlgeschlagen: ${failText(e)}` }); }
    setBusy(false); setAsk(null);
  };
  return (
    <section className="grid gap-4" data-testid="admin-bitrix">
      <div className="flex flex-wrap items-center gap-3"><h2 className="m-0 flex-1 text-[1.3rem]">Bitrix-Fehler</h2><Refresh busy={q.isFetching} onClick={() => void q.refetch()} /></div>
      {msg ? <Alert kind={msg.ok ? "info" : "error"}>{msg.text}</Alert> : null}
      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      <Table label="Bitrix-Fehler" head={["Zeit", "Bitrix-Methode", "Fehler", "Parameter", "Status", ""]}>
        {q.isPending ? <Empty cols={6}>Lade …</Empty> : !items.length ? <Empty cols={6}>Keine Fehler in den letzten 30 Tagen.</Empty> : items.map((it) => (
          <tr key={String(it._id)}>
            <td className={`${TD} whitespace-nowrap`}>{fmtTs(it.createdAt)}</td>
            <td className={TD}>{String(it.method ?? "")}</td>
            <td className={`${TD} break-words`}>{String(it.message ?? "")}</td>
            <td className={TD}><pre className="m-0 max-h-40 max-w-xs overflow-auto whitespace-pre-wrap break-all text-[0.85rem]">{JSON.stringify(it.params || {}, null, 2)}</pre></td>
            <td className={TD}>{it.resolved ? <Badge tone="ok">Erledigt</Badge> : <Badge tone="warn">Offen</Badge>}</td>
            <td className={TD}>{it.resolved ? null : <Button variant="outline" onClick={() => { setMsg(null); setAsk(it); }} aria-label={`${it.method} erneut senden`}><RotateCw aria-hidden />Erneut senden</Button>}</td>
          </tr>
        ))}
      </Table>
      {ask ? (
        <Confirm title="Erneut an Bitrix senden?" confirmLabel="Erneut senden" busy={busy} onConfirm={() => void retry(ask)} onCancel={() => setAsk(null)}>
          <p className="m-0">Der Aufruf <strong>{String(ask.method)}</strong> wird mit den gespeicherten Parametern noch einmal an Bitrix geschickt. Gelingt er, gilt der Eintrag als erledigt.</p>
        </Confirm>
      ) : null}
    </section>
  );
}

// ---------- Aktivitäts-Log ----------
const EVENT_TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { offer_sent: "warn", move_dialog_dismissed: "neutral", move_succeeded: "ok", move_failed: "bad" };
export function UserLogsPage() {
  const [event, setEvent] = useState("");
  const [deal, setDeal] = useState("");
  const dealId = useSettled(deal.trim());
  const query = queryOf([["event", event], ["dealId", dealId]]);
  const q = useQuery({ queryKey: ["admin", "user-logs", query], queryFn: ({ signal }) => call("adminUserLogs", { signal, ...(query ? { query } : {}) }), retry: false, staleTime: 0 });
  const items = (q.data?.items ?? []) as Row[];
  return (
    <section className="grid gap-4" data-testid="admin-userlogs">
      <div className="flex flex-wrap items-center gap-3"><h2 className="m-0 flex-1 text-[1.3rem]">Aktivitäts-Log</h2><Refresh busy={q.isFetching} onClick={() => void q.refetch()} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select id="ulog-event" label="Ereignis" value={event} onChange={setEvent} options={USER_EVENTS} />
        <Field id="ulog-dealid" label="Deal-ID" inputMode="numeric" value={deal} onChange={(e) => setDeal(e.target.value)} placeholder="Deal-ID…" />
      </div>
      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      <Table label="Aktivitäts-Log" head={["Zeit", "Ereignis", "Deal", "Angebot", "Typ", "Meldung"]}>
        {q.isPending ? <Empty cols={6}>Lade …</Empty> : !items.length ? <Empty cols={6}>Keine Einträge in den letzten 180 Tagen.</Empty> : items.map((it, i) => (
          <tr key={String(it._id ?? i)}>
            <td className={`${TD} whitespace-nowrap`}>{fmtTs(it.createdAt)}</td>
            <td className={TD}><Badge tone={EVENT_TONE[String(it.event)] ?? "neutral"}>{String(it.event ?? "")}</Badge></td>
            <td className={TD}>{String(it.dealId || "-")}</td>
            <td className={TD}>{String(it.offerNumber || "-")}</td>
            <td className={TD}>{String(it.offerType || "-")}</td>
            <td className={`${TD} break-words`}>{String(it.message || "")}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

// ---------- PDF-Engine ----------
export function PdfStatsPage() {
  const [days, setDays] = useState("30");
  const q = useQuery({ queryKey: ["admin", "pdf-stats", days], queryFn: ({ signal }) => call("adminPdfStats", { signal, query: `days=${days}` }), retry: false, staleTime: 0 });
  const d = q.data as unknown as { rows: Row[]; failures: Row[]; saved?: Record<string, { baselineMs: number; measured: boolean; ms: number }> } | undefined;
  return (
    <section className="grid gap-4" data-testid="admin-pdf">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="m-0 flex-1 text-[1.3rem]">PDF-Engine</h2>
        <Select id="pdf-days" label="Zeitraum" value={days} onChange={setDays} options={PDF_DAYS.map((n) => ({ value: String(n), label: `Letzte ${n} Tage` }))} />
        <Refresh busy={q.isFetching} onClick={() => void q.refetch()} />
      </div>
      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      {d ? (
        <>
          <Stats items={pdfSummary(d as never)} />
          <p className="m-0 text-[0.95rem] text-muted-foreground">{pdfBaseline(d as never)}</p>
          <Table label="PDF je Art und Engine" head={["Art", "Engine", "Anzahl", "Fehler", "Ø Dauer", "Max", "Zuletzt"]}>
            {!d.rows.length ? <Empty cols={7}>Noch keine PDFs im Zeitraum.</Empty> : sortPdfRows(d.rows as { kind: string; engine: string }[]).map((r: Row) => (
              <tr key={`${r.kind}-${r.engine}`}>
                <td className={TD}>{PDF_KIND[r.kind] ?? r.kind}</td>
                <td className={TD}><Badge tone={r.engine === "gotenberg" ? "ok" : r.engine === "fallback" ? "bad" : "neutral"}>{PDF_ENGINE[r.engine] ?? r.engine}</Badge></td>
                <td className={TD}>{r.total}</td>
                <td className={TD}>{r.failed ? <Badge tone="bad">{r.failed}</Badge> : 0}</td>
                <td className={TD}>{fmtMs(r.avgMs)}</td>
                <td className={TD}>{fmtMs(r.maxMs)}</td>
                <td className={`${TD} whitespace-nowrap`}>{fmtTs(r.last)}</td>
              </tr>
            ))}
          </Table>
          <h3 className="m-0">Fehler &amp; Fallbacks</h3>
          <Table label="Fehler und Fallbacks" head={["Zeit", "Art", "Engine", "Dauer", "Fehler"]}>
            {!d.failures.length ? <Empty cols={5}>Keine Fehler im Zeitraum.</Empty> : d.failures.map((f, i) => (
              <tr key={i}>
                <td className={`${TD} whitespace-nowrap`}>{fmtTs(f.createdAt)}</td>
                <td className={TD}>{PDF_KIND[f.kind] ?? f.kind}</td>
                <td className={TD}><Badge tone={f.engine === "gotenberg" ? "warn" : "bad"}>{f.engine === "gotenberg" ? "Gotenberg → Fallback" : "Lokal fehlgeschlagen"}</Badge></td>
                <td className={TD}>{fmtMs(f.ms)}</td>
                <td className={`${TD} break-words`}>{String(f.error ?? "")}</td>
              </tr>
            ))}
          </Table>
        </>
      ) : q.isPending ? <p className="text-muted-foreground">Lade …</p> : null}
    </section>
  );
}
