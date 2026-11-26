// "Angebot anpassen" and the internal note (ADR 026, phase 4; Angebotsversand slice 3). The
// rules are overrides.ts. The rows on the page are remembered while the offer is open (an empty
// row is on the page but not in the offer); the offer stores only what says something.
import { Lock, Plus, X } from "lucide-react";
import { Button, Input, Label, TextAreaField, cn } from "../../../shared/ui/index.js";
import { Internal } from "../../../shared/ui/internal.js";
import { useOfferStore, useOfferType, usePrice } from "../../offer/index.js";
import { NewVersionButton } from "./NeueVersion.js";
import { useSends } from "./Verlauf.js";
import { isSentNumber } from "./version.js";
import { TARGETS, badge, grossHint, hasPriceAndNotes, rowsOf, stored, type Rows, type Target } from "./overrides.js";

const overridesNow = () => (useOfferStore.getState().offer as Record<string, unknown> | null)?.offerOverrides;
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** the rows changed: remembered, and the offer gets what they say (only when that changed) */
function write(rows: Rows) {
  const st = useOfferStore.getState(), next = stored(rows, overridesNow());
  st.remember("overrideRows", rows);
  if (!same(next, overridesNow())) st.setTop({ offerOverrides: next });
}

const CONTROL = "min-h-12 w-full rounded-lg border-2 border-input bg-card px-3.5 text-foreground placeholder:text-muted-foreground";
function Remove({ what, onClick }: { what: string; onClick: () => void }) {
  return <button type="button" title="Entfernen" aria-label={`${what} entfernen`} onClick={onClick} className="grid size-12 shrink-0 cursor-pointer place-items-center self-end rounded-lg border-2 border-input bg-card text-foreground"><X aria-hidden className="size-5" /></button>;
}
const Group = ({ title, add, onAdd, children, name }: { title: string; add: string; onAdd: () => void; children: React.ReactNode; name: string }) => (
  <section className="grid gap-2" data-testid="oo-group" data-group={name}>
    <h4 className="m-0 font-semibold">{title}</h4>
    {children}
    <div><Button variant="outline" onClick={onAdd}><Plus aria-hidden className="size-4" />{add}</Button></div>
  </section>
);

