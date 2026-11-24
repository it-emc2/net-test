// „Weiteres Angebot für diesen Kunden“ (ADR 027 B, step 2; UX-CHANGES U-046): the button (header
// panel, Versand page), the dialog (type → confirmation → creation / result), and the list
// „Weitere Angebote dieses Kunden“. The dialog is one native <dialog> opened through
// `openSecondOffer`; it is mounted by the offer header (VariantSwitch) and by the Hauptmenü
// (planning), never both at once. Rules and texts: model/second-offer.ts.
import type { DealRelation } from "@oc/api-contract";
import type { NewOfferType } from "@oc/domain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { create } from "zustand";
import { call } from "../../shared/api/index.js";
import { Alert, Button, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { useOfferStore } from "./model/store.js";
import { saveOpen } from "./model/useVariants.js";
import {
  TEXT, customerName, dropPending, isDefinite, keepPending, mergeRelated, newCreationId, otherTypes, outcomeOf, readPending,
  relatedOfType, relatedStatusText, typeTitle, type Outcome, type RelatedRow,
} from "./model/second-offer.js";

/** where the second offer comes from */
export interface SecondOfferSource {
  dealId: string;
  type: NewOfferType;
  /** the source variant (default on the server: the variant opened last) */
  variantId?: string | undefined;
  /** „Erika Muster“ — shown in the confirmation */
  customer: string;
  /** opened from the open offer (its pending changes are saved first; „Variante erstellen“ is offered) */
  inOffer: boolean;
  /** the relations known when the dialog opens (the draft's `related`) */
  related?: readonly DealRelation[];
}
interface DialogState { source: SecondOfferSource | null; target: NewOfferType | null; set: (source: SecondOfferSource | null, target?: NewOfferType | null) => void }
const useDialog = create<DialogState>((set) => ({ source: null, target: null, set: (source, target = null) => set({ source, target }) }));
/** opens the dialog; `target` given (planning): straight to the confirmation */
export const openSecondOffer = (source: SecondOfferSource, target?: NewOfferType) => useDialog.getState().set(source, target ?? null);

/** the open offer as the source */
export function sourceOfOpenOffer(): SecondOfferSource | null {
  const s = useOfferStore.getState();
  if (!s.offer || !s.dealId) return null;
  return {
    dealId: s.dealId, type: s.offer.activeOffer as NewOfferType, variantId: s.variantKnown && s.variantId ? s.variantId : undefined,
    customer: customerName((s.offer as Record<string, any>).Kundendaten), inOffer: true, related: s.related,
  };
}

export const relatedKey = (dealId: string | null) => ["related", dealId] as const;
const isTemp = (dealId: string | null | undefined) => !dealId || dealId.startsWith("t-");
/** the related deals of `dealId`: the draft's relations plus GET /related (status); asked only where shown, again on window focus */
export function useRelated(dealId: string | null, enabled: boolean, fromDraft: readonly DealRelation[] = []) {
  const q = useQuery({
    queryKey: relatedKey(dealId), enabled: enabled && !isTemp(dealId), retry: false, staleTime: 5_000, refetchOnWindowFocus: true,
    queryFn: ({ signal }) => call("dealRelated", { params: { dealId: dealId! }, signal }),
  });
  return { rows: mergeRelated(fromDraft, q.data?.related), failed: q.isError, query: q };
}

/** open a related deal: the open offer is saved first (never lose input) */
function useOpenRelated() {
  const navigate = useNavigate();
  return async (r: Pick<RelatedRow, "dealId" | "offerType">, inOffer: boolean): Promise<boolean> => {
    if (inOffer) {
      const problem = await saveOpen();
      if (problem) { toast.error(TEXT.notSavedOpen, { description: problem }); return false; }
    }
    navigate(`/deal/${r.dealId}/${r.offerType}`);
    return true;
  };
}

/** the small count on the header's variant pill (no request: the draft's relations and what was asked already) */
export function useRelatedCount(): number {
  const dealId = useOfferStore((s) => s.dealId);
  const fromDraft = useOfferStore((s) => s.related);
  return useRelated(dealId, false, fromDraft).rows.length;
}

/** „Weiteres Angebot für diesen Kunden“ — disabled with the reason while the offer has no deal number */
export function SecondOfferButton({ place, onOpen }: { place: string; onOpen?: () => void }) {
  const temp = useOfferStore((s) => isTemp(s.dealId));
  return (
    <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1" data-testid="second-offer-entry" data-place={place}>
      {/* may wrap: in the 400 px panel the label is wider than one line */}
      <Button variant="outline" aria-label={TEXT.button} className="h-auto min-h-12 !whitespace-normal py-2 text-center" data-action="second-offer" data-place={place} disabled={temp} aria-describedby={temp ? `second-offer-reason-${place}` : undefined}
        onClick={() => { const src = sourceOfOpenOffer(); if (!src) return; onOpen?.(); openSecondOffer(src); }}>
        <FilePlus2 aria-hidden className="size-4" /><span data-part="label">{TEXT.button}</span>
      </Button>
      {temp ? <span id={`second-offer-reason-${place}`} className="text-[0.9rem] text-muted-foreground" data-part="reason">{TEXT.tempReason}</span> : null}
    </span>
  );
}

/** „Weitere Angebote dieses Kunden“ in the header panel: the related deals and the button */
export function RelatedSection({ onLeave }: { onLeave: () => void }) {
  const dealId = useOfferStore((s) => s.dealId);
  const fromDraft = useOfferStore((s) => s.related);
  const { rows, failed } = useRelated(dealId, true, fromDraft);
  const open = useOpenRelated();
  const [busy, setBusy] = useState("");
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-t border-border pt-3" aria-labelledby="related-title" data-testid="related-section">
      <h3 id="related-title" className="m-0 text-[1rem] font-bold">{TEXT.relatedTitle}</h3>
      {failed ? <p className="m-0 text-[0.9rem] text-muted-foreground" role="status">{TEXT.relatedFailed}</p> : null}
      {rows.length ? (
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="related-list">
          {rows.map((r) => (
            <li key={r.dealId}>
              <button type="button" data-testid="related-row" data-deal={r.dealId} data-status={r.status ?? ""} disabled={!!busy}
                onClick={async () => { if (busy) return; setBusy(r.dealId); const ok = await open(r, true); setBusy(""); if (ok) onLeave(); }}
                className="grid min-h-14 w-full cursor-pointer content-center gap-0.5 rounded-xl border border-border bg-transparent px-3 py-2 text-left text-foreground hover:bg-muted disabled:opacity-60">
                <strong data-part="title">{typeTitle(r.offerType)} · {TEXT.relatedDeal(r.dealId)}</strong>
                {busy === r.dealId ? <span className="text-[0.9rem] text-muted-foreground">Wird geöffnet …</span>
                  : relatedStatusText(r.status) ? <span data-part="status" className={cn("text-[0.9rem] text-muted-foreground", r.status === "signed" && "font-semibold text-[#15803d]", r.status === "not-chosen" && "font-semibold text-[#b45309]")}>{relatedStatusText(r.status)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <SecondOfferButton place="panel" onOpen={onLeave} />
    </section>
  );
}

type Step = "type" | "confirm" | "result";

/** the dialog; renders nothing while closed */
export function SecondOfferHost({ onCreateVariant }: { onCreateVariant?: () => void }) {
  const source = useDialog((d) => d.source);
  const target = useDialog((d) => d.target);
  useEffect(() => () => useDialog.getState().set(null), []); // the host leaves (another page): the dialog does not come back
  if (!source) return null;
  return <SecondOfferDialog key={`${source.dealId}|${target ?? ""}`} source={source} target={target} onCreateVariant={onCreateVariant} />;
}

function SecondOfferDialog({ source, target, onCreateVariant }: { source: SecondOfferSource; target: NewOfferType | null; onCreateVariant?: (() => void) | undefined }) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pending = useRef(readPending(source.dealId)).current;
  // one creation id per opened dialog — or the open creation kept on this device for this deal
  const id = useRef(pending?.creationId ?? newCreationId());
  const running = useRef(false);
  const [step, setStep] = useState<Step>(pending ? "result" : target ? "confirm" : "type");
  const [type, setType] = useState<NewOfferType | null>(pending?.offerType ?? target);
  const [outcome, setOutcome] = useState<Outcome | null>(pending?.outcome ?? null);
  const [busy, setBusy] = useState<"" | "create" | "check">("");
  const [note, setNote] = useState("");
  const { rows } = useRelated(source.dealId, true, source.related ?? []);
  const openRelated = useOpenRelated();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    return () => { if (d?.open) { if (d.close) d.close(); else d.removeAttribute("open"); } };
  }, []);
  const close = () => {
    if (running.current) return; // while the request runs the dialog stays
    if (isDefinite(outcome)) dropPending(source.dealId); // nothing open: the next dialog starts a new creation
    useDialog.getState().set(null);
  };

  const run = async (checkBitrix: boolean) => {
    if (running.current || !type) return; // a double tap sends once
    if (typeof navigator !== "undefined" && navigator.onLine === false) { setNote(TEXT.offline); return; }
    running.current = true; setBusy(checkBitrix ? "check" : "create"); setNote("");
    try {
      let variantId = source.variantId;
      if (source.inOffer) {
        // pending changes of the open offer go to the server first: the copy is made of what is saved
        const problem = await saveOpen(true);
        if (problem) { setNote(TEXT.notSaved(problem)); return; }
        const s = useOfferStore.getState();
        if (s.dealId === source.dealId && s.variantKnown && s.variantId) variantId = s.variantId;
      }
      try {
        const r = await call("createSecondOffer", { params: { dealId: source.dealId }, body: { offerType: type, creationId: id.current, ...(variantId ? { variantId } : {}), ...(checkBitrix ? { checkBitrix: true } : {}) } });
        dropPending(source.dealId);
        void qc.invalidateQueries({ queryKey: relatedKey(source.dealId) });
        navigate(`/deal/${r.dealId}/${r.offerType}/Kundendaten`); // while this dialog is still mounted, then close
        running.current = false;
        useDialog.getState().set(null);
        toast.success(TEXT.created(r.dealId), r.comments === "failed" ? { description: TEXT.commentsFailed, duration: 10_000 } : undefined);
      } catch (err) {
        const o = outcomeOf(err);
        setOutcome(o); setStep("result");
        if (isDefinite(o)) dropPending(source.dealId); else keepPending({ creationId: id.current, sourceDealId: source.dealId, offerType: type, outcome: o });
      }
    } finally { running.current = false; setBusy(""); }
  };

  const title = step === "confirm" ? TEXT.confirmTitle : step === "result" && outcome?.kind === "unclear" ? TEXT.unclearTitle : TEXT.title;
  return (
    <dialog
      ref={ref} aria-labelledby="second-offer-title" data-testid="second-offer-dialog" data-step={step} data-busy={busy || undefined}
      onClose={close} onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[480px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40"
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 id="second-offer-title" className="m-0 flex-1 text-[1.15rem] font-bold">{title}</h2>
          <button type="button" aria-label={TEXT.close} disabled={!!busy} onClick={close} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50"><X aria-hidden className="size-5" /></button>
        </div>
        {note ? <Alert kind="error" className="my-0">{note}</Alert> : null}

        {step === "type" ? (
          <>
            <p className="m-0 text-muted-foreground">{TEXT.chooseLead}</p>
            <ul className="m-0 grid list-none gap-2 p-0" data-testid="second-offer-types">
              {otherTypes(source.type).map((t) => {
                const has = relatedOfType(rows, t);
                if (!has) return (
                  <li key={t}><Button variant="outline" size="lg" className="w-full justify-start" data-type={t} onClick={() => { setType(t); setNote(""); setStep("confirm"); }}>{typeTitle(t)}</Button></li>
                );
                return (
                  <li key={t} data-type={t} data-exists={has.dealId} className="grid gap-2 rounded-xl border border-border p-3">
                    <span className="grid"><strong>{typeTitle(t)}</strong><span className="text-[0.9rem] text-muted-foreground" data-part="exists">{TEXT.exists(has.dealId)}</span></span>
                    <span className="flex flex-wrap gap-2">
                      <Button data-action="open-related" onClick={async () => { if (await openRelated(has, source.inOffer)) useDialog.getState().set(null); }}>{TEXT.open}</Button>
                      <Button variant="outline" data-action="create-anyway" onClick={() => { setType(t); setNote(""); setStep("confirm"); }}>{TEXT.createAnyway}</Button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="grid gap-2 border-t border-border pt-3" data-testid="second-offer-same-type">
              <p className="m-0 text-[0.95rem] text-muted-foreground">{TEXT.sameTypeHint(typeTitle(source.type))}</p>
              {source.inOffer && onCreateVariant ? <Button variant="outline" className="justify-self-start" data-action="create-variant" onClick={() => { useDialog.getState().set(null); onCreateVariant(); }}>{TEXT.createVariant}</Button> : null}
            </div>
          </>
        ) : null}

        {step === "confirm" && type ? (
          <>
            <ul className="m-0 grid gap-2 pl-5" data-testid="second-offer-summary">
              <li>{TEXT.confirmDeal(source.customer)}</li>
              <li><strong>{TEXT.confirmType(typeTitle(type))}</strong></li>
              <li>{TEXT.confirmAuto}</li>
              <li>{TEXT.confirmCopy}</li>
              <li>{TEXT.confirmSource(source.dealId)}</li>
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={!!busy} onClick={close}>{TEXT.cancel}</Button>
              <Button data-action="confirm" disabled={!!busy} onClick={() => void run(false)}>{busy ? TEXT.creating : TEXT.yes}</Button>
            </div>
          </>
        ) : null}

        {step === "result" && type && outcome ? (
          <>
            <p className="m-0 text-muted-foreground">{TEXT.confirmType(typeTitle(type))}</p>
            <Result outcome={outcome} busy={busy} onAgain={(check) => void run(check)} onClose={close} />
          </>
        ) : null}
      </div>
    </dialog>
  );
}

/** the outcome of a call that did not succeed, with exactly the action it allows */
function Result({ outcome, busy, onAgain, onClose }: { outcome: Outcome; busy: string; onAgain: (checkBitrix: boolean) => void; onClose: () => void }) {
  const text = outcome.kind === "unclear" ? TEXT.unclear : outcome.kind === "running" ? `${outcome.message} ${TEXT.running}` : outcome.message;
  const action: { label: string; check: boolean } | null =
    outcome.kind === "unclear" ? { label: TEXT.checkBitrix, check: true }
      : outcome.kind === "running" ? { label: TEXT.checkAgain, check: false }
        : outcome.kind === "final" ? null : { label: TEXT.retry, check: false };
  return (
    <div className="grid gap-3" data-testid="second-offer-result" data-kind={outcome.kind}>
      <Alert kind="error" className="my-0">{text}</Alert>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={!!busy} onClick={onClose}>{TEXT.close}</Button>
        {action ? <Button data-action={action.check ? "check-bitrix" : "again"} disabled={!!busy} onClick={() => onAgain(action.check)}>{busy ? (busy === "check" ? TEXT.checking : TEXT.creating) : action.label}</Button> : null}
      </div>
    </div>
  );
}
