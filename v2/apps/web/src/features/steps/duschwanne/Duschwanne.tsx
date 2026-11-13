// Duschwanne (Badumbau; ADR 026, phase 4): the switch, the product line, the size with the
// trays that fit it, the Slate colour, accessories and a free item. The stored fields are
// exactly today's (test/duschwanne.test.tsx compares with what today's UI stores and shows
// for the same inputs).
import { useQuery } from "@tanstack/react-query";
import { Check as Tick, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { call } from "../../../shared/api/index.js";
import { Button, Card, CardTitle, Field, Input, Switch, cn } from "../../../shared/ui/index.js";
import { useOfferField, useOfferStore } from "../../offer/index.js";
import { arbeitenChanges } from "../arbeiten/rules.js";
import {
  ACCESSORIES, COLORS, LINE_TEXT, accessoryText, changeSize, cheaper, chooseLine, colorImage, customItem, isSlate, lineOf, pickTray, priceText, searches,
  stepQty, stockText, summary, switchTray, toggleAccessory, trayExtras, trayOn, trayTitle, type Line, type Tray,
} from "./rules.js";

const DW = "duschwanne";
type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
const dwNow = (): Fields => offerNow().duschwanne ?? {};
/** change the tray; the work tasks that follow from it (and their time) change with it */
const write = (fields: Fields) => useOfferStore.getState().patchAll(arbeitenChanges(offerNow(), fields));
const remember = (key: string, value: unknown) => useOfferStore.getState().remember(key, value);
/** the tray picked last, with the size searched for — so a change of the size can offer it back */
interface Saved { productId: string; name: string; searchW: string; searchL: string }

/** the value once it has stood still for a moment — typing a size must not search per keystroke */
function useSettled<T>(value: T, ms = 160): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const t = setTimeout(() => setSettled(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return settled;
}

function useTrays(query: string | undefined) {
  return useQuery({
    queryKey: ["trays", query], enabled: !!query, staleTime: 5 * 60_000, retry: false,
    queryFn: ({ signal }) => call("traySuggest", { query: query!, signal }).then((r) => r.results as Tray[]),
  });
}

function TrayCard({ tray, line, best, selected, pinned, onPick }: { tray: Tray; line: Line; best: boolean; selected: boolean; pinned?: boolean; onPick: () => void }) {
  const title = trayTitle(tray, line);
  const stock = stockText(tray);
  const extras = trayExtras(tray, title);
  return (
    <label data-testid="tray-card" data-id={tray.productId} data-selected={selected} data-pinned={!!pinned} title={tray.name ?? ""}
      className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border-2 bg-card px-4 py-2", selected ? "border-primary bg-accent-weak" : "border-input")}>
      <input type="radio" name="traySuggestion" className="size-5 shrink-0 accent-[var(--primary)]" value={tray.productId} checked={selected} onChange={onPick} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span data-part="title" className={cn(selected && "font-bold")}>{title}</span>
        <span data-part="sub" className="flex flex-wrap gap-x-2 text-[0.9rem] text-muted-foreground">
          {best ? <span className="font-semibold text-foreground">Beste Übereinstimmung</span> : null}
          {stock ? <span className={cn(stock.kind === "in" && "text-success", stock.kind === "out" && "text-destructive")} title={tray.stockText ?? ""}>{stock.text}</span> : null}
          {extras ? <span>{extras}</span> : null}
          <span>{line === "standard" ? "Badolux" : "Hassmann"}</span>
        </span>
      </span>
      <span data-part="price" className="shrink-0 font-semibold">{priceText(tray)}</span>
      {selected ? <Tick aria-hidden className="size-5 shrink-0 text-primary" /> : null}
    </label>
  );
}

/** The size and the trays that fit it. */
function Search({ line }: { line: Line }) {
  const w = useOfferField<string>(DW, "tray_w_cm") ?? "";
  const l = useOfferField<string>(DW, "tray_l_cm") ?? "";
  const chosen = String(useOfferField(DW, "chosenTrayProductId") ?? "");
  const remembered = useOfferStore((s) => s.scratch.traySaved as Saved | undefined);
  const typed = searches(w, l);
  const key = useSettled(typed?.premium ?? "");
  const q = typed && key === typed.premium ? typed : null; // null while the size is still being typed
  const premium = useTrays(q?.premium), standard = useTrays(q?.standard);
  const loading = !!typed && (!q || premium.isPending || standard.isPending);
  const lists = { premium: premium.data ?? [], standard: standard.data ?? [] };
  const other: Line = line === "standard" ? "premium" : "standard";
  const active = lists[line], rest = lists[other];
  // an offer opened with a tray has no "picked last" yet: the stored tray stands in
  const saved: Saved | null = remembered ?? (chosen ? { productId: chosen, name: "", searchW: w, searchL: l } : null);
  const inActive = saved ? active.find((p) => p.productId === saved.productId) : undefined;
  const pinned = saved && !inActive ? rest.find((p) => p.productId === saved.productId) : undefined;
  const dropped = !!q && !loading && !!remembered && !chosen && !inActive && !pinned ? remembered : null;

  // the tray picked last fits the size again (or its line was switched to) → it is picked again
  const again = !loading && !!remembered && inActive && chosen !== inActive.productId ? inActive : undefined;
  useEffect(() => { if (again) write(pickTray(again)); }, [again]);

  const setSize = (nw: string, nl: string) => { if (!nw.trim() && !nl.trim()) remember("traySaved", undefined); write(changeSize(nw, nl)); };
  const pick = (p: Tray) => { remember("traySaved", { productId: p.productId, name: p.name ?? "", searchW: w, searchL: l } satisfies Saved); write(pickTray(p)); };
  const toLine = (to: Line, keep: boolean) => { if (!keep) remember("traySaved", undefined); write(chooseLine(to, keep)); };
  const offer = line === "premium" ? cheaper(active.find((p) => p.productId === chosen), lists.standard) : null;
  const nothingAnywhere = !!q && !loading && !active.length && !rest.length;
  useEffect(() => { remember("trayNoMatch", nothingAnywhere); }, [nothingAnywhere]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Breite in cm" id="dw-width" type="number" inputMode="numeric" min={20} step={1} placeholder="z. B. 90" value={w} onChange={(e) => setSize(e.target.value, l)} />
        <Field label="Länge in cm" id="dw-length" type="number" inputMode="numeric" min={2} step={1} placeholder="z. B. 120" value={l} onChange={(e) => setSize(w, e.target.value)} />
      </div>
      {!typed ? null : loading ? <p className="m-0 text-muted-foreground">Suche…</p> : (
        <div className="grid gap-2" data-testid="tray-results">
          {pinned ? (
            <div className="grid gap-2 rounded-lg border-2 border-dashed border-border p-3">
              <p className="m-0 font-semibold" data-testid="tray-note">⚑ Gespeicherte Auswahl aus der Linie {LINE_TEXT[other].name}</p>
              <TrayCard tray={pinned} line={other} best={false} selected pinned onPick={() => {}} />
              <p className="m-0 text-[0.95rem]" data-testid="tray-note">Linie und Preis bleiben unverändert, wie gespeichert. Ein Wechsel tauscht auch Ablaufgarnitur und Kleinmaterial und ändert damit den Angebotspreis.</p>
              <div><Button variant="secondary" onClick={() => toLine(other, true)}>Auf {LINE_TEXT[other].name} umstellen</Button></div>
            </div>
          ) : null}
          {dropped ? (
            <div className="grid gap-2 rounded-lg border-2 border-destructive p-3" data-testid="tray-note">
              <p className="m-0"><strong>Bisherige Auswahl entfernt: {dropped.name || dropped.productId}</strong> Sie passt nicht mehr zu den eingegebenen Maßen{dropped.searchW || dropped.searchL ? ` (gesucht war ${dropped.searchW || "?"} × ${dropped.searchL || "?"} cm)` : ""}. Bitte unten neu wählen.</p>
              {dropped.searchW || dropped.searchL ? <div><Button variant="secondary" onClick={() => write(changeSize(dropped.searchW, dropped.searchL))}>Vorherige Maße zurück</Button></div> : null}
            </div>
          ) : null}
          <p className="m-0 text-sm font-bold uppercase tracking-wide text-muted-foreground" data-testid="tray-heading">{pinned ? `Weitere ${LINE_TEXT[line].name}-Duschwannen` : `${LINE_TEXT[line].name}-Duschwannen`}</p>
          {active.slice(0, 3).map((p, i) => <TrayCard key={p.productId} tray={p} line={line} best={i === 0} selected={p.productId === chosen} onPick={() => pick(p)} />)}
          {!active.length && pinned && !dropped ? <p className="m-0 text-muted-foreground">Keine passenden Vorschläge gefunden.</p> : null}
          {!pinned && !dropped && !active.length ? (
            <div className="grid gap-2 rounded-lg border-2 border-border p-3" data-testid="tray-note">
              {rest.length ? (
                <>
                  <p className="m-0"><strong>Keine {LINE_TEXT[line].name}-Duschwanne in dieser Größe.</strong> In der Linie {LINE_TEXT[other].name} gibt es {rest.length} passende Treffer{cheapestHint(rest)}.</p>
                  <div><Button variant="secondary" onClick={() => toLine(other, false)}>Zu {LINE_TEXT[other].name} wechseln</Button></div>
                </>
              ) : <p className="m-0"><strong>Keine passende Duschwanne gefunden.</strong> Weder Standard noch Premium liefert für diese Maße ein Produkt — bitte unten als freien Posten erfassen.</p>}
            </div>
          ) : null}
        </div>
      )}
      {offer ? (
        <div className="grid gap-2 rounded-lg border-2 border-primary p-3" data-testid="tray-cheaper">
          <p className="m-0"><strong>{offer.text}</strong> {offer.detail}</p>
          <div><Button variant="secondary" onClick={() => { remember("traySaved", { productId: offer.tray.productId, name: offer.tray.name ?? "", searchW: w, searchL: l } satisfies Saved); write({ ...chooseLine("standard", true), ...pickTray(offer.tray) }); }}>Auf Standard wechseln</Button></div>
        </div>
      ) : null}
      <Chosen line={line} tray={[...active, ...rest].find((p) => p.productId === chosen)} />
    </>
  );
}
const cheapestHint = (list: readonly Tray[]) => { const c = Math.min(...list.map((p) => Number(p.price)).filter(Number.isFinite)); return Number.isFinite(c) ? ` ab ${c.toFixed(2).replace(".", ",")} €` : ""; };

/** The Slate colour (only for Slate trays) and "Ihre Auswahl". */
function Chosen({ line, tray }: { line: Line; tray: Tray | undefined }) {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const chosen = String(dw.chosenTrayProductId ?? "");
  const color = String(dw.trayColor ?? "Weiss");
  const sum = summary(dw, tray, line);
  return (
    <>
      {isSlate(chosen) ? (
        <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 font-semibold">Farbe der Duschwanne Slate</legend>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <label key={c.value} className="grid w-24 cursor-pointer justify-items-center gap-1 rounded-lg border-2 border-input bg-card p-2 text-center has-[:checked]:border-primary has-[:checked]:bg-accent-weak has-[:checked]:font-bold">
                <input type="radio" name="trayColor" className="sr-only" value={c.value} checked={color === c.value} onChange={() => write({ trayColor: c.value })} />
                <img src={colorImage(c.value)} alt="" className="size-14 rounded-full object-cover" loading="lazy" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {sum ? (
        <div className="grid gap-1 rounded-lg border-2 border-border p-3" data-testid="tray-summary">
          <p className="m-0 text-sm font-bold uppercase tracking-wide text-muted-foreground">Ihre Auswahl</p>
          <p className="m-0"><strong>{sum.title}</strong></p>
          <p className="m-0 text-muted-foreground">{sum.sub}</p>
          {sum.items.length ? <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0">{sum.items.map((i) => <li key={i}>{i}</li>)}</ul> : null}
        </div>
      ) : null}
    </>
  );
}

function Accessories({ line }: { line: Line }) {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const qty = String(dw.stelzlagerQty ?? "8");
  return (
    <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">Zubehör</legend>
      {ACCESSORIES.map((a) => {
        const on = !!dw[a.name];
        const text = accessoryText(a, line);
        return (
          <div key={a.name} data-testid={`acc-${a.name}`} className="grid gap-2 rounded-lg border-2 border-input bg-card px-4 py-2 has-[:checked]:border-primary">
            <label className="flex min-h-12 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={on} onChange={(e) => write(toggleAccessory(a.name, a.value, e.target.checked))} />
              <img src={a.img} alt="" className="size-12 rounded object-cover" loading="lazy" />
              <span className="grid"><span data-part="caption" className={cn(on && "font-bold")}>{text.caption}</span><small data-part="small" className="text-muted-foreground">{text.small}</small></span>
            </label>
            {a.name === "stelzlager" && on ? (
              <div className="flex items-center gap-2" data-testid="stelzlager-qty">
                <Button variant="outline" size="icon" aria-label="Weniger" onClick={() => write(stepQty(qty, -1))}><Minus aria-hidden /></Button>
                <div className="w-20"><Input type="number" min={1} max={99} aria-label="Anzahl Stelzlager" value={qty} onChange={(e) => write({ stelzlagerQty: e.target.value })} /></div>
                <Button variant="outline" size="icon" aria-label="Mehr" onClick={() => write(stepQty(qty, 1))}><Plus aria-hidden /></Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}

/** A tray that is not in the search (special shape): name and price by hand. */
function FreeItem() {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const urgent = !!useOfferStore((s) => s.scratch.trayNoMatch);
  const set = (field: string, value: string) => write(customItem(dwNow(), { [field]: value }));
  const text = (k: string) => String(dw[k] ?? "");
  return (
    <details className={cn("rounded-lg border-2 bg-card", urgent ? "border-destructive" : "border-border")} open={urgent || undefined} data-testid="tray-custom">
      <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">{urgent ? "Sonderform / Maßanfertigung — freien Posten erfassen" : "Duschwanne nicht gefunden? Freien Posten anlegen"}</summary>
      <div className="grid gap-3 p-3 pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bezeichnung" id="dw-custom-name" placeholder="z. B. Duschwanne geschwungen 100x100" autoComplete="off" value={text("dwCustomName")} onChange={(e) => set("dwCustomName", e.target.value)} />
          <Field label="Preis" id="dw-custom-price" inputMode="decimal" placeholder="z. B. 799,00" autoComplete="off" value={text("dwCustomPrice")} onChange={(e) => set("dwCustomPrice", e.target.value)} />
          <Field label="Menge" id="dw-custom-qty" type="number" inputMode="numeric" min={1} step={1} value={text("dwCustomQty")} onChange={(e) => set("dwCustomQty", e.target.value)} />
          <Field label="ID" id="dw-custom-id" placeholder="z. B. DW-CUS-001" autoComplete="off" value={text("dwCustomId")} onChange={(e) => set("dwCustomId", e.target.value)} />
        </div>
        <p className="m-0 text-[0.9rem] text-muted-foreground">Falls die passende Duschwanne oben nicht gefunden wird: hier Bezeichnung und Preis manuell eintragen. Erscheint in Kosten &amp; Angebot unter „Duschwanne".</p>
      </div>
    </details>
  );
}

const REFS = ["07", "27", "28"];
export function Duschwanne() {
  const dw = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne as Fields | undefined) ?? {};
  const on = trayOn(dw);
  const line = lineOf(dw);
  const toggle = (next: boolean) => {
    const st = useOfferStore.getState();
    const r = switchTray(dwNow(), next, (st.scratch.trayParked as Fields | undefined) ?? null);
    st.remember("trayParked", r.parked);
    write(r.changes);
  };
  return (
    <Card aria-labelledby="dw-title">
      <CardTitle id="dw-title">Duschwanne</CardTitle>
      <div className="flex items-center gap-3">
        <Switch id="dw-on" checked={on} onChange={toggle} label="Duschwanne" />
        <label htmlFor="dw-on" className="grid cursor-pointer"><strong>Duschwanne</strong><small className="text-muted-foreground">Wanne, Zubehör und Kleinmaterial im Angebot. Aus: nichts berechnet, die Auswahl bleibt erhalten.</small></label>
      </div>
      {on ? (
        <>
          <div className="grid gap-3 rounded-lg border-2 border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid"><strong>Produktlinie</strong><small className="text-muted-foreground" data-testid="tier-line">Nur Produkte von {LINE_TEXT[line].brand}</small></div>
              <div className="flex gap-2" role="group" aria-label="Produktlinie wählen">
                {(["standard", "premium"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={line === t} onClick={() => { if (line !== t) { remember("traySaved", undefined); write(chooseLine(t)); } }}
                    className={cn("grid min-h-12 cursor-pointer rounded-lg border-2 px-4 py-1 text-left", line === t ? "border-primary bg-accent-weak" : "border-input bg-card")}>
                    <strong>{LINE_TEXT[t].name}</strong><span className="text-[0.85rem] text-muted-foreground">{LINE_TEXT[t].sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="dw-hint" className="grid cursor-pointer"><strong>Hinweis Zusatzkosten</strong><small className="text-muted-foreground">Ebenerdige Montage — Hinweis im Angebot einblenden</small></label>
              <Switch id="dw-hint" checked={!!dw.ebenerdigeMontage} onChange={(v) => write({ ebenerdigeMontage: v })} label="Hinweis zu möglichen Zusatzkosten einblenden" />
            </div>
          </div>
          <Search line={line} />
          <Accessories line={line} />
          <FreeItem />
          <div className="grid gap-2">
            <p className="m-0 text-sm font-bold uppercase tracking-wide text-muted-foreground">Aus unseren Kundenbädern</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {REFS.map((n) => (
                <a key={n} href={`/assets/kunden/${n}-nachher.jpg`} target="_blank" rel="noreferrer" aria-label="Vorher / Nachher groß anzeigen" className="grid grid-cols-2 gap-1 overflow-hidden rounded-lg border-2 border-border">
                  <img src={`/assets/kunden/${n}-vorher.jpg`} alt="Vorher: Badewanne" loading="lazy" className="aspect-square w-full object-cover" />
                  <img src={`/assets/kunden/${n}-nachher.jpg`} alt="Nachher: Dusche" loading="lazy" className="aspect-square w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}
