import { useEffect } from "react";
import { ChevronLeft, Pencil, Package } from "lucide-react";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";
import * as E from "./daEngine";
import { daImageUrl } from "./daModel";
import type { WizardModel, WizardState } from "./daEngine";

/** One Duschabtrennung configuration card. Controlled: parent owns the engine state. */
export function DaWizard({
  model,
  state,
  onChange,
}: {
  model: WizardModel;
  state: WizardState;
  onChange: (s: WizardState) => void;
}) {
  const set = (s: WizardState) => onChange(E.settle(model, s));

  const order = model.params.map((p) => p.id);
  const answered = model.params.filter((p) => state.selections[p.id] != null).map((p) => p.id);

  function paramMeta(paramId: string) {
    return model.params.find((x) => x.id === paramId) ?? E.finishParams(E.resolvedLeaf(model, state)).find((f) => f.id === paramId) ?? null;
  }

  function truncateTo(paramId: string): WizardState {
    const idx = order.indexOf(paramId);
    const selections: Record<string, string> = {};
    for (const id of order.slice(0, idx)) if (state.selections[id] != null) selections[id] = state.selections[id];
    return { selections, sizes: {} };
  }

  function goBack() {
    for (let i = answered.length - 1; i >= 0; i--) {
      const target = answered[i];
      const settled = E.settle(model, truncateTo(target));
      const cs = E.currentStep(model, settled);
      if ((cs.phase === "structure" || cs.phase === "finish") && cs.paramId === target) {
        onChange(settled);
        return;
      }
    }
  }
  const canGoBack = answered.some((target) => {
    const cs = E.currentStep(model, E.settle(model, truncateTo(target)));
    return (cs.phase === "structure" || cs.phase === "finish") && cs.paramId === target;
  });

  // Auto-size components that have exactly one possible size (no real choice).
  const leaf = E.resolvedLeaf(model, state);
  useEffect(() => {
    if (!leaf) return;
    let next = state;
    let changed = false;
    for (const c of leaf.components) {
      if (!next.sizes[c.key] && c.sondermass.length === 0 && c.breite.length === 1 && c.hoehe.length === 1) {
        next = E.setComponentSize(next, c.key, c.breite[0], c.hoehe[0]);
        changed = true;
      }
    }
    if (changed) onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaf, state]);

  const step = E.currentStep(model, state);
  const leafPrevVal = (() => {
    const p = model.params.find((x) => x.id === "Duschabtrennung");
    const val = state.selections["Duschabtrennung"];
    if (!p || val == null) return null;
    const v = p.values.find((x) => x.value === val);
    return v && daImageUrl(model, v.imageId) ? v : null;
  })();
  const resolved = E.resolveConfiguration(model, state);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-4">
        {canGoBack && (
          <button type="button" onClick={goBack} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            <ChevronLeft className="size-4" /> Zurück
          </button>
        )}

        {/* Breadcrumb of answered steps */}
        {answered.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {answered.map((id) => {
              const p = paramMeta(id);
              const val = state.selections[id];
              const label = p?.values.find((v) => v.value === val)?.label ?? val;
              return (
                <button key={id} type="button" onClick={() => onChange(E.settle(model, truncateTo(id)))} className="group inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs hover:border-primary">
                  <span className="text-muted-foreground">{p?.label ?? id}:</span>
                  <span className="font-medium">{label}</span>
                  <Pencil className="size-3 text-muted-foreground group-hover:text-primary" />
                </button>
              );
            })}
          </div>
        )}

        {/* Leaf product preview */}
        {leafPrevVal && (
          <div className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
            <img src={daImageUrl(model, leafPrevVal.imageId)!} alt="" className="size-24 shrink-0 rounded-md border bg-white object-contain p-1" loading="lazy" />
            <span className="text-sm font-medium">{leafPrevVal.label}</span>
          </div>
        )}

        {(step.phase === "structure" || step.phase === "finish") && step.paramId ? (
          <StepGrid model={model} state={state} paramId={step.paramId} title={paramMeta(step.paramId)?.label ?? step.paramId} onPick={(value) => set(E.applySelection(model, state, step.paramId!, value))} />
        ) : leaf ? (
          <SizePanel model={model} state={state} leaf={leaf} onSet={set} done={step.phase === "done"} onReset={() => onChange(E.settle(model, E.initialState()))} />
        ) : (
          <p className="text-sm text-muted-foreground">Konfiguration …</p>
        )}
      </div>

      {/* Summary */}
      <aside className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide">Auswahl</h3>
        {resolved ? (
          <div className="space-y-2 text-sm">
            {resolved.lines.map((l, i) => (
              <div key={i} className="flex flex-col border-b pb-2 last:border-0">
                <span className="font-medium">{l.article.displayName || l.component}</span>
                <span className="text-xs text-muted-foreground">{l.article.articleNumber}{l.article.finishText ? ` · ${l.article.finishText}` : ""}</span>
                <span className="mt-0.5 self-end tabular-nums">{formatEUR(l.article.net)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1 font-semibold">
              <span>Gesamt (netto)</span>
              <span className="tabular-nums text-primary">{formatEUR(resolved.net)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Konfiguration noch nicht vollständig …</p>
        )}
      </aside>
    </div>
  );
}

function StepGrid({
  model, state, paramId, title, onPick,
}: {
  model: WizardModel; state: WizardState; paramId: string; title: string; onPick: (value: string) => void;
}) {
  const opts = E.availableOptions(model, state, paramId);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {opts.map((v) => {
          const img = daImageUrl(model, v.imageId);
          return (
            <button key={v.value} type="button" onClick={() => onPick(v.value)} className="flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-colors hover:border-primary hover:bg-accent">
              <span className="flex h-24 w-full items-center justify-center overflow-hidden rounded-md border bg-white">
                {img ? <img src={img} alt="" className="size-full object-contain p-1" loading="lazy" /> : <Package className="size-7 text-muted-foreground" />}
              </span>
              <span className="text-sm font-medium">{v.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SizePanel({
  model, state, leaf, onSet, done, onReset,
}: {
  model: WizardModel; state: WizardState; leaf: E.Leaf; onSet: (s: WizardState) => void; done: boolean; onReset: () => void;
}) {
  const axis = (model as any).sizeAxisLabel || "Breite (mm)";
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Maße festlegen</h3>
      {leaf.components.map((c) => {
        const cur = state.sizes[c.key] || {};
        const singleH = c.hoehe.length === 1 ? c.hoehe[0] : null;
        return (
          <div key={c.key} className="rounded-lg border p-3">
            <h4 className="mb-2 text-sm font-medium">{c.label}</h4>
            <p className="mb-1 text-xs text-muted-foreground">{axis}</p>
            <div className="flex flex-wrap gap-2">
              {c.breite.map((n) => {
                const selected = !cur.sondermass && cur.width === n;
                return (
                  <SizePill key={String(n)} label={String(n)} selected={selected} onClick={() => {
                    const height = singleH != null ? singleH : cur.sondermass ? undefined : cur.height;
                    onSet(E.setComponentSize(state, c.key, n, height as number | string));
                  }} />
                );
              })}
              {c.sondermass.map((sm) => (
                <SizePill key={sm} label={sm} sonder selected={cur.sondermass === sm} onClick={() => onSet(E.setComponentSondermass(state, c.key, sm))} />
              ))}
            </div>
            {singleH == null && !cur.sondermass && (
              <>
                <p className="mb-1 mt-2 text-xs text-muted-foreground">Höhe (mm)</p>
                <div className="flex flex-wrap gap-2">
                  {c.hoehe.map((hh) => (
                    <SizePill key={String(hh)} label={String(hh)} selected={cur.height === hh} onClick={() => onSet(E.setComponentSize(state, c.key, cur.width as number | string, hh))} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
      {done && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm text-muted-foreground">Die Konfiguration ist abgeschlossen und wurde dem Angebot hinzugefügt. Sie können die Maße oben jederzeit ändern.</p>
          <button type="button" onClick={onReset} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Neue Konfiguration</button>
        </div>
      )}
    </div>
  );
}

function SizePill({ label, selected, onClick, sonder }: { label: string; selected: boolean; onClick: () => void; sonder?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md border px-3 py-1.5 text-sm transition-colors", selected ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent", sonder && "border-dashed")}>
      {label}
    </button>
  );
}
