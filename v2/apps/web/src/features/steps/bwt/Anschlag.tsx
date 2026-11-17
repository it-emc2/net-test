// Türanschlag: [← Links] [drawing] [Rechts →]. The two choices are today's (`bwtAnschlag`, "Links" / "Rechts");
// the drawing is top-down: the tub, the door in its front side, the hinge dot on the chosen side and the dashed
// arc inside the tub from the hinge point. The door is drawn in the chosen colour of the picked door. UX-CHANGES U-035.
import { cn } from "../../../shared/ui/index.js";
import { doorFill } from "./rules.js";
import { set, str, useBwt, type Fields } from "./store.js";

const SIDES = [{ value: "Links", label: "← Links" }, { value: "Rechts", label: "Rechts →" }] as const;
// the door is 80 wide in the front side (y = 90) from x = 80 to x = 160; it swings outward (down) on the hinge side;
// the dashed arc stays inside the tub and starts at the hinge point
const HINGE = { Links: { x: 80, tip: 160, arc: "M80 90 A60 60 0 0 0 140 30", open: "90deg" }, Rechts: { x: 160, tip: 80, arc: "M160 90 A60 60 0 0 1 100 30", open: "-90deg" } } as const;

export function AnschlagDrawing({ b }: { b: Fields }) {
  const side = str(b.bwtAnschlag) as "Links" | "Rechts" | "", fill = doorFill(b), h = side ? HINGE[side] : null;
  const desc = side ? `Draufsicht: die Tür sitzt in der Vorderseite der Wanne, der Drehpunkt ist auf der ${side === "Links" ? "linken" : "rechten"} Seite, die Tür schwingt nach außen, der gestrichelte Bogen beginnt am Drehpunkt.` : "Draufsicht: die Tür sitzt in der Vorderseite der Wanne. Wählen Sie den Anschlag, um den Drehpunkt zu sehen.";
  return (
    <svg role="img" aria-labelledby="anschlag-t anschlag-d" viewBox="0 0 240 190" className="mx-auto h-auto w-full max-w-xs text-foreground" data-testid="anschlag-drawing" data-side={side} data-fill={fill}>
      <title id="anschlag-t">Türanschlag{side ? ` ${side.toLowerCase()}` : ""}</title>
      <desc id="anschlag-d">{desc}</desc>
      <rect x="20" y="20" width="200" height="70" rx="14" fill="none" stroke="currentColor" strokeWidth="2.5" />
      {h ? <path data-part="arc" d={h.arc} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="6 6" /> : null}
      {/* key: the swing starts again whenever another side is chosen */}
      <g key={side} className={h ? "bwt-door-swing" : undefined} data-part="door" style={h ? ({ transformOrigin: `${h.x}px 90px`, "--bwt-open": h.open } as React.CSSProperties) : undefined}>
        <line x1={h ? h.x : 80} y1="90" x2={h ? h.tip : 160} y2="90" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
        <line x1={h ? h.x : 80} y1="90" x2={h ? h.tip : 160} y2="90" stroke={fill} strokeWidth="6" strokeLinecap="round" />
      </g>
      {h ? <circle data-part="hinge" cx={h.x} cy="90" r="6" fill="var(--primary)" stroke="currentColor" strokeWidth="2" /> : null}
    </svg>
  );
}

export function Anschlag() {
  const b = useBwt(), value = str(b.bwtAnschlag);
  const btn = (i: number) => {
    const s = SIDES[i]!, on = value === s.value;
    return (
      <label key={s.value} className={cn("inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", i ? "order-3 min-[600px]:order-3" : "order-2 min-[600px]:order-1", on ? "border-primary bg-accent-weak font-bold" : "border-input bg-card")}>
        <input type="radio" className="sr-only" name="bwtAnschlag" value={s.value} checked={on} onChange={() => set("bwtAnschlag", s.value)} />
        {s.label}
      </label>
    );
  };
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-2 items-center gap-3 border-0 p-0 min-[600px]:grid-cols-[auto_minmax(0,1fr)_auto]">
      <legend className="mb-1.5 p-0 font-semibold">Anschlag der Tür</legend>
      <div className="order-1 col-span-2 min-[600px]:order-2 min-[600px]:col-span-1"><AnschlagDrawing b={b} /></div>
      {btn(0)}{btn(1)}
    </fieldset>
  );
}
