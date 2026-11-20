// The variant selector (ADR 027 A, step 2): a button in the offer header names the open variant;
// it opens one panel (a native <dialog>: Esc and a tap outside close it) with the deal's variants
// — name, total, status — and „Variante erstellen“. Renaming, deleting and creating happen in the
// same panel. The Versand page opens the panel on „Variante erstellen“ too (`openVariantPanel`).
// The name of a variant is internal: it is never part of the offer (payload), a document or a mail.
import type { DealVariant, DealVariantsResponse } from "@oc/api-contract";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CopyPlus, Layers, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { create } from "zustand";
import { euro } from "../../shared/lib/format.js";
import { Alert, Button, Field, cn } from "../../shared/ui/index.js";
import { toast } from "../../shared/ui/toaster.js";
import { useOfferStore } from "./model/store.js";
import { createVariant, deleteVariant, openAsRow, renameVariant, saveOpen, useVariants, useVariantsFollowSends, variantsKey } from "./model/useVariants.js";
import { TEXT, nextVariantName, statusText, variantError, variantSearch } from "./model/variants.js";

type Mode = { kind: "list" } | { kind: "create" } | { kind: "rename"; id: string } | { kind: "delete"; id: string };
interface PanelState { mode: Mode | null; set: (mode: Mode | null) => void }
const usePanel = create<PanelState>((set) => ({ mode: null, set: (mode) => set({ mode }) }));
/** opens the panel (the Versand page: straight to „Variante erstellen“) */
export const openVariantPanel = (kind: "list" | "create" = "list") => usePanel.getState().set({ kind });

/** the open variant's name for the header button */
function useOpenName(): string {
  return useOfferStore((s) => s.variantName || (s.variantId && s.variantId !== "v1" ? "Variante" : "Variante 1"));
}

export function VariantSwitch() {
  const name = useOpenName();
  const open = usePanel((p) => p.mode !== null);
  const qc = useQueryClient();
  useVariantsFollowSends(qc);
  useEffect(() => () => usePanel.getState().set(null), []); // leaving the offer: the panel does not come back with the next one
  return (
    <>
      <button
        type="button" data-testid="variant-switch" aria-haspopup="dialog" aria-expanded={open} aria-label={`Variante: ${name} – Varianten anzeigen`} title={`Variante: ${name}`}
        onClick={() => openVariantPanel("list")}
        className="flex min-h-12 max-w-[11rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.9rem] text-foreground hover:bg-muted"
      >
        <Layers aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate" data-part="name">{name}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? <VariantPanel /> : null}
    </>
  );
}

