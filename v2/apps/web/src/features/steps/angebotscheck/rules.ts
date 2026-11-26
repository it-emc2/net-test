// Angebotscheck (Badumbau) — the rules of today's UI (src/public/angebotscheck.js; reference:
// test/fixtures/angebotscheck.json, v2/scripts/capture-angebotscheck.cjs):
//  - every rule that applies to this offer gives ONE row, also when it passes: a green row is
//    the proof that the check looked. A rule that does not apply gives no row
//  - rows are grouped as the offer is (Arbeiten / Material / Optionale Produkte), each row names
//    the step that fixes it; status per row, group and overall: worst wins, worst first
//  - three kinds of rows: standing rules, work task ⇄ product, and the Rückbau questions
//  - what today's UI reads from the page is read here from the offer itself (same fields)
//  - stored by this step: `zusammenfassung.checkAck` ("Nicht nötig", and "Nein" on a Rückbau
//    question); "Ja" ticks the removal task as if ticked by hand on the step Arbeiten
import { markupView } from "../markup/rules.js";

type Fields = Record<string, unknown>;
export type Status = "gruen" | "gelb" | "rot";
export interface Line { productId?: string; id?: string; label?: string; name?: string; category?: string; qty?: unknown; lineTotal?: unknown }
export interface Price { services?: Fields; servicesDisplayUI?: Fields; materials?: Fields; materialsDisplayUI?: Fields; optionalDisplayUI?: Fields }
export interface Row {
  id: string; group: GroupKey; target: string; title: string; status: Status; details: string[];
  /** "Nicht nötig" can be ticked (or taken back) */
  ack?: boolean;
  /** a Ja / Nein question about a removal task */
  question?: { task: string; answer: "ja" | "nein" | "" };
  /** the details are internal (the markup): hidden in the Kundenmodus, the line itself stays */
  internal?: true;
}
export type GroupKey = "arbeiten" | "material" | "optional";
export interface Group { key: GroupKey; title: string; target: string; status: Status; rows: Row[]; counts: { status: Status; count: number }[] }
export interface Result { status: Status; groups: Group[] }

const RANK: Record<Status, number> = { gruen: 0, gelb: 1, rot: 2 };
const worst = (a: Status, b: Status): Status => (RANK[b] > RANK[a] ? b : a);
export const STATUS_TEXT: Record<Status, string> = { gruen: "In Ordnung", gelb: "Bitte prüfen", rot: "Fehlt" };
export const GROUPS: readonly { key: GroupKey; title: string; target: string }[] = [
  { key: "arbeiten", title: "Auszuführende Arbeiten", target: "Arbeiten" },
  { key: "material", title: "Material für Badumbau", target: "Duschwanne" },
  { key: "optional", title: "Optionale Produkte", target: "Optional" },
];

