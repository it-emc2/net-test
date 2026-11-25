// U-073: the overview of a deal that has an offer in the React app — its variants, its stored
// documents from the old app, „Neue Variante beginnen“. One component for both entry points: the
// offer picker (in its dialog) and „Öffnen“ with a deal number (under the field). Rules and texts:
// overview-rules.ts.
import type { DealVariant, DealVariantsResponse, HomeSearchRow } from "@oc/api-contract";
import { useQueryClient } from "@tanstack/react-query";
import { CopyPlus, Layers, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { call } from "../../shared/api/index.js";
import { Alert, Button, Field, cn } from "../../shared/ui/index.js";
import { nextVariantName, variantError, variantsKey } from "../offer/index.js";
import { StoredRows } from "./HomeSearch.js";
import { OVERVIEW_TEXT as T, defaultSource, overviewIntro, variantPath, variantRowView } from "./overview-rules.js";

function VariantRow({ v, busy, onOpen }: { v: DealVariant; busy: boolean; onOpen: () => void }) {
  const view = variantRowView(v);
  return (
    <button type="button" data-testid="overview-variant" data-variant={v.variantId} data-status={v.status} disabled={busy} onClick={onOpen}
      className="grid min-h-14 w-full min-w-0 gap-0.5 rounded-md border-2 border-border px-3 py-2 text-left text-foreground hover:bg-accent-weak focus-visible:bg-accent-weak disabled:opacity-60">
      <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Layers aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <strong className="min-w-0 break-words" data-part="name">{view.name}</strong>
          {v.isDefault ? <span className="shrink-0 text-[0.85rem] text-muted-foreground" data-part="last">({T.lastOpened})</span> : null}
        </span>
        <span className="flex flex-wrap gap-1.5" data-part="badges">
          {view.badges.map((b, i) => (
            <span key={i} className={cn("rounded-full border border-border px-2 text-[0.85rem] font-semibold", i === 1 ? "bg-muted" : "bg-card",
              i === 1 && v.status === "signed" && "text-[#15803d] dark:text-[#4ade80]", i === 1 && v.status === "not-chosen" && "text-[#b45309] dark:text-[#fbbf24]")}>{b}</span>
          ))}
        </span>
      </span>
      {view.meta ? <span className="break-words text-[0.95rem] text-muted-foreground" data-part="meta">{view.meta}</span> : null}
      {busy ? <span className="flex items-center gap-2 text-[0.95rem]" role="status"><LoaderCircle aria-hidden className="size-4 animate-spin" />{T.opening}</span> : null}
    </button>
  );
}

/** „Neue Variante beginnen“: the variant creation of the variant panel (POST …/variants), started from the Hauptmenü */
function NewVariantForm({ dealId, variants, onCancel, onCreated }: { dealId: string; variants: readonly DealVariant[]; onCancel: () => void; onCreated: (v: DealVariant) => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(defaultSource(variants)?.variantId ?? "");
  const [name, setName] = useState(() => nextVariantName(variants));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const source = variants.find((v) => v.variantId === from) ?? defaultSource(variants);
  const submit = async () => {
    if (busy) return;
    if (!name.trim()) { setError("Bitte geben Sie einen Namen ein."); return; }
    setBusy(true); setError("");
    try {
      const r = await call("createDealVariant", { params: { dealId }, body: { ...(source ? { from: source.variantId } : {}), name: name.trim() } });
      // the offer's variant panel shares this list: the new one is in it at once
      qc.setQueryData<DealVariantsResponse>(variantsKey(dealId), (d) => (d ? { ...d, variants: [...d.variants.filter((x) => x.variantId !== r.variant.variantId), r.variant] } : d));
      void qc.invalidateQueries({ queryKey: variantsKey(dealId) });
      onCreated(r.variant);
    } catch (e) { setError(variantError(e)); setBusy(false); }
  };
  return (
    <form className="grid min-w-0 gap-3" data-testid="overview-new" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <p className="m-0 text-muted-foreground" data-part="lead">{T.newLead(source?.name ?? "")}</p>
      {variants.length > 1 ? (
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1 font-semibold">{T.from}</legend>
          {variants.map((v) => (
            <label key={v.variantId} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-input px-3 has-[:checked]:border-primary has-[:checked]:bg-accent-weak">
              <input type="radio" name="overview-from" className="size-5 accent-[var(--primary)]" checked={from === v.variantId} onChange={() => setFrom(v.variantId)} />
              <span className="min-w-0 break-words">{v.name}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <Field label="Name der Variante" id="overview-variant-name" value={name} maxLength={60} autoComplete="off" autoFocus
        onChange={(e) => { setName(e.target.value); setError(""); }} aria-invalid={error ? true : undefined} />
      {error ? <Alert kind="error" className="my-0">{error}</Alert> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{T.cancel}</Button>
        <Button type="submit" disabled={busy} data-action="create-variant">{busy ? T.creating : T.create}</Button>
      </div>
    </form>
  );
}

/** The overview. `onBack`: the picker's way back to the types. */
export function DealOverview({ dealId, variants, rows, onBack }: { dealId: string; variants: readonly DealVariant[]; rows: readonly HomeSearchRow[]; onBack?: (() => void) | undefined }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState("");
  const [creating, setCreating] = useState(false);
  const open = (v: DealVariant) => { if (busy) return; setBusy(v.variantId); nav(variantPath(dealId, v)); };
  return (
    <div className="grid min-w-0 gap-3 [&>*]:min-w-0" data-testid="deal-overview">
      <p className="m-0" data-part="intro">{overviewIntro(dealId, variants, rows.length)}</p>
      <div className="grid gap-2" data-testid="overview-variants">
        <h3 className="m-0 text-lg">{T.variants}</h3>
        <div className="grid gap-1.5">{variants.map((v) => <VariantRow key={v.variantId} v={v} busy={busy === v.variantId} onOpen={() => open(v)} />)}</div>
      </div>
      {rows.length ? (
        <div className="grid gap-2" data-testid="deal-documents">
          <h3 className="m-0 text-lg">{T.stored}</h3>
          <StoredRows rows={rows} />
        </div>
      ) : null}
      {creating
        ? <NewVariantForm dealId={dealId} variants={variants} onCancel={() => setCreating(false)} onCreated={(v) => open(v)} />
        : (
          <Button size="lg" variant="outline" className="h-auto min-h-12 w-full whitespace-normal break-words" data-action="new-variant" disabled={!!busy} onClick={() => setCreating(true)}>
            <CopyPlus aria-hidden /><span className="min-w-0 whitespace-normal break-words">{T.newVariant}</span>
          </Button>
        )}
      {onBack ? <Button variant="ghost" className="min-h-12 justify-self-start" data-action="back" onClick={onBack}>{T.back}</Button> : null}
    </div>
  );
}
