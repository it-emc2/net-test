// Türanschlag: [← Links] [animation] [Rechts →]. The two choices are today's (`bwtAnschlag`, "Links" / "Rechts").
// The animation is a Lottie file (door-animation.json: left hinge, the door swings inward) played once when a side
// is chosen; "Rechts" is the same animation mirrored. The door is tinted with the chosen colour of the picked door
// (layer `tub_door` only). The player (lottie-web, light build) and the animation are loaded when this step is
// opened — never in the start bundle. With "reduce motion" nothing plays: the door is shown open. UX-CHANGES U-036.
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/ui/index.js";
import { doorTint, tintedDoor } from "./rules.js";
import { set, str, useBwt } from "./store.js";

const SIDES = [{ value: "Links", label: "← Links" }, { value: "Rechts", label: "Rechts →" }] as const;
export const OPEN_FRAME = 60;
interface Player { goToAndPlay(frame: number, isFrame?: boolean): void; goToAndStop(frame: number, isFrame?: boolean): void; destroy(): void }

export function AnschlagAnimation({ side, tint }: { side: string; tint: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const first = useRef(true);
  // (re)built when the colour changes
  useEffect(() => {
    let gone = false, made: Player | null = null;
    void Promise.all([import("lottie-web/build/player/lottie_light"), import("./door-animation.json")]).then(([lottie, data]) => {
      if (gone || !box.current) return;
      made = (lottie.default ?? lottie).loadAnimation({ container: box.current, renderer: "svg", loop: false, autoplay: false, animationData: tintedDoor(structuredClone(data.default ?? data), tint) }) as unknown as Player;
      made.goToAndStop(0, true); // closed
      first.current = true;
      setPlayer(made);
    });
    return () => { gone = true; made?.destroy(); setPlayer(null); };
  }, [tint]);
  // plays once whenever a side is chosen
  useEffect(() => {
    if (!player) return;
    const still = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, loaded = first.current;
    first.current = false;
    if (!side) player.goToAndStop(0, true);
    else if (still) player.goToAndStop(OPEN_FRAME, true);
    else if (loaded) player.goToAndStop(0, true); // a side restored with the offer: shown closed, not played
    else player.goToAndPlay(0, true);
  }, [player, side]);
  return (
    <div ref={box} role="img" aria-label={side ? `Badewannentür, Anschlag ${side.toLowerCase()}` : "Badewannentür, Anschlag nicht gewählt"} data-testid="anschlag-animation" data-side={side}
      className="mx-auto aspect-[8/5] w-full max-w-[380px]" style={side === "Rechts" ? { transform: "scaleX(-1)" } : undefined} />
  );
}

export function Anschlag() {
  const b = useBwt(), value = str(b.bwtAnschlag);
  const btn = (i: number) => {
    const s = SIDES[i]!, on = value === s.value;
    return (
      <label key={s.value} className={cn("inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", i ? "order-3" : "order-2 min-[600px]:order-1", on ? "border-primary bg-accent-weak font-bold" : "border-input bg-card")}>
        <input type="radio" className="sr-only" name="bwtAnschlag" value={s.value} checked={on} onChange={() => set("bwtAnschlag", s.value)} />
        {s.label}
      </label>
    );
  };
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-2 items-center gap-3 border-0 p-0 min-[600px]:grid-cols-[auto_minmax(0,1fr)_auto]">
      <legend className="mb-1.5 p-0 font-semibold">Anschlag der Tür</legend>
      <div className="order-1 col-span-2 min-[600px]:order-2 min-[600px]:col-span-1"><AnschlagAnimation side={value} tint={doorTint(b)} /></div>
      {btn(0)}{btn(1)}
    </fieldset>
  );
}
