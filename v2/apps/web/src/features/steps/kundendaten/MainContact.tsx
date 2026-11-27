// The question about the deal's main contact, asked when Kundendaten is left (rules: main-contact.ts).
// Registered with the frame as the step's question (setStepLeave): nothing to ask → the way goes on
// at once; never blocked by Bitrix. The Bitrix write runs right after the answer; while it runs the
// answers are disabled; a failure is said in German and „Trotzdem weiter“ goes on anyway.
import { ERROR_CODES } from "@oc/api-contract";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiFailure, call, dealCustomerKey } from "../../../shared/api/index.js";
import { Alert, Button } from "../../../shared/ui/index.js";
import { toast } from "../../../shared/ui/toaster.js";
import { setStepLeave, useOfferStore } from "../../offer/index.js";
import { KEPT, TEXT, contactPersonChanges, keptOf, mainContactQuestion, newContactFields, personOf, type MainContactQuestion } from "./main-contact.js";
import { dealNumber } from "./uploads.js";

const KD = "Kundendaten";
type Fields = Record<string, unknown>;
interface Open { question: MainContactQuestion; dealId: string; go: () => void }

/** what to ask now (from the store and the deal's customer already loaded — no request of its own) */
function questionNow(qc: QueryClient): { question: MainContactQuestion; dealId: string } | null {
  const st = useOfferStore.getState();
  const offer = st.offer as Record<string, any> | null;
  if (!offer) return null;
  const dealId = dealNumber(offer, st.dealId);
  const question = mainContactQuestion({ dealId, deal: qc.getQueryData(dealCustomerKey(dealId)), kd: offer.Kundendaten ?? {}, kept: offer[KEPT] });
  return question ? { question, dealId } : null;
}

export function MainContactQuestionHost() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Open | null>(null);
  useEffect(() => {
    setStepLeave("Kundendaten", (go) => {
      const q = questionNow(qc);
      if (!q) return false;
      setOpen({ ...q, go });
      return true;
    });
    return () => setStepLeave("Kundendaten", null);
  }, [qc]);
  if (!open) return null;
  return <MainContactDialog key={`${open.dealId}|${open.question.contactId}`} open={open} onClose={() => setOpen(null)} />;
}

function MainContactDialog({ open, onClose }: { open: Open; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const { question: q, dealId } = open;
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    return () => { if (d?.open) { if (d.close) d.close(); else d.removeAttribute("open"); } };
  }, []);
  const close = () => { if (!busy) onClose(); };
  const goOn = () => { onClose(); open.go(); };
  const still = () => dealNumber(useOfferStore.getState().offer as Fields | null, useOfferStore.getState().dealId) === dealId;

  const keep = () => {
    const kd = ((useOfferStore.getState().offer as Record<string, any> | null)?.Kundendaten ?? {}) as Fields;
    useOfferStore.getState().setTop({ [KEPT]: keptOf(q.contactId, kd) });
    goOn();
  };
  const write = async (mode: "replace" | "rename") => {
    const st = useOfferStore.getState();
    const kd = ((st.offer as Record<string, any> | null)?.Kundendaten ?? {}) as Fields;
    setBusy(true);
    setFailure("");
    // „Andere Person“: in the offer the Bitrix contact is the Ansprechpartner, whatever Bitrix answers
    if (mode === "replace") { const cp = contactPersonChanges(kd, q.customer); if (Object.keys(cp).length) st.patch(KD as never, cp as never); }
    try {
      const r = await call("changeMainContact", { params: { id: dealId }, body: { mode, expectedContactId: q.contactId, person: personOf(kd) } });
      if (!still()) return;
      if (mode === "replace") useOfferStore.getState().patch(KD as never, newContactFields(r.contactId) as never);
      void qc.invalidateQueries({ queryKey: dealCustomerKey(dealId) }); // the comparison is made with Bitrix's new state
      toast.success(mode === "replace" ? TEXT.doneReplace : TEXT.doneRename);
      setBusy(false);
      goOn();
    } catch (err) {
      if (!still()) return;
      const api = err instanceof ApiFailure ? err : null;
      if (api?.code === ERROR_CODES.MAIN_CONTACT_CHANGED) void qc.invalidateQueries({ queryKey: dealCustomerKey(dealId) });
      setFailure(api?.code === ERROR_CODES.MAIN_CONTACT_AMBIGUOUS ? TEXT.ambiguous
        : api && [ERROR_CODES.MAIN_CONTACT_CHANGED, ERROR_CODES.MAIN_CONTACT_FAILED, ERROR_CODES.DEAL_NOT_FOUND].includes(api.code as never) ? `${api.message} Sie können trotzdem weitermachen.`
        : TEXT.failed);
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref} aria-labelledby="kd-main-contact-title" data-testid="kd-main-contact" data-busy={busy || undefined}
      onClose={close} onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[520px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 id="kd-main-contact-title" className="m-0 flex-1 text-[1.15rem] font-bold">{TEXT.title}</h2>
          <button type="button" aria-label={TEXT.close} disabled={busy} onClick={close} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"><X aria-hidden className="size-5" /></button>
        </div>
        <p className="m-0 text-muted-foreground">{TEXT.lead}</p>
        <dl className="m-0 grid gap-2 sm:grid-cols-2" data-testid="kd-main-contact-names">
          <div className="grid rounded-xl border border-border p-3"><dt className="text-[0.9rem] text-muted-foreground">{TEXT.inBitrix}</dt><dd className="m-0 break-words font-semibold" data-part="bitrix">{q.bitrix}</dd></div>
          <div className="grid rounded-xl border border-border p-3"><dt className="text-[0.9rem] text-muted-foreground">{TEXT.inOffer}</dt><dd className="m-0 break-words font-semibold" data-part="offer">{q.offer}</dd></div>
        </dl>
        {failure ? <Alert kind="error" className="my-0">{failure}</Alert> : null}
        {busy ? <p className="m-0 text-muted-foreground" role="status">{TEXT.running}</p> : null}
        <div className="grid gap-2">
          <Button size="lg" className="h-auto min-h-12 justify-start whitespace-normal text-left" disabled={busy} data-action="replace" onClick={() => void write("replace")}>{TEXT.replace}</Button>
          <p className="m-0 text-[0.95rem] text-muted-foreground">{TEXT.replaceHint}</p>
          <Button size="lg" variant="outline" className="h-auto min-h-12 justify-start whitespace-normal text-left" disabled={busy} data-action="rename" onClick={() => void write("rename")}>{TEXT.rename}</Button>
          <p className="m-0 text-[0.95rem] text-muted-foreground">{TEXT.renameHint}</p>
          <Button size="lg" variant="outline" className="h-auto min-h-12 justify-start" disabled={busy} data-action="keep" onClick={keep}>{TEXT.keep}</Button>
          {failure ? <Button size="lg" variant="secondary" className="justify-self-end" disabled={busy} data-action="go-on" onClick={goOn}>{TEXT.goOn}</Button> : null}
        </div>
      </div>
    </dialog>
  );
}
