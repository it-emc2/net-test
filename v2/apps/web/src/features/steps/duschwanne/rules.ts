// Duschwanne (Badumbau) — the rules of today's UI (test/fixtures/duschwanne.json,
// v2/scripts/capture-duschwanne.cjs):
//  - the switch: off stores no tray, no accessories and no free item (`trayEnabled: false`);
//    the page keeps what was chosen and it is all there again when switched on
//  - product line: Standard (Badolux) is `budgetMode: "1"`, Premium stores no `budgetMode`.
//    Changing the line drops the picked tray (the other line has other products)
//  - the size is searched in both lines; the active line's three best are offered
//  - a picked tray stores its id (`chosenTrayProductId`, `traySuggestion`) and its size label
//  - a change of the size drops the pick; if it fits the new size it is picked again
//  - accessories are stored by name while ticked; the free item becomes `quickAdd` once it has
//    a name and a price
import type { Tray } from "@oc/api-contract";

type Fields = Record<string, unknown>;
export type Line = "premium" | "standard";
export type { Tray };

// ---- the switch ----
/** older offers have no switch: on exactly when something of the tray is in the offer */
export function trayOn(dw: Fields): boolean {
  if (typeof dw.trayEnabled === "boolean") return dw.trayEnabled;
  return !!(dw.chosenTrayProductId || (Array.isArray(dw.quickAdd) && dw.quickAdd.length) || dw.dwCustomName || dw.dwCustomPrice || dw.abdichtSet || dw.drainSet || dw.stelzlager || dw.smallMaterial);
}
export const ACCESSORIES = [
  { name: "abdichtSet", value: "Wannenabdichtband-Set TRWDB", caption: "Wannenabdichtband-Set TRWDB", small: "3,4 m · Nass-/Trockenanbindung, DIN 18534", img: "/assets/4ab307d6db904aac6d543a80540e67ec.jpg" },
  { name: "drainSet", value: "Ablaufgarnitur TRAGD9060", caption: "Ablaufgarnitur TRAGD9060", small: "Rohbauset mit Sifon, BH 60 mm, 90 mm Ablauf", img: "/assets/6cb23edb7f6d925879e1b66555b46953.jpg" },
  { name: "stelzlager", value: "PLA5282", caption: "Stelzlager-Set PLA5282", small: "Plattenlager Pro, justierbar 64–110 mm", img: "/assets/66c7f69e3b6da9039473c86f44789340.jpg" },
  { name: "smallMaterial", value: "Kleinmaterial", caption: "Kleinmaterial", small: "KM02", img: "/assets/f030d384f7446f713c5a34a0633f99fa.jpg" },
] as const;
/** the Standard line shows (and bills) the Siphon Bridge 90 as drain; the stored value is the same */
export const accessoryText = (a: (typeof ACCESSORIES)[number], line: Line) =>
  a.name === "drainSet" && line === "standard" ? { caption: "Siphon Bridge 90 PR95DW001", small: "Badolux · Ablauf 90 mm" } : { caption: a.caption, small: a.small };
const ALL_ACCESSORIES: Fields = Object.fromEntries(ACCESSORIES.map((a) => [a.name, a.value]));
const CUSTOM_EMPTY: Fields = { dwCustomName: "", dwCustomPrice: "", dwCustomQty: "1", dwCustomId: "" };
/** what is on the page but not stored while the tray is off */
const PARKED = ["quickAdd", "abdichtSet", "drainSet", "stelzlager", "smallMaterial", "traySuggestion", "chosenTrayProductId", "traySize", ...Object.keys(CUSTOM_EMPTY)] as const;

export function switchTray(dw: Fields, on: boolean, parked: Fields | null): { changes: Fields; parked: Fields | null } {
  if (!on) {
    return {
      changes: { trayEnabled: false, quickAdd: undefined, abdichtSet: undefined, drainSet: undefined, stelzlager: undefined, smallMaterial: undefined, traySuggestion: undefined, chosenTrayProductId: null, traySize: "", ...CUSTOM_EMPTY },
      parked: Object.fromEntries(PARKED.filter((k) => k in dw).map((k) => [k, dw[k]])),
    };
  }
  // nothing remembered (a new offer, or one opened with the tray off): all accessories, as the page starts
  return { changes: { trayEnabled: true, ...(parked ?? ALL_ACCESSORIES) }, parked: null };
}