function VariantPanel() {
  const { mode, set } = usePanel();
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => set(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    return () => { if (d?.open) { if (d.close) d.close(); else d.removeAttribute("open"); } };
  }, []);
  if (!mode) return null;
  return (
    <dialog
      ref={ref} aria-labelledby="variant-panel-title" data-testid="variant-panel" data-mode={mode.kind}
      onClose={close} onCancel={(e) => { e.preventDefault(); close(); }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fixed inset-x-auto right-3 top-[4.25rem] m-0 max-h-[calc(100dvh-5.5rem)] w-[400px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/30"
    >
      <div className="grid gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 id="variant-panel-title" className="m-0 flex-1 text-[1.1rem] font-bold">
            {mode.kind === "create" ? TEXT.createTitle : mode.kind === "rename" ? TEXT.renameTitle : mode.kind === "delete" ? TEXT.removeTitle : TEXT.list}
          </h2>
          <button type="button" aria-label={TEXT.close} onClick={close} className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"><X aria-hidden className="size-5" /></button>
        </div>
        {mode.kind === "list" ? <List /> : mode.kind === "create" ? <CreateForm /> : mode.kind === "rename" ? <RenameForm id={mode.id} /> : <DeleteAsk id={mode.id} />}
      </div>
    </dialog>
  );
}

/** the deal's variants, or the open one alone while the server's list is not known */
function useRows(): { rows: DealVariant[]; failed: boolean } {
  const { query, variants } = useVariants(true);
  const fallback = useOfferStore((s) => s.variantId);
  const s = useOfferStore.getState();
  const rows = variants ?? [openAsRow(s)];
  // the open variant's name may have changed elsewhere: the list is newer
  const mine = variants?.find((v) => v.variantId === fallback);
  useEffect(() => { if (mine && mine.name !== useOfferStore.getState().variantName) useOfferStore.getState().setVariantName(mine.name); }, [mine]);
  return { rows, failed: query.isError };
}

function List() {
  const { rows, failed } = useRows();
  const current = useOfferStore((s) => s.variantId);
  const set = usePanel((p) => p.set);
  const go = useGoTo();
  const [busy, setBusy] = useState("");
  const pick = async (id: string) => {
    if (id === current) { set(null); return; }
    if (busy) return;
    setBusy(id);
    const problem = await saveOpen(); // never lose input: the open variant is saved first
    setBusy("");
    if (problem) { toast.error(TEXT.notSaved, { description: problem }); return; }
    go(id); // navigate while this panel is still mounted (an unmounted component's navigate is ignored), then close
    set(null);
  };
  return (
    <>
      {failed ? <p className="m-0 text-[0.9rem] text-muted-foreground" role="status">{TEXT.listFailed}</p> : null}
      <ul className="m-0 grid list-none gap-2 p-0" data-testid="variant-list">
        {rows.map((v) => {
          const on = v.variantId === current;
          return (
            <li key={v.variantId} data-testid="variant-row" data-variant={v.variantId} data-status={v.status} className={cn("flex items-stretch gap-1 rounded-xl border", on ? "border-accent bg-accent-weak" : "border-border")}>
              <button
                type="button" aria-current={on ? "true" : undefined} disabled={!!busy} onClick={() => void pick(v.variantId)}
                className="grid min-h-14 min-w-0 flex-1 cursor-pointer content-center gap-0.5 rounded-xl border-0 bg-transparent px-3 py-2 text-left text-foreground disabled:opacity-60"
              >
                <span className="flex min-w-0 items-center gap-2"><strong className="truncate" data-part="name">{v.name}</strong>{on ? <span className="shrink-0 text-[0.8rem] text-muted-foreground">({TEXT.open})</span> : null}</span>
                <span className="flex flex-wrap gap-x-3 text-[0.9rem] text-muted-foreground">
                  <span data-part="status" className={cn(v.status === "signed" && "font-semibold text-[#15803d]", v.status === "not-chosen" && "font-semibold text-[#b45309]")}>{busy === v.variantId ? "Wird geöffnet …" : statusText(v)}</span>
                  {typeof v.total === "number" ? <span data-part="total">{euro(v.total)}</span> : null}
                  {v.offerNumber ? <span data-part="number">{v.offerNumber}</span> : null}
                </span>
              </button>
              <button type="button" aria-label={`${TEXT.rename}: ${v.name}`} onClick={() => set({ kind: "rename", id: v.variantId })} className="grid size-12 shrink-0 cursor-pointer place-items-center self-center rounded-lg border-0 bg-transparent text-foreground hover:bg-muted"><Pencil aria-hidden className="size-5" /></button>
              {rows.length > 1 ? <button type="button" aria-label={`${TEXT.remove}: ${v.name}`} onClick={() => set({ kind: "delete", id: v.variantId })} className="grid size-12 shrink-0 cursor-pointer place-items-center self-center rounded-lg border-0 bg-transparent text-destructive hover:bg-muted"><Trash2 aria-hidden className="size-5" /></button> : null}
            </li>
          );
        })}
      </ul>
      <Button variant="outline" data-action="create-variant" onClick={() => set({ kind: "create" })}><CopyPlus aria-hidden />{TEXT.create}</Button>
    </>
  );
}

/** opens a variant on the same step */
function useGoTo() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (id: string, replace = false) => navigate(`${pathname}${variantSearch(id)}`, { replace });
}

