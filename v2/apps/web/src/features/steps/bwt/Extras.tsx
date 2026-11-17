// Badewannentür, slice 2: free items (priced), the note, the sketch and the two note texts
// (steel, proxy). Stored exactly as today (test/bwt-extras.test.tsx).
import { Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { Button, Card, CardTitle, Check, Input, TextAreaField } from "../../../shared/ui/index.js";
import { SketchPad, hasSketch, type Sketch } from "../../../shared/ui/sketch-pad.js";
import { useOfferStore } from "../../offer/index.js";
import { eur } from "../kosten/rules.js";
import { addRow, parseMoney, removeRow, rowsOf, storedRows, type Row } from "./extras-rules.js";
import { set, str, useBwt, write } from "./store.js";

/** "2 × 25,00 € = 50,00 €" for a row with quantity and price above 0 (display only; UX-CHANGES U-028) */
const lineTotal = (r: Row): string => {
  const qty = Number(r.qty) || 0, price = parseMoney(r.price);
  return qty > 0 && price > 0 ? `${String(qty).replace(".", ",")} × ${eur(price)} = ${eur(qty * price)}` : "";
};

/** the rows being edited are kept as typed (in memory); the stored list follows every change */
function FreeItems() {
  const b = useBwt(), box = useRef<HTMLFieldSetElement>(null);
  const rows = rowsOf(b, useOfferStore((s) => s.scratch.bwtRows));
  const put = (next: Row[]) => { useOfferStore.getState().remember("bwtRows", next); write(() => ({ quickAdd: storedRows(next) })); };
  const edit = (i: number, field: keyof Row, text: string) => put(rows.map((r, at) => (at === i ? { ...r, [field]: text } : r)));
  const focus = (field: keyof Row) => setTimeout(() => box.current?.querySelector<HTMLInputElement>(`[data-testid="bwt-row"]:last-of-type [data-field="${field}"]`)?.focus());
  const add = () => { const r = addRow(rows); if (r.missing) focus(r.missing); else { put(r.rows); focus("price"); } };
  const cell = (i: number, field: keyof Row, label: string, placeholder: string, more: Record<string, unknown> = {}) => (
    <label className="grid gap-1 text-[0.95rem] font-semibold">{label}
      <Input data-field={field} placeholder={placeholder} value={rows[i]![field]} onChange={(e) => edit(i, field, e.target.value)} {...more} />
    </label>
  );
  return (
    <fieldset ref={box} className="m-0 grid min-w-0 gap-3 border-0 p-0" aria-describedby="bwt-extras-help">
      <legend className="mb-1.5 flex w-full items-center justify-between gap-3 p-0 font-semibold">Freier Posten (BWT)
        <Button variant="outline" size="icon" aria-label="Weitere Position hinzufügen" onClick={add}><Plus aria-hidden /></Button>
      </legend>
      {rows.map((_, i) => (
        <div key={i} data-testid="bwt-row" className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg border-2 border-input p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {cell(i, "name", "Bezeichnung", "z. B. Sonderanfertigung Glas")}
            {cell(i, "price", "Preis", "z. B. 799,00", { type: "text", inputMode: "decimal", onBlur: () => { if (parseMoney(rows[i]!.price) > 0 && !rows[i]!.qty.trim()) edit(i, "qty", "1"); } })}
            {cell(i, "qty", "Menge", "", { type: "number", inputMode: "numeric", min: 1, step: 1 })}
            {cell(i, "id", "ID", "z. B. BWT-CUS-001")}
          </div>
          <div className="flex items-center gap-3 self-end">
            {lineTotal(rows[i]!) ? <span data-part="line-total" className="whitespace-nowrap tabular-nums text-[0.95rem] text-muted-foreground">{lineTotal(rows[i]!)}</span> : null}
            <Button variant="outline" size="icon" aria-label="Diese Zeile entfernen" onClick={() => put(removeRow(rows, i))}><Trash2 aria-hidden /></Button>
          </div>
        </div>
      ))}
      <small id="bwt-extras-help" className="text-muted-foreground">Freier Posten mit eigener Bezeichnung. Preis kann Komma oder Punkt als Dezimaltrenner enthalten.</small>
    </fieldset>
  );
}

/** a note that goes into the offer when ticked: the tick is stored as "on", the text always */
function NoteText({ id, tick, text, label }: { id: string; tick: string; text: string; label: string }) {
  const b = useBwt();
  return (
    <div className="grid gap-2">
      <Check id={id} checked={b[tick] === "on"} onChange={(on) => write(() => ({ [tick]: on ? "on" : undefined }))}>{label}</Check>
      <textarea aria-label={label} rows={4} value={str(b[text])} onChange={(e) => set(text, e.target.value)} className="w-full rounded-lg border-2 border-input bg-card px-3.5 py-2.5 text-foreground" />
    </div>
  );
}

export function Extras() {
  const b = useBwt();
  const sketch = (b.sketch && typeof b.sketch === "object" ? b.sketch : { json: str(b.bwtSketchJson), dataUrl: str(b.bwtSketchDataUrl) }) as Partial<Sketch>;
  const store = (next: Sketch) => write(() => ({ sketch: { json: next.json, dataUrl: next.dataUrl }, bwtSketchJson: next.json, bwtSketchDataUrl: next.dataUrl }));
  const noteLines = str(b.bwtNote).trim() ? str(b.bwtNote).trim().split(/\r?\n/).length : 0;
  const summary = [hasSketch(sketch) ? "Skizze vorhanden" : "", noteLines ? `${noteLines} ${noteLines === 1 ? "Zeile" : "Zeilen"} Notiz` : ""].filter(Boolean).join(" · ");
  const remembered = useOfferStore((s) => s.scratch.bwtSketchOpen) as boolean | undefined;
  const open = remembered ?? !!summary; // opens by itself when there is a sketch or a note
  return (
    <Card aria-labelledby="bwt-extras-title" data-testid="bwt-extras">
      <CardTitle id="bwt-extras-title">Freier Posten & Hinweise</CardTitle>
      <FreeItems />
      <details className="rounded-lg border-2 border-border p-3" data-testid="bwt-sketch" open={open} onToggle={(e) => { const to = e.currentTarget.open; if (to !== open) useOfferStore.getState().remember("bwtSketchOpen", to); }}>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 font-semibold">Skizze und Notiz{summary ? <span className="font-normal text-muted-foreground">{summary}</span> : null}</summary>
        {open ? (
          <div className="grid gap-4 pt-3">
            <TextAreaField id="bwt-note" label="Zusätzliche Hinweise zur Badewannentür (für das Angebot)" placeholder="Hier können Sie besondere Wünsche, Hinweise oder Sonderbedingungen zur Badewannentür eintragen." rows={20} value={str(b.bwtNote)} onChange={(v) => set("bwtNote", v)} />
            <SketchPad value={sketch} onChange={store} />
          </div>
        ) : null}
      </details>
      <NoteText id="bwt-steel" tick="bwtSteelNoteEnabled" text="bwtSteelNoteText" label="Stahl‑emaillierte Badewanne – Hinweis in Angebot übernehmen" />
      <NoteText id="bwt-proxy" tick="bwtProxyNoteEnabled" text="bwtProxyNoteText" label="Stellvertretung – Hinweis in Angebot übernehmen" />
    </Card>
  );
}