// ---- product line ----
export const lineOf = (dw: Fields): Line => (dw.budgetMode ? "standard" : "premium");
export const LINE_TEXT: Record<Line, { name: string; brand: string; sub: string }> = {
  standard: { name: "Standard", brand: "Badolux", sub: "Badolux · günstig" },
  premium: { name: "Premium", brand: "Vigour / Hassmann", sub: "Vigour · Hassmann" },
};
/** `keep`: the picked tray belongs to the line being switched to (the cheaper-offer button) */
export const chooseLine = (line: Line, keep = false): Fields =>
  ({ budgetMode: line === "standard" ? "1" : undefined, ...(keep ? {} : { chosenTrayProductId: null, traySuggestion: undefined }) });

// ---- size and search ----
/** "90" / "90,5" → number; nothing usable → null (today's parseNum) */
export function parseDim(v: unknown): number | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** the two searches for a size: [Premium (Slate series), Standard (Badolux)]; null: no size entered */
export function searches(w: unknown, l: unknown): { premium: string; standard: string } | null {
  const b = parseDim(w), len = parseDim(l);
  if (b === null && len === null) return null;
  const base = [b !== null ? `w=${b}` : "", len !== null ? `l=${len}` : ""].filter(Boolean).join("&");
  return { premium: `${base}&series=SLA`, standard: `${base}&source=badolux` };
}
/** the size the offer stores for a tray: "120 x 90 x 3 cm" (only with all three measures) */
export const sizeLabel = (p: Tray): string => (p.widthCm && p.lengthCm && p.heightCm ? `${p.widthCm} x ${p.lengthCm} x ${p.heightCm} cm` : "");
export const changeSize = (w: string, l: string): Fields => ({ tray_w_cm: w, tray_l_cm: l, chosenTrayProductId: null, traySuggestion: undefined, traySize: "" });
/** picking a tray; the colour is only for Slate trays — any other goes back to white */
export const pickTray = (p: Tray): Fields => ({ chosenTrayProductId: p.productId, traySuggestion: p.productId, traySize: sizeLabel(p), ...(isSlate(p.productId) ? {} : { trayColor: "Weiss" }) });
export const isSlate = (pid: unknown): boolean => /^SLA/i.test(String(pid ?? "").trim());

// ---- what a result row says ----
/** "Duschwanne Slate 120x90x3cm Mineralguss weiss Nuovvo" → "Slate 120 × 90 × 3 cm, Mineralguss weiß" */
export function shortTrayName(name: unknown): string {
  let s = String(name ?? "").replace(/\bDuschwanne\b/gi, " ").replace(/\bNuovvo\b/gi, " ");
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?\s*(?:cm)?/i, (_m, a, b, c) => ` ${[a, b, c].filter(Boolean).join(" × ")} cm,`);
  s = s.replace(/\bweiss\b/gi, "weiß").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
  return s.replace(/,$/, "") || String(name ?? "");
}
/** Badolux trays are the Riviera series */
export function badoluxTrayName(p: Tray): string {
  const dims = [p.widthCm, p.lengthCm, p.heightCm].filter(Boolean).map((v) => String(v).replace(".", ","));
  return dims.length >= 2 ? `Riviera ${dims.join(" × ")} cm` : shortTrayName(p.name || p.productId);
}
export const trayTitle = (p: Tray, line: Line): string => (line === "standard" ? badoluxTrayName(p) : shortTrayName(p.name || p.productId || "Duschwanne"));
export const euro = (n: unknown): string => Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const priceText = (p: Tray): string => (p.price != null ? `${euro(p.price)} €` : "");
const SOON: Record<number, string> = { 3: "Verbundhaus 2–5 Tage", 6: "Zentrallager 24 h", 9: "Nachtverbund bis 18 Uhr" };
/** stock, only for articles the stock database knows */
export function stockText(p: Tray): { kind: "in" | "soon" | "out"; text: string } | null {
  if (p.stockQuantity == null && p.stockText == null) return null;
  const qty = Number(p.stockQuantity) || 0;
  if (qty > 0) return { kind: "in", text: `${qty} auf Lager` };
  const soon = SOON[Number(p.stockSymbol)];
  return soon ? { kind: "soon", text: soon } : { kind: "out", text: "Auf Bestellung" };
}
/** size and article number, where the title does not say them already */
export function trayExtras(p: Tray, title: string): string {
  const size = [p.widthCm, p.lengthCm].filter(Boolean).join(" × "), rev = [p.lengthCm, p.widthCm].filter(Boolean).join(" × ");
  return [size && !title.includes(size) && !title.includes(rev) ? `${size} cm` : "", p.articleNumber ? `Art.-Nr. ${p.articleNumber}` : ""].filter(Boolean).join(" · ");
}

