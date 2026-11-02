/**
 * room-plan.js: magicplan XML → room model and where the new shower goes.
 * Synthetic plan (no customer data): bathroom 3.40 × 1.20 m inside (centre line
 * 3.52 × 1.32, walls 0.12), bathtub 1.70 × 0.75 in the top-left corner, door, window.
 */
import { parsePlan, showerSpots } from "../../src/logic/room-plan.js";

const xml = `<?xml version="1.0"?>
<plan name="T-1" interiorWallWidth="0.12000" exteriorWallWidth="0.25000">
<floor>
<symbolInstance id="W-0-0" uid="u-door" symbol="doorhinged"><values><value key="wallItemHeight">2.0</value></values></symbolInstance>
<symbolInstance id="W-0-1" uid="u-win" symbol="windowcasement"><values><value key="wallItemDistanceToFloor">0.92</value><value key="wallItemHeight">1.30</value></values></symbolInstance>
<symbolInstance id="F-0-0" uid="u-tub" symbol="plumbing-x"/>
<symbolInstance id="F-0-1" uid="u-wc" symbol="plumbing-y"/>
<floorRoom type="Bathroom" uid="u-room" x="0" y="0">
<values><value key="ceilingHeight">2.49</value></values>
<point snappedX="-1.76" snappedY="-0.66" height="2.49"/><point snappedX="1.76" snappedY="-0.66" height="2.49"/>
<point snappedX="1.76" snappedY="0.66" height="2.49"/><point snappedX="-1.76" snappedY="0.66" height="2.49"/>
</floorRoom>
<exploded>
<door type="2" x1="-1.76" y1="0.5" x2="-1.76" y2="-0.2" width="0.70" height="2.0" symbolInstance="W-0-0"/>
<window type="3" x1="1.76" y1="-0.3" x2="1.76" y2="0.3" width="0.60" height="1.30" symbolInstance="W-0-1"/>
<furniture type="0" x="-0.85" y="-0.225" angle="0" width="1.70" depth="0.75" height="0.60" symbolInstance="F-0-0"/>
<furniture type="0" x="1.30" y="0" angle="0" width="0.40" depth="0.60" height="0.80" symbolInstance="F-0-1"/>
</exploded>
</floor>
</plan>`;
const names = { "u-room": "Badezimmer", "u-door": "Klapptür", "u-win": "Flügelfenster", "u-tub": "Badewanne", "u-wc": "Toilette" };

describe("parsePlan", () => {
  const m = parsePlan(xml, names);
  test("inner walls are the centre line minus half the wall width (3.40 × 1.20)", () => {
    const xs = m.rooms[0].inner.map((p) => p[0]), ys = m.rooms[0].inner.map((p) => p[1]);
    expect((Math.max(...xs) - Math.min(...xs)).toFixed(2)).toBe("3.40");
    expect((Math.max(...ys) - Math.min(...ys)).toFixed(2)).toBe("1.20");
    expect(m.ceiling).toBe(2.49);
  });
  test("openings carry name, size and sill height from the scan", () => {
    const win = m.openings.find((o) => o.kind === "window");
    expect([win.name, win.width, win.height, win.sill]).toEqual(["Flügelfenster", 0.6, 1.3, 0.92]);
    expect(m.openings.find((o) => o.kind === "door").sill).toBe(0);
  });
  test("objects keep their names and dimensions", () => {
    expect(m.objects.map((o) => [o.name, o.w, o.d])).toEqual([["Badewanne", 1.7, 0.75], ["Toilette", 0.4, 0.6]]);
  });
});

describe("showerSpots", () => {
  test("bathtub in the corner → Ecke, touching the back and the left wall", () => {
    const [s] = showerSpots(parsePlan(xml, names));
    expect([s.kind, s.situation]).toEqual(["badewanne", "ecke"]);
    expect(s.sides.filter((x) => x.wall).length).toBe(2);
  });
  test("between two walls → Nische; free-standing → frei; nothing guessed without a tub", () => {
    const nische = xml.replace('x="-0.85" y="-0.225" angle="0" width="1.70"', 'x="0" y="-0.225" angle="0" width="3.40"');
    expect(showerSpots(parsePlan(nische, names))[0].situation).toBe("nische");
    const frei = xml.replace('x="-0.85" y="-0.225"', 'x="0" y="0"');
    expect(showerSpots(parsePlan(frei, names))[0].situation).toBe("frei");
    expect(showerSpots(parsePlan(xml, { ...names, "u-tub": "Regal" }))).toEqual([]);
  });
});