const obj = (v: unknown): Fields => (v && typeof v === "object" && !Array.isArray(v) ? (v as Fields) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const lines = (x: unknown): Line[] => list(obj(x).lines) as Line[];
const total = (l: Line) => Number(l?.lineTotal) || 0;
const nameOf = (l: Line) => String(l?.label || l?.name || l?.productId || "Position");
const idOf = (l: Line) => String(l?.productId || l?.id || "");
const inCategory = (l: Line, cat?: string) => !cat || String(l?.category || "").toLowerCase() === cat.toLowerCase();
const hasCategory = (ls: Line[], cat: string) => ls.some((l) => inCategory(l, cat));
const text = (v: unknown) => String(v ?? "").trim();

/** What the rules look at: the offer's own fields and the priced lines. */
export interface Selection {
  tasks: Set<string>;
  /** a product of an optional group is ticked (`optBasin[]` …) */
  opt(name: string): boolean;
  wcPicked(): boolean;
  field(name: string): boolean;
  value(name: string): string;
  ticked(name: string): boolean;
  priced(id: string): boolean;
  material(category: string): boolean;
  trayEnabled(): boolean;
  accessory(name: string): boolean;
  daLines(): { articleNumber?: string }[];
  daVigour(): boolean;
  daConfigured(): boolean;
  curtainConfigured(): boolean;
  acked(id: string): boolean;
  umbauart: string;
  markup: { min: number; reason: string } | null;
}
interface Ctx { services: Fields; materials: Fields; optionals: Fields; sel: Selection }

const lineQty = (materials: Fields, pid: string, cat?: string) => lines(materials).filter((l) => idOf(l) === pid && inCategory(l, cat)).reduce((n, l) => n + (Number(l?.qty) || 0), 0);
/** a Wandverkleidung line — the Fußboden uses the same Flächenkleber article */
const wvLine = (materials: Fields, pid: string) => lineQty(materials, pid, "Wandverkleidung") > 0;
/** Wandverkleidung panels in the offer: VIGOUR (V3WV…) and Badolux (WP…) — the VIGOUR-only rules count these */
export const wvPanels = (materials: Fields) => lines(materials).filter((l) => /^(V3WV|WP\d)/i.test(idOf(l)) && inCategory(l, "Wandverkleidung")).reduce((n, l) => n + (Number(l?.qty) || 0), 0);
/** winwall plates: decor + format (NW22015, WS20313). Decor numbers never start with 8, so the
 *  accessories (WS80113, WS80301 …) are not counted (main 68b454a9) */
export const winwallPanels = (materials: Fields) => lines(materials).filter((l) => /^(WS|NW)[0-7]\d{2}(13|15|16|17)$/i.test(idOf(l)) && inCategory(l, "Wandverkleidung")).reduce((n, l) => n + (Number(l?.qty) || 0), 0);
/** any Wandverkleidung panel — where any panel counts (completeness, pre-send question) */
export const anyWvPanels = (materials: Fields) => wvPanels(materials) + winwallPanels(materials);
const pricedIds = ({ materials, optionals }: Pick<Ctx, "materials" | "optionals">) => new Set([...lines(materials), ...lines(optionals)].map(idOf));

const WC_WALL = ["DERWWCOSVP", "DEDWWC", "CLPWWCOS5"], WC_FLOOR = ["CLPWCF10"];
const wcKind = (ctx: Ctx): "wall" | "floor" | null => {
  const ids = pricedIds(ctx);
  return WC_WALL.some((p) => ids.has(p)) ? "wall" : WC_FLOOR.some((p) => ids.has(p)) ? "floor" : null;
};
const BASINS = ["CL60", "CL65", "CL55", "ON35", "COAIR40", "DEP65U"];
const BASIN_ACC = [["WTBF", "Befestigungssatz (WTBF)"], ["RSL", "Röhrensiphon (RSL)"], ["EV", "Eckventil (EV)"]] as const;
const TRAY_ACC = [["abdichtSet", "Wannenabdichtband-Set"], ["drainSet", "Ablaufgarnitur"], ["smallMaterial", "Kleinmaterial"], ["stelzlager", "Stelzlager höhenverstellbar Set"]] as const;

type Hit = string | false | null | undefined;
interface Rule { id: string; group: GroupKey; target?: string; title: string; severity: Status; ackable?: boolean; internal?: true; applies?: (ctx: Ctx) => boolean; test: (ctx: Ctx) => Hit | Hit[] }
/** Standing checks. `test` returns nothing when the rule passes, else the problem text(s). */
export const RULES: readonly Rule[] = [
  { id: "aufschlag-unter-min", group: "arbeiten", target: "rabatt", title: "Aufschlag", severity: "gelb", internal: true,
    test: ({ sel }) => !!sel.markup && `Aufschlag unter Mindestwert (${sel.markup.min} %): ${sel.markup.reason}` },
  { id: "arbeiten-leer", group: "arbeiten", title: "Arbeitspositionen erfasst", severity: "rot", test: ({ services }) => lines(services).length === 0 && "Keine Arbeitsposition erfasst." },
  { id: "arbeiten-ohne-preis", group: "arbeiten", title: "Arbeitspositionen bepreist", severity: "gelb",
    test: ({ services }) => lines(services).length > 0 && Number(services?.sum) <= 0 && "Arbeitspositionen vorhanden, aber Summe ist 0,00 €." },
  { id: "anfahrt-fehlt", group: "arbeiten", target: "Arbeitszeit", title: "Anfahrt erfasst", severity: "rot",
    test: ({ sel }) => !(Number(sel.value("distanceKm").replace(",", ".")) > 0) && "Keine Entfernung zum Kunden eingetragen." },
  { id: "reisezeit-fehlt", group: "arbeiten", target: "Arbeitszeit", title: "Reisezeit erfasst", severity: "rot",
    test: ({ sel }) => !/[1-9]/.test(sel.value("travelTime")) && "Keine Reisezeit (Hin-Fahrt) eingetragen." },
  { id: "material-leer", group: "material", title: "Material erfasst", severity: "rot", test: ({ materials }) => lines(materials).length === 0 && "Kein Material erfasst." },
  { id: "material-ohne-artikelid", group: "material", title: "Alle Positionen mit Artikel-ID", severity: "gelb",
    test: ({ materials }) => lines(materials).filter((l) => !l.productId && !l.id).map((l) => `Ohne Artikel-ID: ${nameOf(l)}`) },
  { id: "material-ohne-preis", group: "material", title: "Alle Positionen bepreist", severity: "gelb",
    test: ({ materials }) => lines(materials).filter((l) => total(l) <= 0).map((l) => `Preis 0,00 €: ${nameOf(l)}`) },
  // the old tray goes, no new one comes: worth a look. "Einbau der Duschwanne" ticked with the
  // switch off is the red row of the work-task coupling, so this one steps aside.
  { id: "duschwanne-aus", group: "material", target: "Duschwanne", title: "Duschwanne im Angebot", severity: "gelb",
    applies: ({ sel }) => !sel.trayEnabled() && sel.tasks.has("remove_showertub") && !sel.tasks.has("install_tray"),
    test: () => "Alte Duschwanne wird entfernt, aber keine neue Duschwanne im Angebot." },
  { id: "duschwanne-zubehoer", group: "material", target: "Duschwanne", title: "Zubehör zur Duschwanne vollständig", severity: "rot",
    applies: ({ sel }) => sel.trayEnabled(),
    test: ({ sel }) => TRAY_ACC.filter(([name]) => !sel.accessory(name)).map(([, label]) => `Nicht gewählt: ${label}.`) },
  { id: "wandverkleidung-vollstaendig", group: "material", target: "Wandverkleidung", title: "Wandverkleidung vollständig", severity: "rot",
    applies: ({ sel }) => sel.ticked("wvEnabled"),
    test: ({ sel, materials }) => {
      const missing: string[] = [], kind = sel.value("wvKind");
      if (!kind || kind === "Keine") missing.push("Art der Wandverkleidung fehlt.");
      // winwall carries its decor in the panel line, not in wvColor
      if (!sel.value("wvColor") && winwallPanels(materials) === 0) missing.push("Dekor / Farbe fehlt.");
      if (anyWvPanels(materials) === 0) missing.push("Keine Platten im Angebot — Plattenformat (997 / 1497) oder Menge fehlt (Standard: Wandbreiten im Bedarfsrechner).");
      return missing;
    } },
  // read from the priced lines: Silikon can sit ticked at quantity 0 (it follows the Abschlussprofil)
  { id: "wandverkleidung-zubehoer", group: "material", target: "Wandverkleidung", title: "Zubehör zur Wandverkleidung vollständig", severity: "rot",
    applies: ({ materials }) => wvPanels(materials) > 0,
    test: ({ materials, sel }) => {
      const missing: string[] = [];
      if (!wvLine(materials, "TRWDSET5")) missing.push("Nicht im Angebot: Wandabdichtung BASIS-Set.");
      if (!wvLine(materials, "R_4260602")) missing.push("Nicht im Angebot: Flächenkleber.");
      if (!lineQty(materials, "2000302")) missing.push(sel.ticked("wvSilikonSelected") ? "Silikon: Menge 0 — folgt der Menge des Abschlussprofils." : "Nicht im Angebot: Silikon.");
      return missing;
    } },
  { id: "wandverkleidung-abschlussprofil", group: "material", target: "Wandverkleidung", title: "Abschlussprofil im Angebot", severity: "gelb",
    applies: ({ materials }) => wvPanels(materials) > 0, test: ({ materials }) => !wvLine(materials, "V3A") && "Kein Abschlussprofil im Angebot — bitte Menge eintragen." },
  { id: "wandverkleidung-konfigurationsnr", group: "material", target: "Wandverkleidung", title: "Vigour Konfigurations-Nr. eingetragen", severity: "gelb",
    applies: ({ materials }) => wvLine(materials, "V3WVK999") || wvLine(materials, "V3WV999"),
    test: ({ sel }) => !sel.value("wvSonderConfigNr") && "Sonderdruck im Angebot, aber die Konfigurations-Nr. von Vigour fehlt noch." },
  // the count the price uses when the field is empty: panels − 1 − outside corners
  { id: "wandverkleidung-verbindungsprofil", group: "material", target: "Wandverkleidung", title: "Verbindungsprofile ausreichend", severity: "gelb",
    applies: ({ materials }) => wvPanels(materials) > 0,
    test: ({ materials, sel }) => {
      const needed = Math.max(0, wvPanels(materials) - 1 - (Number(sel.value("wvCornersCount")) || 0)), have = lineQty(materials, "V3V", "Wandverkleidung");
      return have < needed && `${needed} Verbindungsprofil(e) nötig (Platten − 1 − Außenecken), ${have} im Angebot.`;
    } },
  { id: "waschtisch-zubehoer", group: "optional", target: "Optional", title: "Zubehör zum Waschtisch vollständig", severity: "rot",
    applies: (ctx) => { const ids = pricedIds(ctx); return BASINS.some((p) => ids.has(p)) || ctx.sel.opt("optBasin[]") || BASIN_ACC.some(([p]) => ids.has(p)); },
    test: (ctx) => { const ids = pricedIds(ctx); return BASIN_ACC.filter(([p]) => !ids.has(p)).map(([, label]) => `Nicht im Angebot: ${label}.`); } },
  // a new wall-hung WC needs frame and fittings; a new bowl on an existing frame does not ("Nicht nötig")
  { id: "wc-zubehoer", group: "optional", target: "Optional", title: "Zubehör zum WC vollständig", severity: "rot", ackable: true,
    applies: (ctx) => wcKind(ctx) !== null,
    test: (ctx) => {
      const ids = pricedIds(ctx), kind = wcKind(ctx);
      const required = kind === "wall"
        ? [["CVIS3WCT112", "WC-Element"], ["SCHALL", "Montageset"], ["V1DON", "Betätigungsplatte"], ["0601010003", "Gipskarton-Bauplatte"], ["WWCAG90", "Anschlussgarnitur"]]
        : [["WCBF", "Befestigungssatz (WCBF)"], ["CLPSSI", "WC-Sitz für Stand-WC"], ["WWCAG90", "Anschlussgarnitur"]];
      const missing = required.filter(([pid]) => !ids.has(pid!)).map(([, label]) => `Nicht im Angebot: ${label}.`);
      if (kind === "wall" && !ids.has("DERSIAS") && !ids.has("CLSIAS")) missing.push("Nicht im Angebot: WC-Sitz.");
      return missing;
    } },
  // whether a widening profile is needed depends on the measured niche: a reminder that can be confirmed
  { id: "duschabtrennung-verbreiterung", group: "material", target: "DuschabtrennungNeu", title: "Verbreiterungsprofil geprüft", severity: "gelb", ackable: true,
    applies: ({ sel }) => sel.daVigour(),
    test: ({ sel }) => !sel.daLines().some((l) => /^VZVP/i.test(String(l?.articleNumber || ""))) && "Kein Verbreiterungsprofil gewählt — nötig, wenn die Nische breiter ist als die Abtrennung." },
  { id: "duschwanne-ohne-abtrennung", group: "material", title: "Duschwanne mit Abtrennung", severity: "gelb",
    test: ({ materials }) => { const ls = lines(materials); return hasCategory(ls, "Duschwanne") && !hasCategory(ls, "Duschabtrennung") && "Duschwanne ohne Duschabtrennung/Duschvorhang."; } },
  { id: "optional-ohne-menge", group: "optional", title: "Optionale Produkte mit Menge", severity: "gelb",
    test: ({ optionals }) => lines(optionals).filter((l) => Number(l?.qty) <= 0).map((l) => `Menge 0: ${nameOf(l)}`) },
];

interface WorkRule { task: string; label: string; needs: string; group: GroupKey; target: string; severity: Status; has: (sel: Selection) => boolean; missingText?: (sel: Selection) => string | null; sharesWith?: string[]; noReverse?: boolean }
const optional = (task: string, label: string, needs: string, has: WorkRule["has"], sharesWith?: string[]): WorkRule => ({ task, label, needs, group: "optional", target: "Optional", severity: "rot", has, ...(sharesWith ? { sharesWith } : {}) });
const wc = (sel: Selection) => sel.wcPicked() || [...WC_WALL, ...WC_FLOOR].some((p) => sel.priced(p));
/** One work task and the selection it needs — checked both ways (task without product, product without task). */
export const WORK_RULES: readonly WorkRule[] = [
  optional("replace_thermostat", "Auswechseln eines Aufputz-Thermostats", "Produkt aus „Austausch eines Thermostates“", (s) => s.opt("optThermo[]")),
  // the two shower-system tasks share one product group: a product satisfies either
  optional("replace_shower_no_thermo", "Auswechseln des Duschsystems ohne Thermostat", "Produkt aus „Auswechseln des Duschsystems“", (s) => s.opt("optShower[]"), ["replace_shower_with_thermo"]),
  optional("replace_shower_with_thermo", "Auswechseln des Duschsystems inkl. Aufputz-Thermostat", "Produkt aus „Auswechseln des Duschsystems“", (s) => s.opt("optShower[]"), ["replace_shower_no_thermo"]),
  optional("replace_sink_faucet", "Auswechseln einer Waschbecken-Armatur", "Produkt aus „Einhand-Waschtischbatterie“", (s) => s.opt("optBasinTap[]")),
  optional("install_sink", "Einbau eines Waschbeckens", "Produkt aus „Waschtisch ohne Unterschrank“", (s) => s.opt("optBasin[]") || BASINS.some((p) => s.priced(p))),
  optional("install_shower_basket", "Einbau eines Duschkorbes", "Produkt aus „Duschzubehör“", (s) => s.opt("optDuschzub[]")),
  optional("install_lifting_unit", "Einbau einer Schmutzwasserhebeanlage", "Produkt aus „Hebeanlage“", (s) => s.opt("optHebe[]")),
  optional("install_bathtub", "Einbau der Badewanne", "Produkt aus „Wanne“", (s) => s.field("chosenBathtubProductId")),
  optional("install_bathtub_screen", "Einbau des Wannenaufsatzes", "Produkt aus „Wanne“ → Wannenaufsatz", (s) => s.field("chosenScreenProductId")),
  optional("install_toilet", "Einbau einer Toilette", "Produkt aus „WC“", wc, ["install_shower_wc"]),
  optional("install_shower_wc", "Einbau eines Dusch-WCs", "Produkt aus „WC“", wc, ["install_toilet"]),
  { task: "install_tray", label: "Einbau der Duschwanne", needs: "eine Duschwanne", group: "material", target: "Duschwanne", severity: "rot", has: (s) => s.material("Duschwanne"),
    missingText: (s) => (s.trayEnabled() ? null : "Die Duschwanne ist auf der Duschwanne-Seite ausgeschaltet.") },
  { task: "install_enclosure", label: "Einbau der Duschabtrennung", needs: "eine Duschabtrennung", group: "material", target: "DuschabtrennungNeu", severity: "rot",
    has: (s) => s.material("Duschabtrennung") || s.daConfigured(), sharesWith: ["install_distance_profile"] },
  // the curtain's lines are priced under "Duschabtrennung": only its configuration says a curtain was picked
  { task: "install_shower_curtain", label: "Einbau eines Duschvorhangs", needs: "einen Duschvorhang", group: "material", target: "Duschvorhang", severity: "rot", has: (s) => s.curtainConfigured() },
  // plausible without, so only a hint — and never asked the other way round
  { task: "trockenbau_duschbereich", label: "Trockenbau im Duschbereich", needs: "eine Wandverkleidung", group: "material", target: "Wandverkleidung", severity: "gelb", has: (s) => s.material("Wandverkleidung"), noReverse: true, sharesWith: ["trockenbau_wc"] },
  { task: "trockenbau_wc", label: "Trockenbau für das WC", needs: "eine Wandverkleidung", group: "material", target: "Wandverkleidung", severity: "gelb", has: (s) => s.material("Wandverkleidung"), noReverse: true, sharesWith: ["trockenbau_duschbereich"] },
  { task: "install_distance_profile", label: "Einbau eines Abstandsprofils", needs: "eine Duschabtrennung", group: "material", target: "DuschabtrennungNeu", severity: "gelb", has: (s) => s.material("Duschabtrennung"), noReverse: true, sharesWith: ["install_enclosure"] },
];

/** A new item goes in — is there an old one to remove? Only the user knows the site. */
export const RUECKBAU: readonly { task: string; when: string[]; question: string }[] = [
  { task: "remove_toilet", when: ["install_toilet", "install_shower_wc"], question: "Ist eine alte Toilette vorhanden, die entfernt werden muss?" },
  { task: "remove_sink", when: ["install_sink"], question: "Ist ein altes Waschbecken vorhanden, das entfernt werden muss?" },
  { task: "remove_enclosure", when: ["install_enclosure", "install_shower_curtain"], question: "Ist eine alte Duschabtrennung vorhanden, die entfernt werden muss?" },
  { task: "remove_shower_curtain", when: ["install_enclosure", "install_shower_curtain"], question: "Ist ein alter Duschvorhang vorhanden, der entfernt werden muss?" },
  { task: "remove_furniture", when: ["install_furniture"], question: "Sind alte Bademöbel vorhanden, die entfernt werden müssen?" },
];

/** What the rules read, from the offer and its price. */
export function selectionOf(offer: Fields, price: Price | null | undefined): Selection {
  const dw = obj(offer.duschwanne), wv = obj(offer.wandverkleidung), da = obj(offer.duschabtrennung), dv = obj(offer.duschvorhang), opt = obj(offer.optional), az = obj(offer.Arbeitszeit), kd = obj(offer.Kundendaten);
  const matLines = lines(price?.materialsDisplayUI ?? price?.materials), priced = new Set([...matLines, ...lines(price?.optionalDisplayUI)].map(idOf));
  const daConf = obj(da.configurator), daStored = list(daConf.lines) as { articleNumber?: string }[];
  const states = (Array.isArray(daConf.state) ? daConf.state : daConf.state ? [daConf.state] : []) as Fields[];
  const values: Record<string, unknown> = { distanceKm: az.distanceKm, travelTime: az.travelTimeHHMM ?? az.travelTime, wvKind: wv.wvKind, wvColor: wv.wvColor, wvSonderConfigNr: wv.wvSonderConfigNr, wvCornersCount: wv.wvCornersCount };
  const view = markupView(text(obj(offer.rabatt).sonderaufschlagValue ?? kd.aufschlag).replace(/%$/, ""), kd.payer, kd.aufschlagBegruendung), reason = text(kd.aufschlagBegruendung);
  return {
    tasks: new Set([...list(dw.workTasks), ...list(dw.extraTasks)].map(String)),
    opt: (name) => list(opt[name]).length > 0,
    wcPicked: () => [...WC_WALL, ...WC_FLOOR, ...WC_PARTS].some((p) => opt[`opt_${p}`] === true || Number(opt[`qty_${p}`]) > 0),
    field: (name) => !!text(opt[name] ?? dw[name]),
    value: (name) => text(values[name]),
    ticked: (name) => wv[name] === true || wv[name] === "on",
    priced: (id) => priced.has(id),
    material: (category) => hasCategory(matLines, category),
    trayEnabled: () => dw.trayEnabled === true,
    accessory: (name) => !!dw[name],
    daLines: () => (da.configEnabled === false ? [] : daStored),
    daVigour: () => daStored.length > 0 && states.some((s) => String(s?.__supplier || "").toUpperCase() !== "BADOLUX"),
    daConfigured: () => daStored.length > 0,
    curtainConfigured: () => list(obj(dv.configurator).lines).length > 0,
    acked: (id) => obj(obj(offer.zusammenfassung).checkAck)[id] === true,
    umbauart: text(dw.umbauart),
    markup: view.below && reason ? { min: view.min, reason } : null,
  };
}
/** everything that can be ticked in the WC menu besides the bowls */
const WC_PARTS = ["CVIS3WCT112", "SCHALL", "V1DON", "0601010003", "WWCAG90", "WCBF", "CLPSSI", "DERSIAS", "CLSIAS"];

function standingRows(ctx: Ctx): Row[] {
  const rows: Row[] = [];
  for (const rule of RULES) {
    try {
      if (rule.applies && !rule.applies(ctx)) continue;
      const hits = rule.test(ctx), details = (Array.isArray(hits) ? hits : [hits]).filter(Boolean) as string[];
      const acked = !!(rule.ackable && details.length && ctx.sel.acked(rule.id));
      rows.push({ id: rule.id, group: rule.group, target: rule.target || GROUPS.find((g) => g.key === rule.group)!.target, title: rule.title,
        status: details.length && !acked ? rule.severity : "gruen", details: acked ? ["Als nicht nötig markiert."] : details, ...(rule.ackable && (details.length > 0 || acked) ? { ack: acked } : {}), ...(rule.internal ? { internal: true as const } : {}) });
    } catch { /* a broken rule must never break the check */ }
  }
  return rows;
}
function workRows(sel: Selection): Row[] {
  const rows: Row[] = [];
  for (const rule of WORK_RULES) {
    const ticked = sel.tasks.has(rule.task), picked = !!rule.has(sel);
    if (ticked) {
      rows.push({ id: `arbeit-${rule.task}`, group: rule.group, target: rule.target, title: rule.label, status: picked ? "gruen" : rule.severity, details: picked ? [] : [rule.missingText?.(sel) || `Es fehlt ${rule.needs}.`] });
    } else if (picked && !rule.noReverse && !(rule.sharesWith || []).some((t) => sel.tasks.has(t))) {
      if (rows.some((r) => r.title === rule.needs)) continue; // two tasks, one product group: one orphaned product
      rows.push({ id: `produkt-${rule.task}`, group: "arbeiten", target: "Arbeiten", title: rule.needs, status: "gelb", details: [`Gewählt, aber „${rule.label}“ ist nicht angehakt.`] });
    }
  }
  return rows;
}
function rueckbauRows(sel: Selection): Row[] {
  const rows: Row[] = [];
  for (const q of RUECKBAU) {
    if (!q.when.some((t) => sel.tasks.has(t))) continue;
    const id = `rueckbau-${q.task}`, yes = sel.tasks.has(q.task), no = !yes && sel.acked(id);
    rows.push({ id, group: "arbeiten", target: "Arbeiten", title: q.question, status: yes || no ? "gruen" : "gelb",
      details: [yes ? "Ja – Entfernen und Entsorgen ist angehakt." : no ? "Nein – nichts zu entfernen." : "Bitte mit Ja oder Nein beantworten."], question: { task: q.task, answer: yes ? "ja" : no ? "nein" : "" } });
  }
  if (!sel.umbauart) { // without an Umbauart nothing is ticked automatically (older offers too)
    const acked = sel.acked("umbauart");
    rows.push({ id: "umbauart", group: "arbeiten", target: "Arbeiten", title: "Umbauart gewählt", status: acked ? "gruen" : "gelb",
      details: [acked ? "Als nicht nötig markiert." : "Keine Umbauart gewählt – Arbeiten werden nicht automatisch angehakt."], ack: acked });
  }
  return rows;
}

/** The check of an offer with its price. */
export function check(offer: Fields | null | undefined, price: Price | null | undefined): Result {
  const sel = selectionOf(offer ?? {}, price);
  const ctx: Ctx = { services: obj(price?.servicesDisplayUI ?? price?.services), materials: obj(price?.materialsDisplayUI ?? price?.materials), optionals: obj(price?.optionalDisplayUI), sel };
  const all = [...standingRows(ctx), ...workRows(sel), ...rueckbauRows(sel)];
  const groups = GROUPS.map((g) => {
    const rows = all.filter((r) => r.group === g.key).sort((a, b) => RANK[b.status] - RANK[a.status]); // worst first
    return { ...g, rows, status: rows.reduce<Status>((s, r) => worst(s, r.status), "gruen"),
      counts: (["rot", "gelb", "gruen"] as const).map((status) => ({ status, count: rows.filter((r) => r.status === status).length })).filter((c) => c.count) };
  });
  return { status: groups.reduce<Status>((s, g) => worst(s, g.status), "gruen"), groups };
}

/** "Nicht nötig" ticked or taken back → the new `zusammenfassung.checkAck`. */
export function acknowledged(offer: Fields, id: string, on: boolean): Fields {
  const { [id]: _old, ...rest } = obj(obj(offer.zusammenfassung).checkAck);
  return { checkAck: on ? { ...rest, [id]: true } : rest };
}
