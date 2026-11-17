// Badewannentür, slice 1 — what the step stores, as today's UI does
// (test/fixtures/bwt-tuer.json, v2/scripts/capture-bwt-tuer.cjs). All fields live in `bwt`.
//  - one door at a time (`bwtDoorType` = its name); picking one sets its quantity to 1 (unless it
//    already has one) and the quantity of the door that was on to "0"; taking it off sets "0"
//  - the four grab bars are independent: `bwtAids` lists the ticked ones (removed when none),
//    the quantity is "1" when ticked and "0" when not
//  - the three Umbau-Check ticks are `bwtinfoTasks` (removed when none)
//  - Stahl emailliert ticks the steel note (`bwtSteelNoteEnabled`); it is never unticked by a later pick
//  - `doorInfoById` (what the offer document says about the picked door) is made again in every
//    change: the door's fixed lines, "Türanschlag", and for Wien / Wien Glas the typed sizes + colour
//  - the offer's top-level `materials` lists the picked door and the ticked grab bars with their
//    quantity (door first, then grab bars 30…80; a quantity that is not above 0 is left out). When that
//    list would be empty, today's UI leaves the stored `materials` as it was (kept, same as today)
//  - the price reads these fields only (pricing core, offer === "bwt")
type Fields = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export interface Door {
  key: string; pid: string; value: string; img: string;
  /** field names: quantity, colour */
  qty: string; color: string;
  /** "pills": Weiß / Bahama Beige / Manhattan · "select": weiß / silber · "text": frame colour typed */
  colorKind: "pills" | "select" | "text";
  facts: readonly string[]; dims: boolean;
}
export const DOORS: readonly Door[] = [
  { key: "std", pid: "1226", value: "Universal / Standard Tür", img: "/assets/tur.jpg", qty: "bwtDoorStdQty", color: "bwtDoorStdColor", colorKind: "pills", dims: false,
    facts: ["• Höhen 40 bis 33cm abschneidbar", "• Fix Bereite 40,5 cm", "• Tiefe O 25cm U 25cm"] },
  { key: "wien", pid: "1227", value: "Individual Tür - Wien", img: "/assets/wien.jpg", qty: "bwtDoorIndWienQty", color: "bwtDoorIndWienColor", colorKind: "select", dims: true, facts: [] },
  { key: "glas", pid: "1228", value: "Individual Tür - Wien Glas", img: "/assets/wienglas1.jpg", qty: "bwtDoorIndWienGlasQty", color: "bwtDoorIndWienGlasFrameColor", colorKind: "text", dims: true, facts: [] },
  { key: "verona", pid: "1225", value: "Budget Tür - Verona", img: "/assets/verona.png", qty: "bwtDoorBudgetQty", color: "bwtDoorBudgetColor", colorKind: "pills", dims: false,
    facts: ["• Höhen 34,36,38,40 cm", "• Fix Bereite 40,5 cm", "• Tiefe O13 cm U20 cm"] },
  { key: "vario", pid: "1320", value: "Variodoor", img: "/assets/variodoor.jpg", qty: "bwtDoorVariodoorQty", color: "bwtDoorVariodoorColor", colorKind: "pills", dims: false, facts: [] },
];
/** the dimension fields of Wien / Wien Glas: the field suffix and its name in the document */
export const DIMS = [["Height", "Höhe"], ["Width", "Breite"], ["StdWidth", "Standardbreite"], ["DepthTop", "Tiefe O"], ["DepthBottom", "Tiefe U"]] as const;
export const dimField = (d: Door, suffix: string) => `${d.qty.replace(/Qty$/, "")}${suffix}`;

export const GRIPS = [30, 40, 60, 80].map((n) => ({ n, value: `Haltegriff${n}`, qty: `bwtAidsHaltegriff${n}Qty`, label: `Haltegriff ${n} cm` }));
export const UMBAU = [["flat_surface", "Fläche ist gerade und eben im Bereich der BWT"], ["fixture_free", "Fläche ist frei von Armaturen"], ["not_whirlpool", "Ist kein Whirlpool"]] as const;
export const SHAPES = ["Normal, rechteckig", "abgerundete Eckbadewanne", "eckige Eckbadewanne", "spezielle Form"] as const;
export const MATERIALS = [["Acryl", "Acryl"], ["Stahl emailliert", "Stahl emailliert"], ["Gusseisen", "Gusseisen"], ["Weiß ich nicht", "Nicht bekannt"]] as const;
export const COLORS = [["weiß", "Weiß", "#fffdfa"], ["Beige", "Bahama Beige", "#FDF5EA"], ["Manhattan", "Manhattan", "#D1D0CC"]] as const;

