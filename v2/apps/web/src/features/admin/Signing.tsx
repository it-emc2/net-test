// Signing links (today's view "Signatur-Links"): counters per status, search (after the last key
// stroke) and status filter, one row per link with its dates, the signed documents as PDF, "Kopieren"
// and "An Bitrix senden" (asks first; today: no question, a failure as a browser alert).
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Send } from "lucide-react";
import { useState } from "react";
import { ApiFailure, call } from "../../shared/api/index.js";
import { Alert, Button, Field } from "../../shared/ui/index.js";
import { Badge, Confirm, Empty, Refresh, Select, Stats, TD, Table, useSettled } from "./parts.js";
import { SIGN_STATUS, SIGN_STAT_ORDER, fmtTs, queryOf } from "./rules.js";

const failText = (e: unknown) => (e instanceof ApiFailure ? e.message : "Fehler beim Laden.");
type Link = { token: string; offerNumber?: string; customerName?: string; customerEmail?: string; customerType?: string; status: string; signedCount?: number; docCount?: number;
  documents?: { key: string; status: string }[]; createdAt?: string; openedAt?: string | null; completedAt?: string | null; expiresAt?: string | null };
const TONE: Record<string, "ok" | "warn" | "bad" | "neutral"> = { completed: "ok", partially_signed: "warn", opened: "warn", expired: "bad", sent: "neutral" };

function CopyButton({ link }: { link: string }) {
  const [state, setState] = useState<"" | "done" | "show">("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setState("done"); setTimeout(() => setState(""), 1500); }
    catch { setState("show"); } // today: a prompt with the link; here the link is shown to copy by hand
  };
  return (
    <div className="grid gap-1">
      <Button variant="outline" onClick={() => void copy()} aria-label={`Link kopieren: ${link}`}>{state === "done" ? <><Check aria-hidden />Kopiert</> : <><Copy aria-hidden />Kopieren</>}</Button>
      {state === "show" ? <input readOnly value={link} aria-label="Link zum Kopieren" onFocus={(e) => e.target.select()} className="min-h-11 rounded border border-input bg-card px-2 text-[0.85rem]" /> : null}
    </div>
  );
}

export function SigningPage() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const q0 = useSettled(text.trim());
  const query = queryOf([["q", q0], ["status", status]]);
  const q = useQuery({ queryKey: ["admin", "signing", query], queryFn: ({ signal }) => call("adminSigning", { signal, ...(query ? { query } : {}) }), retry: false, staleTime: 0 });
  const [ask, setAsk] = useState<Link | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const items = (q.data?.items ?? []) as Link[];
  const counts = (q.data as { counts?: Record<string, number> } | undefined)?.counts ?? {};
  const origin = typeof location === "undefined" ? "" : location.origin;

  const send = async (it: Link) => {
    setBusy(true);
    try {
      const r = await call("adminSigningSendBitrix", { params: { token: it.token } });
      setSent((s) => ({ ...s, [it.token]: (r.sent ?? []).length }));
      setMsg({ ok: true, text: `${it.offerNumber || "Angebot"}: ${(r.sent ?? []).length} Dokument(e) an Bitrix gesendet.` });
    } catch (e) { setMsg({ ok: false, text: failText(e) || "Fehler beim Senden." }); }
    setBusy(false); setAsk(null);
  };

  return (
    <section className="grid gap-4" data-testid="admin-signing">
      <div className="flex flex-wrap items-center gap-3"><h2 className="m-0 flex-1 text-[1.3rem]">Signatur-Links</h2><Refresh busy={q.isFetching} onClick={() => void q.refetch()} /></div>
      <Stats items={SIGN_STAT_ORDER.map((s) => ({ value: counts[s] || 0, label: SIGN_STATUS[s]! }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="sign-q" label="Suche" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Angebot, Name, E-Mail" />
        <Select id="sign-status" label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "Alle Status" }, ...SIGN_STAT_ORDER.map((s) => ({ value: s, label: SIGN_STATUS[s]! }))]} />
      </div>
      {msg ? <Alert kind={msg.ok ? "info" : "error"}>{msg.text}</Alert> : null}
      {q.error ? <Alert kind="error">{failText(q.error)}</Alert> : null}
      <Table label="Signatur-Links" head={["Angebot", "Kunde", "Typ", "Status", "Dok.", "Gesendet", "Geöffnet", "Unterschrieben", "Gültig bis", "PDF", ""]}>
        {q.isPending ? <Empty cols={11}>Lade …</Empty> : !items.length ? <Empty cols={11}>Keine Signatur-Links gefunden.</Empty> : items.map((it) => {
          const signed = (it.documents ?? []).filter((d) => d.status === "signed");
          return (
            <tr key={it.token}>
              <td className={TD}><strong>{it.offerNumber || "–"}</strong></td>
              <td className={TD}><div>{it.customerName || "–"}</div><div className="break-all text-[0.85rem] text-muted-foreground">{it.customerEmail || ""}</div></td>
              <td className={TD}><Badge>{it.customerType === "KASSE" ? "Kasse" : "SZ"}</Badge></td>
              <td className={TD}><Badge tone={TONE[it.status] ?? "neutral"}>{SIGN_STATUS[it.status] ?? it.status}</Badge></td>
              <td className={TD}>{it.signedCount ?? 0}/{it.docCount ?? 0}</td>
              <td className={`${TD} whitespace-nowrap`}>{fmtTs(it.createdAt)}</td>
              <td className={`${TD} whitespace-nowrap`}>{fmtTs(it.openedAt)}</td>
              <td className={`${TD} whitespace-nowrap`}>{fmtTs(it.completedAt)}</td>
              <td className={`${TD} whitespace-nowrap`}>{fmtTs(it.expiresAt)}</td>
              <td className={TD}>
                {signed.length ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {signed.map((d) => (
                      <a key={d.key} className="inline-flex min-h-11 items-center text-primary underline" target="_blank" rel="noopener"
                        href={`/admin/api/signing/${encodeURIComponent(it.token)}/documents/${encodeURIComponent(d.key)}/pdf`}>{d.key}</a>
                    ))}
                  </div>
                ) : "–"}
              </td>
              <td className={TD}>
                <div className="grid gap-2">
                  <CopyButton link={`${origin}/sign/${it.token}`} />
                  {signed.length ? (
                    sent[it.token] !== undefined
                      ? <Badge tone="ok">Gesendet ({sent[it.token]})</Badge>
                      : <Button variant="outline" onClick={() => { setMsg(null); setAsk(it); }} aria-label={`${it.offerNumber || it.token} an Bitrix senden`}><Send aria-hidden />An Bitrix senden</Button>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      {ask ? (
        <Confirm title="Unterschriebene Dokumente an Bitrix senden?" confirmLabel="An Bitrix senden" busy={busy} onConfirm={() => void send(ask)} onCancel={() => setAsk(null)}>
          <p className="m-0">Die unterschriebenen Dokumente von <strong>{ask.offerNumber || "–"}</strong> ({(ask.documents ?? []).filter((d) => d.status === "signed").map((d) => d.key).join(", ")}) werden im Bitrix-Deal abgelegt.</p>
        </Confirm>
      ) : null}
    </section>
  );
}
