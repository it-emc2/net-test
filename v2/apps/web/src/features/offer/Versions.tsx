// „Versionen“ (UX-CHANGES U-062): the saved versions of the open offer's draft in a panel of the
// header — a native <dialog> (Esc and a tap outside close it) — with „Wiederherstellen“ behind a
// question. Opened from the header (SaveState.tsx) and the step drawer (versions-panel.ts).
// Rules and texts: model/versions.ts; actions: model/useVersions.ts.
import type { DealDraftRevision } from "@oc/api-contract";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, History, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Button, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { useSaveStatus } from "./model/draft.js";
import { useOfferStore } from "./model/store.js";
import { variantSearch } from "./model/variants.js";
import { TEXT, canRestore, heading, offerOpenPath, rowLabel, sentNumberOf } from "./model/versions.js";
import { closeVersionsPanel } from "./model/versions-panel.js";
import { keepMine, loadNewest, refreshVersions, restoreVersion, useVersionList, type Outcome } from "./model/useVersions.js";

export default function VersionsPanel() {
  const ref = useRef<HTMLDialogElement>(null);
  const dealId = useOfferStore((s) => s.dealId);
  const [ask, setAsk] = useState<DealDraftRevision | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    return () => { if (d?.open) { if (d.close) d.close(); else d.removeAttribute("open"); } };
  }, []);
  useEffect(() => () => closeVersionsPanel(), []); // leaving the offer: the panel does not come back with the next one
  if (!dealId) return null;
  return (
    <dialog
      ref={ref} aria-labelledby="versions-title" data-testid="versions-panel" data-mode={ask ? "ask" : "list"}
      onClose={closeVersionsPanel} onCancel={(e) => { e.preventDefault(); closeVersionsPanel(); }}
      onClick={(e) => { if (e.target === e.currentTarget) closeVersionsPanel(); }}
      className="fixed inset-x-auto right-3 top-[4.25rem] m-0 max-h-[calc(100dvh-5.5rem)] w-[560px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/30"
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-start gap-2">
          <History aria-hidden className="mt-3 size-5 shrink-0 text-muted-foreground" />
          <h2 id="versions-title" className="m-0 flex-1 self-center text-[1.1rem] font-bold leading-snug">{ask ? TEXT.askTitle(ask.revision) : heading(dealId)}</h2>
          <button type="button" aria-label={TEXT.close} onClick={closeVersionsPanel} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"><X aria-hidden className="size-5" /></button>
        </div>
        {ask ? <Ask r={ask} onBack={() => setAsk(null)} /> : <List onAsk={setAsk} />}
      </div>
    </dialog>
  );
}