export const doorOn = (b: Fields, d: Door) => str(b.bwtDoorType) === d.value;
export const gripOn = (b: Fields, n: number) => Array.isArray(b.bwtAids) && (b.bwtAids as unknown[]).map(str).includes(`Haltegriff${n}`);
export const umbauOn = (b: Fields, key: string) => Array.isArray(b.bwtinfoTasks) && (b.bwtinfoTasks as unknown[]).map(str).includes(key);

/** the lines the offer document says about the picked door */
export function doorInfo(b: Fields): Record<string, string[]> {
  const d = DOORS.find((x) => doorOn(b, x));
  if (!d) return {};
  const lines = [...d.facts];
  const anschlag = str(b.bwtAnschlag);
  if (anschlag) lines.push(`Türanschlag: ${anschlag.toLowerCase()}`);
  if (d.dims) {
    for (const [suffix, name] of DIMS) {
      const v = str(b[dimField(d, suffix)]);
      if (v) lines.push(suffix === "StdWidth" ? `${name}: ${v}` : `${name}: ${v} cm`);
    }
    const c = str(b[d.color]);
    if (c) lines.push(`${d.key === "glas" ? "Rahmen-Farbe" : "Farbe"}: ${c}`);
  }
  return lines.length ? { [d.pid]: lines } : {};
}

/** the fields to write for a change: the change itself and the document lines made again */
export function withInfo(b: Fields, change: Fields): Fields {
  const next = { ...b, ...change };
  for (const k of Object.keys(change)) if (change[k] === undefined) delete next[k];
  return { ...change, doorInfoById: doorInfo(next) };
}

/** a tap on a door card */
export function toggleDoor(b: Fields, d: Door): Fields {
  if (doorOn(b, d)) return { bwtDoorType: undefined, [d.qty]: "0" };
  const change: Fields = { bwtDoorType: d.value, [d.qty]: Number.parseInt(str(b[d.qty]), 10) > 0 ? b[d.qty] : "1" };
  const was = DOORS.find((x) => doorOn(b, x));
  if (was) change[was.qty] = "0";
  return change;
}
export function toggleGrip(b: Fields, n: number): Fields {
  const g = GRIPS.find((x) => x.n === n)!, on = !gripOn(b, n);
  const aids = GRIPS.filter((x) => (x.n === n ? on : gripOn(b, x.n))).map((x) => x.value);
  return { bwtAids: aids.length ? aids : undefined, [g.qty]: on ? (Number.parseInt(str(b[g.qty]), 10) > 0 ? b[g.qty] : "1") : "0" };
}
export function toggleUmbau(b: Fields, key: string): Fields {
  const keys = UMBAU.map(([k]) => k).filter((k) => (k === key ? !umbauOn(b, k) : umbauOn(b, k)));
  return { bwtinfoTasks: keys.length ? keys : undefined };
}
/** the material; steel ticks the steel note and keeps it ticked */
export function setMaterial(b: Fields, value: string): Fields {
  const v = value.toLowerCase();
  return { bwtMaterial: value, ...(v.includes("stahl") && v.includes("email") && b.bwtSteelNoteEnabled !== "on" ? { bwtSteelNoteEnabled: "on" } : {}) };
}

/** the offer's `materials` for the step's fields — null when there is nothing to list (nothing is written then) */
export function materialsOf(b: Fields): { name: string; productId: string; qty: number }[] | null {
  const out: { name: string; productId: string; qty: number }[] = [];
  const d = DOORS.find((x) => doorOn(b, x));
  if (d) { const qty = Number.parseInt(str(b[d.qty]) || "0", 10) || 0; if (qty) out.push({ name: d.value, productId: d.pid, qty }); }
  const ids: Record<number, string> = { 30: "CLPESG30", 40: "CLPESG40", 60: "CLPESG60", 80: "CLPESG80" };
  for (const g of GRIPS) if (gripOn(b, g.n)) { const qty = Number.parseInt(str(b[g.qty]) || "0", 10) || 0; if (qty) out.push({ name: g.label, productId: ids[g.n]!, qty }); }
  return out.length ? out : null;
}

/** "Weiter": the shape of the tub and the door are needed (UX-CHANGES U-029; today only the old page's form check asks) */
export function bwtMissing(b: Fields): { shape: boolean; door: boolean } {
  return { shape: !str(b.bwtShape), door: !DOORS.some((d) => doorOn(b, d)) };
}
export function bwtProblem(b: Fields): { message: string; focus: string } | null {
  const m = bwtMissing(b), names = [m.shape ? "Wannenform" : "", m.door ? "Tür" : ""].filter(Boolean);
  return names.length ? { message: `Bitte wählen Sie noch: ${names.join(", ")}`, focus: m.shape ? '[name="bwtShape"]' : '[name="bwtDoorType"]' } : null;
}
