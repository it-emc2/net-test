// "Versandverlauf" (ADR 026, phase 4; UX-CHANGES U-015): what really went out for this offer.
// The rules are history-rules.ts. Asked again after every send or hand-over on this page, and
// when the window comes back to the front (a signature happens in another window).
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiFailure, call } from "../../../shared/api/index.js";
import { cn } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { useOfferStore } from "../../offer/index.js";
import { TEXT, linesOf, type Line } from "./history-rules.js";

type Fields = Record<string, unknown>;
/** a send or hand-over just happened: the list is asked again */
export const historyChanged = () => useOfferStore.getState().remember("sendsStamp", Date.now());
const TONE = { plain: "text-foreground", ok: "text-[#15803d]", bad: "font-semibold text-[#b45309]" } as const;

export function Verlauf() {
  const number = String(useOfferStore((s) => (s.offer as Fields | null)?.offerNumber) ?? "").trim();
  const stamp = useOfferStore((s) => s.scratch.sendsStamp) as number | undefined;
  const [busy, setBusy] = useState("");
  const sends = useQuery<Fields[]>({ queryKey: ["offer-sends", number, stamp ?? 0], enabled: !!number, retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true, placeholderData: (was) => was, // offline: keep what is shown
    queryFn: ({ signal }) => call("offerSends", { params: { offerNumber: number }, signal }).then((r) => (r.sends ?? []) as Fields[]) });
  if (!number || !sends.data) return null; // nothing to tell before the offer has a number
  const lines = linesOf(sends.data);
  const refile = async (id: string) => {
    setBusy(id);
    try { await call("retryBitrix", { params: { sendId: id }, body: {} }); toast.success(TEXT.refiled); }
    catch (err) { toast.error(err instanceof ApiFailure && err.status === 0 ? TEXT.offline : TEXT.refileFailed); }
    finally { setBusy(""); historyChanged(); }
  };
  return (
    <section className="grid gap-2 rounded-xl border border-border bg-card p-4" aria-labelledby="zf-history-title" aria-live="polite" data-testid="zf-history" data-count={sends.data.filter((s) => s.status === "done").length}>
      <h3 id="zf-history-title" className="m-0 text-[1.05rem] font-semibold">Versandverlauf</h3>
      {lines.length ? (
        <ul className="m-0 grid list-none p-0">
          {lines.map((l) => <Row key={l.id} line={l} busy={busy === l.id} onRefile={() => void refile(l.id)} />)}
        </ul>
      ) : <p className="m-0 text-muted-foreground" data-part="empty">{TEXT.empty}</p>}
    </section>
  );
}

function Row({ line, busy, onRefile }: { line: Line; busy: boolean; onRefile: () => void }) {
  return (
    <li data-testid="zf-history-row" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border py-2 first:border-t-0">
      <span className="font-bold whitespace-nowrap" data-part="when">{line.when}</span>
      <span data-part="how">{line.how}</span>
      {line.notes.map((n) => <span key={n.text} data-part="note" data-tone={n.tone} className={TONE[n.tone]}>{n.text}</span>)}
      {line.retry ? <button type="button" disabled={busy} onClick={onRefile} className="inline-flex min-h-12 cursor-pointer items-center border-0 bg-transparent p-0 font-semibold text-primary underline disabled:opacity-60">{busy ? "Wird abgelegt …" : "Ablage wiederholen"}</button> : null}
      {line.files.map((f) => <a key={f.href} href={f.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center font-semibold text-primary underline">{f.label}</a>)}
    </li>
  );
}