function NameForm({ initial, submit, label, busyLabel, onDone }: { initial: string; submit: (name: string) => Promise<void>; label: string; busyLabel: string; onDone?: () => void }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = usePanel((p) => p.set);
  return (
    <form className="grid gap-3" onSubmit={(e) => {
      e.preventDefault();
      if (busy) return;
      if (!name.trim()) { setError("Bitte geben Sie einen Namen ein."); return; }
      setBusy(true); setError("");
      submit(name).then(() => { onDone?.(); }, (err: unknown) => setError(variantError(err))).finally(() => setBusy(false));
    }}>
      <Field label={TEXT.name} id="variant-name" value={name} maxLength={60} autoComplete="off" autoFocus onChange={(e) => { setName(e.target.value); setError(""); }} aria-invalid={error ? true : undefined} />
      {error ? <Alert kind="error">{error}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => set({ kind: "list" })}>{TEXT.cancel}</Button>
        <Button type="submit" disabled={busy}>{busy ? busyLabel : label}</Button>
      </div>
    </form>
  );
}

function CreateForm() {
  const { rows } = useRows();
  const set = usePanel((p) => p.set);
  const go = useGoTo();
  const qc = useQueryClient();
  return (
    <>
      <p className="m-0 text-muted-foreground">{TEXT.createLead}</p>
      <NameForm
        key={rows.length} initial={nextVariantName(rows)} label={TEXT.create} busyLabel={TEXT.creating}
        submit={async (name) => {
          const problem = await saveOpen(true); // the copy is made of what is saved: the open variant first
          if (problem) throw new Error(`${TEXT.notSavedCreate} ${problem}`);
          const v = await createVariant(name);
          const dealId = useOfferStore.getState().dealId;
          qc.setQueryData<DealVariantsResponse>(variantsKey(dealId), (d) => (d ? { ...d, variants: [...d.variants.filter((x) => x.variantId !== v.variantId), v] } : d)); // in the list at once
          void qc.invalidateQueries({ queryKey: variantsKey(dealId) });
          go(v.variantId);
          set(null);
          toast.success(TEXT.created, { description: v.name });
        }}
      />
    </>
  );
}

function RenameForm({ id }: { id: string }) {
  const { rows } = useRows();
  const set = usePanel((p) => p.set);
  const qc = useQueryClient();
  const v = rows.find((r) => r.variantId === id);
  if (!v) return null;
  return (
    <NameForm
      initial={v.name} label={TEXT.save} busyLabel="Wird gespeichert …"
      submit={async (name) => { await renameVariant(id, name); await qc.invalidateQueries({ queryKey: variantsKey(useOfferStore.getState().dealId) }); set({ kind: "list" }); }}
    />
  );
}

function DeleteAsk({ id }: { id: string }) {
  const { rows } = useRows();
  const set = usePanel((p) => p.set);
  const qc = useQueryClient();
  const go = useGoTo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const v = rows.find((r) => r.variantId === id);
  if (!v) return null;
  const yes = async () => {
    setBusy(true);
    try {
      const dealId = useOfferStore.getState().dealId;
      const { next } = await deleteVariant(id);
      // gone from the list at once (the panel may open again before the list is asked anew)
      qc.setQueryData<DealVariantsResponse>(variantsKey(dealId), (d) => (d ? { ...d, variants: d.variants.filter((x) => x.variantId !== id) } : d));
      void qc.invalidateQueries({ queryKey: variantsKey(dealId) });
      toast.success(TEXT.deleted, { description: v.name });
      if (next) { go(next, true); set(null); } else set({ kind: "list" });
    } catch (err) { setError(variantError(err)); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-3" data-testid="variant-delete">
      {error ? <Alert kind="error">{error}</Alert> : <p className="m-0">{TEXT.removeText(v.name)}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => set({ kind: "list" })}>{error ? TEXT.close : TEXT.cancel}</Button>
        {error ? null : <Button type="button" variant="destructive" disabled={busy} onClick={() => void yes()}>{busy ? "Wird gelöscht …" : TEXT.removeYes}</Button>}
      </div>
    </div>
  );
}

/** „Variante erstellen“ on the Versand page, beside „Neue Version erstellen“ */
export function CreateVariantButton({ place }: { place: string }) {
  return (
    <Button variant="outline" data-action="create-variant" data-place={place} onClick={() => openVariantPanel("create")}>
      <CopyPlus aria-hidden className="size-4" /><span data-part="label">{TEXT.create}</span>
    </Button>
  );
}