export function Anpassungen() {
  const type = useOfferType();
  const overrides = useOfferStore((s) => (s.offer as Record<string, unknown> | null)?.offerOverrides);
  const sentState = useOfferStore((s) => (s.offer as Record<string, unknown> | null)?.zusammenfassung);
  const number = useOfferStore((s) => String((s.offer as Record<string, unknown> | null)?.offerNumber ?? ""));
  const sends = useSends().sends.data;
  const remembered = useOfferStore((s) => s.scratch.overrideRows) as Rows | undefined;
  const note = useOfferStore((s) => s.scratch.internalNote) as string | undefined;
  const price = usePrice();
  const rows = remembered ?? rowsOf(overrides);
  const mark = badge(overrides);
  // A draft that still has the number of a sent offer gets that offer's frozen price. Said only
  // when the number really was sent (audit F11): a number that was merely saved is not "versendet".
  const frozen = (price.data as Record<string, unknown> | null)?._locked === true && isSentNumber({ offerNumber: number, zusammenfassung: sentState }, sends);
  const more = hasPriceAndNotes(type);
  const set = (change: Partial<Rows>) => write({ ...rows, ...change });
  const at = <T,>(list: readonly T[], i: number, value: T) => list.map((x, k) => (k === i ? value : x));
  const without = <T,>(list: readonly T[], i: number) => list.filter((_, k) => k !== i);

  return (
    <>
      <details className="rounded-xl border border-border bg-card" data-testid="oo-card">
        <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5">
          <strong data-part="title">Angebot anpassen</strong>
          {mark ? <span data-part="badge" className="rounded-full bg-accent-weak px-2.5 py-0.5 text-[0.85rem] font-semibold">{mark}</span> : null}
          {frozen ? <span data-part="locked" title="Preis eingefroren – Neue Version nötig" className="inline-flex items-center gap-1 rounded-full border border-[#f3dfb0] bg-[#fdf6e3] px-2.5 py-0.5 text-[0.85rem] font-semibold text-[#8a6100]"><Lock aria-hidden className="size-3.5" />Preis eingefroren</span> : null}
        </summary>
        <div className="grid gap-4 border-t border-border p-4">
          <p className="m-0 text-muted-foreground" data-part="text">Änderungen gelten für Angebot (DOCX/PDF), E-Mail-PDF und Online-Unterschrift – ohne Word – und werden in „Neue Version“ übernommen.</p>
          {frozen ? (
            <div className="grid gap-2 rounded-lg border border-[#f3dfb0] bg-[#fdf6e3] p-3" data-part="locked-note">
              <p className="m-0">Diese Angebotsnummer wurde bereits versendet – der Preis ist eingefroren, Preisänderungen wirken erst in einer neuen Version.</p>
              <div><NewVersionButton place="adjust" /></div>
            </div>
          ) : null}

          <Group name="text" title="Wortlaut ersetzen" add="Ersetzung hinzufügen" onAdd={() => set({ text: [...rows.text, { from: "", to: "" }] })}>
            {rows.text.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" data-testid="oo-row">
                <div className="grid gap-1.5"><Label htmlFor={`oo-from-${i}`}>Statt</Label><Input id={`oo-from-${i}`} value={r.from} placeholder="Text im Angebot" autoFocus={!r.from && !r.to} onChange={(e) => set({ text: at(rows.text, i, { ...r, from: e.target.value }) })} /></div>
                <div className="grid gap-1.5"><Label htmlFor={`oo-to-${i}`}>Neu</Label><Input id={`oo-to-${i}`} value={r.to} placeholder="ersetzen durch" onChange={(e) => set({ text: at(rows.text, i, { ...r, to: e.target.value }) })} /></div>
                <Remove what={`Ersetzung ${i + 1}`} onClick={() => set({ text: without(rows.text, i) })} />
              </div>
            ))}
          </Group>

          {more ? (
            <Group name="price" title="Preis anpassen" add="Preisanpassung hinzufügen" onAdd={() => set({ price: [...rows.price, { target: "services", amount: "" }] })}>
              {rows.price.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" data-testid="oo-row">
                  <div className="grid gap-1.5"><Label htmlFor={`oo-target-${i}`}>Position</Label>
                    <select id={`oo-target-${i}`} className={CONTROL} value={r.target} onChange={(e) => set({ price: at(rows.price, i, { ...r, target: e.target.value as Target }) })}>{TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                  </div>
                  <div className="grid gap-1.5"><Label htmlFor={`oo-amount-${i}`}>Netto</Label>
                    <Input id={`oo-amount-${i}`} type="number" step="0.01" inputMode="decimal" value={r.amount} placeholder="± € netto" autoFocus={r.amount === ""} aria-describedby={`oo-gross-${i}`} onChange={(e) => set({ price: at(rows.price, i, { ...r, amount: e.target.value }) })} />
                    <span id={`oo-gross-${i}`} data-part="gross" className={cn("text-[0.9rem] text-muted-foreground", !grossHint(r.amount) && "hidden")}>{grossHint(r.amount)}</span>
                  </div>
                  <Remove what={`Preisanpassung ${i + 1}`} onClick={() => set({ price: without(rows.price, i) })} />
                </div>
              ))}
            </Group>
          ) : null}

          {more ? (
            <Group name="notes" title="Zusätzliche Hinweise" add="Hinweis hinzufügen" onAdd={() => set({ notes: [...rows.notes, ""] })}>
              {rows.notes.map((t, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_auto]" data-testid="oo-row">
                  <div className="grid gap-1.5"><Label htmlFor={`oo-note-${i}`}>Hinweis</Label>
                    <textarea id={`oo-note-${i}`} rows={2} className={cn(CONTROL, "py-2.5")} value={t} placeholder="z. B. Die Montage erfolgt nach Absprache an einem Werktag." autoFocus={t === ""} onChange={(e) => set({ notes: at(rows.notes, i, e.target.value) })} />
                  </div>
                  <Remove what={`Hinweis ${i + 1}`} onClick={() => set({ notes: without(rows.notes, i) })} />
                </div>
              ))}
            </Group>
          ) : null}
        </div>
      </details>

      <Internal>{/* the note is for the team only: not on screen while the customer watches (what was typed stays) */}
      <section className="grid gap-1.5" data-testid="zf-internal-note">
        <TextAreaField id="zf-internal-note-text" rows={3} label="Interne Notiz fürs Team (nur in Bitrix, nicht für Kunden)" value={note ?? ""} onChange={(v) => useOfferStore.getState().remember("internalNote", v.slice(0, 5000))} placeholder="z. B. Besonderheiten, Absprachen, Hinweise für Innendienst/Montage …" />
        <p className="m-0 text-[0.9rem] text-muted-foreground" data-part="hint">Erscheint als eigener Kommentar in der Deal-Timeline. Wird nicht in E-Mail, PDF oder Brief übernommen.</p>
      </section>
      </Internal>
    </>
  );
}