function List({ onAsk }: { onAsk: (r: DealDraftRevision) => void }) {
  const q = useVersionList(true);
  const status = useSaveStatus();
  const conflict = status.state === "conflict";
  const data = q.data;
  const current = data?.current?.revision ?? null;
  return (
    <>
      <p className="m-0 text-muted-foreground">{TEXT.lead}</p>
      {conflict ? <ConflictChoices newest={data?.current ?? null} /> : null}
      <div className="grid gap-2" aria-busy={q.isPending} data-testid="versions-list">
        {q.isPending ? <p className="m-0" role="status">{TEXT.loading}</p>
          : !data || data.revisions === null ? <p className="m-0" role="status" data-part="offline">{TEXT.offline}</p>
          : data.revisions.length === 0 ? <p className="m-0" data-part="none">{TEXT.none}</p>
          : (
            <ul className="m-0 grid list-none gap-2 p-0">
              {data.revisions.map((r) => {
                const now = !canRestore(r, current);
                return (
                  <li key={r.revision} data-testid="version-row" data-revision={r.revision} aria-current={now ? "true" : undefined}
                    className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border px-3 py-2", now ? "border-accent bg-accent-weak" : "border-border")}>
                    <span className="min-w-0 flex-[1_1_16rem] break-words text-[0.95rem]" data-part="label">{rowLabel(r, current)}</span>
                    {now ? null : (
                      <Button variant="outline" className="shrink-0" data-action="restore" aria-label={`${TEXT.restore}: Version ${r.revision}`} onClick={() => onAsk(r)}>
                        <RotateCcw aria-hidden className="size-4" />{TEXT.restore}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </div>
      <div className="flex justify-end"><Button variant="outline" onClick={closeVersionsPanel}>{TEXT.close}</Button></div>
    </>
  );
}

/** say how it went: success as a toast (the panel closes), a failure stays in the panel */
function useFinish() {
  const qc = useQueryClient();
  return (o: Outcome, setError: (m: string) => void, setSent?: (nr: string) => void) => {
    void refreshVersions(qc);
    if (o.ok) { toast.dismiss("save"); toast.success(o.message, o.detail ? { description: o.detail } : undefined); closeVersionsPanel(); }
    else { setError(o.message); setSent?.(o.sentOffer ?? ""); }
  };
}

function ConflictChoices({ newest }: { newest: { revision: number; updatedAt: string | Date } | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const finish = useFinish();
  const run = async (fn: () => Promise<Outcome>) => { if (busy) return; setBusy(true); setError(""); finish(await fn(), setError); setBusy(false); };
  return (
    <div className="grid gap-2 rounded-xl border-2 border-[#d97706] p-3" data-testid="versions-conflict">
      <p className="m-0 font-semibold">{TEXT.conflict}</p>
      <Button variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" disabled={busy} data-action="keep-mine" onClick={() => void run(keepMine)}>{TEXT.keepMine}</Button>
      {newest ? <Button variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" disabled={busy} data-action="load-newest" onClick={() => void run(loadNewest)}>{TEXT.loadNewest(newest.revision, newest.updatedAt)}</Button> : null}
      {error ? <Alert kind="error" className="my-0">{error}</Alert> : null}
    </div>
  );
}

function Ask({ r, onBack }: { r: DealDraftRevision; onBack: () => void }) {
  const dirty = useOfferStore((s) => s.version !== s.savedVersion);
  const sent = useOfferStore((s) => sentNumberOf(s.offer));
  const navigate = useNavigate();
  const finish = useFinish();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentOffer, setSentOffer] = useState(""); // U-074: refused — the sent offer opens from the Hauptmenü
  const yes = async () => {
    if (busy) return;
    setBusy(true); setError(""); setSentOffer("");
    const s = useOfferStore.getState();
    const o = await restoreVersion(r, (type) => navigate(`/deal/${encodeURIComponent(s.dealId!)}/${type}${variantSearch(s.variantKnown ? s.variantId : null)}`));
    setBusy(false);
    finish(o, setError, setSentOffer);
  };
  if (sentOffer) {
    return (
      <div className="grid gap-3" data-testid="versions-sent-refused">
        <Alert kind="error" className="my-0">{error}</Alert>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onBack}>{TEXT.back}</Button>
          <Button data-action="open-sent" onClick={() => { closeVersionsPanel(); navigate(offerOpenPath(sentOffer)); }}><FileText aria-hidden className="size-4" />{TEXT.openSent(sentOffer)}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3" data-testid="versions-ask">
      <p className="m-0">{TEXT.askText(r)}</p>
      {dirty ? <p className="m-0" data-part="unsaved">{TEXT.askUnsaved}</p> : null}
      {sent ? <p className="m-0 text-muted-foreground" data-part="sent">{TEXT.askSent(sent)}</p> : null}
      {error ? <Alert kind="error" className="my-0">{error}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onBack} disabled={busy}>{TEXT.cancel}</Button>
        <Button data-action="restore-yes" disabled={busy} onClick={() => void yes()}><RotateCcw aria-hidden className="size-4" />{busy ? TEXT.restoring : TEXT.restore}</Button>
      </div>
    </div>
  );
}
