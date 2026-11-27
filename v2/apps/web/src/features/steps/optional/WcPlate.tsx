// Optionale Produkte → WC, wall-mounted with the VIS element: the card for the Vorwand's plate of
// Wandverkleidung (rules: wandverkleidung/wc-plate.ts, ADR 032). Nothing happens without a tap.
import { Check } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../../../shared/ui/index.js";
import { useOfferStore } from "../../offer/index.js";
import { decorOf, rowsOf } from "../wandverkleidung/rules.js";
import { isSimple, load } from "../wandverkleidung/simple.js";
import { NOTE, addPlate, cardOf, decorName, removePlate } from "../wandverkleidung/wc-plate.js";
import { PICK, commitPlate } from "../wandverkleidung/WcPlateNote.js";

type Fields = Record<string, unknown>;
const offerNow = () => (useOfferStore.getState().offer ?? {}) as Record<string, any>;
const LINE_NAME = { premium: "VIGOUR", standard: "Badolux" } as const;
const CARD = "grid gap-2 rounded-lg border-2 border-border bg-card p-3";

export function WcPlateCard() {
  const navigate = useNavigate();
  const optional = useOfferStore((s) => (s.offer as Record<string, any> | null)?.optional as Fields | undefined);
  const wandverkleidung = useOfferStore((s) => (s.offer as Record<string, any> | null)?.wandverkleidung as Fields | undefined);
  const extra = useOfferStore((s) => (s.offer as Record<string, any> | null)?.duschwanne?.extraTasks as unknown);
  const card = cardOf({ optional, wandverkleidung });
  if (card.kind === "none") return null;
  const toWv = () => void navigate("../Wandverkleidung", { relative: "path" });
  /** „Anderes Dekor wählen“: the plate as a further Dekor, opened in the Wandverkleidung for the pick */
  const other = () => {
    const o = offerNow(), r = addPlate(o, "other");
    const wv = { ...(o.wandverkleidung ?? {}), ...r.wv };
    const { remember } = useOfferStore.getState();
    if (isSimple(wv)) {
      const st = load(rowsOf(wv));
      remember("wvSimple", { ...st, active: Math.max(0, st.groups.findIndex((g) => g.code === r.decor)) });
      remember("wvsOther", "");
      commitPlate(r);
    } else {
      remember("wvRowOpen", { idx: r.rowIndex, folded: false });
      commitPlate({ ...r, wv: { ...r.wv, ...decorOf(rowsOf(wv)[r.rowIndex]) } });
    }
    remember(PICK, true);
    toWv();
  };
  if (card.kind === "line") {
    return (
      <section data-testid="wc-plate" data-state="line" aria-label="Wandverkleidung für die Vorwand" className={CARD}>
        <strong>Für die Vorwand wird 1 Platte Wandverkleidung benötigt.</strong>
        <span>Produktlinie {LINE_NAME[card.line]}: bitte {card.panel} in der Wandverkleidung ergänzen – sie wird nicht automatisch hinzugefügt.</span>
        <div><Button variant="outline" onClick={toWv}>Zur Wandverkleidung</Button></div>
      </section>
    );
  }
  const noted = Array.isArray(extra) && extra.includes(NOTE);
  if (card.kind === "added") {
    return (
      <section data-testid="wc-plate" data-state="added" aria-label="Wandverkleidung für die Vorwand" className={CARD}>
        <strong className="flex items-start gap-2"><Check aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />1 Platte 100 × 250 cm für die Vorwand ist in der Wandverkleidung.</strong>
        <span data-part="decor">Dekor: {decorName(card.decor)}{card.picked ? "" : " – bitte in der Wandverkleidung wählen"}</span>
        {card.changed ? <span data-part="changed" className="text-muted-foreground">In der Wandverkleidung geändert – bitte dort prüfen.</span> : null}
        {noted ? <span data-part="note" className="text-muted-foreground">In den Arbeiten unter „Weitere Arbeiten“ vermerkt.</span> : null}
        {card.off ? <span data-part="off" className="font-semibold text-destructive">Die Wandverkleidung ist ausgeschaltet – die Platte wird nicht berechnet.</span> : null}
        <div className="flex flex-wrap gap-2">
          {card.off ? <Button onClick={() => commitPlate({ wv: { wvEnabled: true }, dw: {} })}>Wandverkleidung einschalten</Button> : null}
          <Button variant="outline" onClick={toWv}>Zur Wandverkleidung</Button>
          <Button variant="ghost" onClick={() => commitPlate(removePlate(offerNow()))}>Entfernen</Button>
        </div>
      </section>
    );
  }
  return (
    <section data-testid="wc-plate" data-state={card.off ? "off" : "open"} aria-label="Wandverkleidung für die Vorwand" className={CARD}>
      <strong>Für die Vorwand wird 1 Platte Wandverkleidung 100 × 250 cm benötigt.</strong>
      {card.gone ? <span data-part="gone" className="text-muted-foreground">Die Platte ist nicht mehr in der Wandverkleidung.</span> : null}
      <span data-part="decor">Dekor der Wandverkleidung: {decorName(card.decor)}</span>
      {card.off ? <span data-part="off">Die Wandverkleidung ist ausgeschaltet – sie wird mit dieser Platte eingeschaltet.</span> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => commitPlate(addPlate(offerNow(), "same"))}>{card.off ? "Einschalten, im Dekor der Wandverkleidung" : "Im Dekor der Wandverkleidung hinzufügen"}</Button>
        <Button variant="outline" onClick={other}>Anderes Dekor wählen</Button>
      </div>
    </section>
  );
}