/** A Premium tray is picked and Badolux has the same size cheaper → the offer to switch. */
export function cheaper(picked: Tray | undefined, standard: readonly Tray[]): { tray: Tray; text: string; detail: string } | null {
  if (!picked) return null;
  const key = (p: Tray) => [Number(p.widthCm), Number(p.lengthCm)].sort((a, b) => a - b).join("x");
  const alt = standard.filter((b) => key(b) === key(picked) && Number.isFinite(Number(b.price))).sort((a, b) => Number(a.price) - Number(b.price))[0];
  const save = alt ? Number(picked.price) - Number(alt.price) : 0;
  if (!alt || !(save >= 0.01)) return null;
  return {
    tray: alt, text: `Diese Größe gibt es auch als Standard (Badolux) — ${euro(save)} € günstiger.`,
    detail: `${badoluxTrayName(alt)} · ${euro(alt.price)} € statt ${euro(picked.price)} € (Duschwanne, netto). Die Ablaufgarnitur wechselt dabei zur Siphon Bridge 90.`,
  };
}

// ---- accessories, quantity, free item ----
export const toggleAccessory = (name: string, value: string, on: boolean): Fields => ({ [name]: on ? value : undefined });
export const stepQty = (qty: unknown, delta: number): Fields => {
  const v = parseInt(String(qty), 10) || 8;
  const next = v + delta;
  return next >= 1 && next <= 99 ? { stelzlagerQty: String(next) } : {};
};
/** the free item: in the offer (`quickAdd`) once it has a name and a price */
export function customItem(dw: Fields, change: Fields): Fields {
  const c = { ...dw, ...change };
  const name = String(c.dwCustomName ?? "").trim(), price = String(c.dwCustomPrice ?? "").trim();
  return { ...change, quickAdd: name && price ? [{ label: name, price, qty: Math.max(1, parseInt(String(c.dwCustomQty), 10) || 1), productId: String(c.dwCustomId ?? "").trim() }] : undefined };
}

// ---- "Ihre Auswahl" ----
export const COLORS = [
  { value: "Weiss", label: "Weiß" }, { value: "Elfenbein", label: "Elfenbein" }, { value: "Steingrau", label: "Steingrau" },
  { value: "Beton", label: "Beton" }, { value: "Anthrazit", label: "Anthrazit" }, { value: "Schwarz", label: "Schwarz" },
] as const;
export const colorImage = (value: string) => `/assets/slate-color-${value.toLowerCase()}.jpg`;
export function summary(dw: Fields, tray: Tray | undefined, line: Line): { title: string; sub: string; items: string[] } | null {
  const pid = String(dw.chosenTrayProductId ?? "");
  if (!pid) return null;
  const color = COLORS.find((c) => c.value === dw.trayColor) ?? COLORS[0];
  const slate = isSlate(pid);
  let title = tray ? trayTitle(tray, line) : String(dw.traySize || pid);
  if (slate && color.value !== "Weiss") title = title.replace(/\bwei(?:ß|ss)/i, color.label); // Slate names always say "weiß"
  const kind = slate ? `Slate · Farbe ${color.label}` : line === "standard" ? "Badolux · extraflach" : "Hassmann";
  const sub = [kind, `Art.-Nr. ${tray?.articleNumber || pid}`, tray ? priceText(tray) : ""].filter(Boolean).join(" · ");
  const items = ACCESSORIES.filter((a) => dw[a.name]).map((a) => (a.name === "stelzlager" ? `${dw.stelzlagerQty || 8} × ` : "") + accessoryText(a, line).caption);
  return { title, sub, items };
}
