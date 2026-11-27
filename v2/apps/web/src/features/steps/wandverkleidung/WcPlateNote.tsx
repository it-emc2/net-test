// The Wand-WC's plate seen from the Wandverkleidung step (rules: wc-plate.ts, ADR 032): which plate
// belongs to the Vorwand, a nudge to pick its Dekor, and the question when the WC no longer needs it.
import { useEffect, useRef } from "react";
import { Button, cn } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { wvChanges } from "../arbeiten/rules.js";
import { decorName, keepPlate, markOf, removePlate, wantsPlate, type Change } from "./wc-plate.js";

type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
/** one change of the offer for the plate: the Wandverkleidung (with the work-time rows) and the Weitere Arbeiten */
export function commitPlate(change: Change): void {
  const o = offerNow();
  const dw: Record<string, Fields> = Object.keys(change.dw).length ? { duschwanne: change.dw } : {};
  useOfferStore.getState().patchAll({ ...wvChanges(o, change.wv), ...dw });
  if (Object.keys(change.dw).length) useOfferStore.getState().remember("freeTasks", undefined); // Weitere Arbeiten show the stored list
}
/** set by the WC card's „Anderes Dekor wählen“: this note (just above the plates and the palette) is scrolled into view once */
export const PICK = "wvWcPick";

export function WcPlateNote() {
  const wv = useOfferStore((s) => (s.offer as Record<string, any> | null)?.wandverkleidung as Fields | undefined) ?? {};
  const opt = useOfferStore((s) => (s.offer as Record<string, any> | null)?.optional as Fields | undefined);
  const pick = !!useOfferStore((s) => s.scratch[PICK]);
  const mark = markOf(wv);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pick) return;
    useOfferStore.getState().remember(PICK, false);
    box.current?.scrollIntoView?.({ block: "start" });
  }, [pick]);
  if (!mark) return null;
  const name = decorName(mark.decor);
  if (!wantsPlate(opt)) {
    return (
      <div ref={box} role="status" data-testid="wv-wc-plate" data-state="orphan" className="grid scroll-mt-40 gap-2 rounded-lg border-2 border-destructive p-3">
        <strong>Das WC ist nicht mehr an der Wand montiert.</strong>
        <span>Die Platte 100 × 250 cm für die Vorwand ({name}) ist noch in der Wandverkleidung.</span>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => commitPlate(removePlate(offerNow()))}>Platte entfernen</Button>
          <Button variant="ghost" onClick={() => commitPlate(keepPlate())}>Behalten</Button>
        </div>
      </div>
    );
  }
  return (
    <div ref={box} data-testid="wv-wc-plate" data-state={mark.picked ? "added" : "pick"} className={cn("scroll-mt-40 rounded-lg border-2 p-3", mark.picked ? "border-border text-muted-foreground" : "border-primary font-semibold")}>
      {mark.picked
        ? <>Enthält 1 Platte 100 × 250 cm für die Vorwand des Wand-WCs ({name}).</>
        : <>Platte für die Vorwand des Wand-WCs (1 × 100 × 250 cm): bitte unten das Dekor wählen – vorläufig {name}.</>}
    </div>
  );
}
