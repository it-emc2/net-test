// Admin area — the rules of today's admin panel (src/public/admin/admin.js, src/public/AdminManager.js),
// pure functions, no React. Recorded behaviour: v2/apps/web/test/fixtures/admin.json
// (v2/scripts/capture-admin.cjs); differences: UX-CHANGES U-065.
//
// Settings (admin.js handleInput/saveChanges/resetKey):
//  - one list of pending changes across all sections; "Speichern (n)" sends them in ONE
//    PUT /admin/api/config { key: value, … }; the counter reads "1 Änderung" / "n Änderungen"
//  - number/euro/percent: parseFloat (integer: parseInt) of the text; not a number → the change is
//    dropped; the stored value again → the change is dropped
//  - boolean: the switch; the stored value again → dropped
//  - text-list: split at line breaks and commas, trimmed, empty parts left out
//  - json: JSON.parse; invalid → the change is dropped and the field is marked
//  - reset: POST /admin/api/config/reset { key } → the server's default; the pending change goes
//  - the default is shown as "Standard: <value> <unit>"; booleans read "Aktiv"/"Inaktiv"
// Users (admin.js saveUser): POST /admin/api/users { firstName, lastName, email, password, role }
//  - names and e-mail trimmed, the password as typed; "E-Mail erforderlich" without e-mail
//  - an empty password keeps the stored one (the server needs one for a new user)
// Catalog (AdminManager.js): one product / service per POST /api/products|services/bulk [ {…} ]
//  - product: id, name, price > 0 (today's parseMoneyEuro), optional dimensions, source, manufacturer (null when empty)
//  - service: id, name, price ≥ 0, time ≥ 0 (minutes), optional internal name, description, source
export type ConfigType = "percent" | "euro" | "number" | "integer" | "boolean" | "json" | "text-list" | string;
export interface ConfigItem {
  key: string; label: string; description?: string; note?: string; unit?: string;
  type: ConfigType; section: string; order: number; defaultValue: unknown; value: unknown;
}

/** today's sidebar, in its order (admin.js SECTIONS); `settings` = a section of business settings */
export const SETTINGS_SECTIONS = [
  { id: "shared", label: "Allgemein" },
  { id: "fahrt", label: "Arbeitszeit & Fahrt" },
  { id: "bu", label: "BU – Badumbau" },
  { id: "arbeitszeiten", label: "Arbeitszeiten je Tätigkeit" },
  { id: "bwt", label: "BWT – Badewannentür" },
  { id: "hl", label: "HL – Handläufe" },
  { id: "ah", label: "AH – Alltagshilfe" },
  { id: "zuschuss", label: "Zuschüsse & Boni" },
] as const;

/** the admin pages besides the settings, in the order of the navigation */
export const PAGES = [
  { path: "benutzer", label: "Benutzer" },
  { path: "katalog", label: "Produkte & Leistungen" },
  { path: "signatur-links", label: "Signatur-Links" },
  { path: "pdf-engine", label: "PDF-Engine" },
  { path: "bitrix-fehler", label: "Bitrix-Fehler" },
  { path: "aktivitaet", label: "Aktivitäts-Log" },
  { path: "planung", label: "Diagnose Planung" },
] as const;

export const isAdmin = (user: { role?: string | undefined } | null | undefined): boolean => user?.role === "admin";

// ---------- settings ----------
/** today's formatNum: up to 4 decimals without trailing zeros; lists as "[n Einträge]" */
export function formatValue(v: unknown, type: ConfigType): string {
  if (v === null || v === undefined) return "";
  if (type === "boolean") return v ? "Aktiv" : "Inaktiv";
  if (type === "json" || type === "text-list") return Array.isArray(v) ? `[${v.length} Einträge]` : "–";
  const n = Number(v);
  if (type === "integer") return String(Math.round(n));
  return String(parseFloat(n.toFixed(4)));
}

/** the text a field starts with */
export function inputText(v: unknown, type: ConfigType): string {
  if (type === "text-list") return (Array.isArray(v) ? v : []).join("\n");
  if (type === "json") return JSON.stringify(v ?? {}, null, 2);
  return formatValue(v, type);
}

export type Parsed = { kind: "change"; value: unknown } | { kind: "same" } | { kind: "invalid" };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** what a typed text (or a switch) means for one setting — today's handleInput. A comma counts as
 *  a decimal point (U-065; today's number field takes no comma). */
export function parseInput(item: Pick<ConfigItem, "type" | "value">, raw: string | boolean): Parsed {
  if (item.type === "boolean") return raw !== item.value ? { kind: "change", value: raw === true } : { kind: "same" };
  const text = String(raw).trim();
  if (item.type === "text-list") {
    const list = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    return same(list, Array.isArray(item.value) ? item.value : []) ? { kind: "same" } : { kind: "change", value: list };
  }
  if (item.type === "json") {
    try { const v: unknown = JSON.parse(text); return same(v, item.value) ? { kind: "same" } : { kind: "change", value: v }; }
    catch { return { kind: "invalid" }; }
  }
  const t = text.replace(",", ".");
  const n = item.type === "integer" ? parseInt(t, 10) : parseFloat(t);
  if (Number.isNaN(n) || n === item.value) return { kind: "same" };
  return { kind: "change", value: n };
}

export const changeCount = (n: number): string => (n > 0 ? `${n} Änderung${n > 1 ? "en" : ""}` : "");
export const saveLabel = (n: number): string => (n > 0 ? `Speichern (${n})` : "Speichern");
export const defaultHint = (item: Pick<ConfigItem, "defaultValue" | "type" | "unit">): string =>
  `Standard: ${formatValue(item.defaultValue, item.type)}${item.unit ? " " + item.unit : ""}`;
/** one line per pending change for the confirmation: label, old → new */
export const changeLines = (items: readonly ConfigItem[], changes: Record<string, unknown>) =>
  Object.entries(changes).map(([key, v]) => {
    const it = items.find((i) => i.key === key);
    const unit = it?.unit ? ` ${it.unit}` : "";
    const fmt = (x: unknown) => (it?.type === "json" ? JSON.stringify(x) : it?.type === "text-list" && Array.isArray(x) ? x.join(", ") || "–" : formatValue(x, it?.type ?? "number") + unit);
    return { key, label: it?.label ?? key, from: fmt(it?.value), to: fmt(v) };
  });

// ---------- users ----------
export interface AdminUser { email: string; firstName?: string | null | undefined; lastName?: string | null | undefined; name?: string | null | undefined; role?: string | null | undefined; active?: boolean | null | undefined; hasSignature?: boolean | null | undefined }
export interface UserForm { firstName: string; lastName: string; email: string; password: string; role: "user" | "admin"; active: boolean }
export const EMPTY_USER: UserForm = { firstName: "", lastName: "", email: "", password: "", role: "user", active: true };
/** the form of an existing user: names, role and state as stored, no password */
export const formOf = (u: AdminUser): UserForm => ({
  firstName: u.firstName ?? "", lastName: u.lastName ?? "", email: u.email, password: "", role: u.role === "admin" ? "admin" : "user", active: u.active !== false,
});
/** today's body; `active: false` only for a deactivated user (the server treats a missing flag as active) */
export function userBody(f: UserForm): { error: string } | { body: Record<string, unknown> } {
  const body: Record<string, unknown> = { firstName: f.firstName.trim(), lastName: f.lastName.trim(), email: f.email.trim(), password: f.password, role: f.role };
  if (!body.email) return { error: "E-Mail erforderlich" };
  if (!f.active) body.active = false;
  return { body };
}
/** what an admin must not do to the own account (the server does not check it): no own demotion or deactivation */
export function selfLockout(f: UserForm, me: string): string {
  if (f.email.trim().toLowerCase() !== me.trim().toLowerCase()) return "";
  if (f.role !== "admin") return "Sie können sich die eigene Admin-Rolle nicht entziehen.";
  if (!f.active) return "Sie können Ihr eigenes Konto nicht deaktivieren.";
  return "";
}
export const displayName = (u: AdminUser): string => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.name || "–";

// ---------- catalog ----------
/** today's parseMoneyEuro: "1.234,50" → 1234.5, "199,90" → 199.9; not above 0 → 0 */
export function parseMoney(v: unknown): number {
  let s = String(v ?? "").trim();
  if (!s) return 0;
  s = s.replace(/[^\d,.-]/g, "").replace(/\s+/g, "");
  const comma = s.includes(","), dot = s.includes(".");
  if (comma && dot) s = s.replace(/\./g, "").replace(",", ".");
  else if (comma) s = s.replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export interface ProductForm { productId: string; name: string; price: string; widthCm: string; lengthCm: string; heightCm: string; source: string; manufacturer: string }
export const EMPTY_PRODUCT: ProductForm = { productId: "", name: "", price: "", widthCm: "", lengthCm: "", heightCm: "", source: "", manufacturer: "" };
const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
export function productBody(f: ProductForm): { error: string } | { body: Record<string, unknown> } {
  const productId = f.productId.trim(), name = f.name.trim(), priceRaw = f.price.trim();
  if (!productId || !name || !priceRaw) return { error: "Bitte mindestens Produkt-ID, Name und Preis ausfüllen." };
  const price = parseMoney(priceRaw);
  if (!(price > 0)) return { error: "Preis ist ungültig oder 0." };
  const dims: Record<string, number> = {};
  for (const k of ["widthCm", "lengthCm", "heightCm"] as const) { const n = num(f[k]); if (n !== undefined && !Number.isNaN(n)) dims[k] = n; }
  return { body: { productId, name, price, ...dims, ...(f.source.trim() ? { source: f.source.trim() } : {}), manufacturer: f.manufacturer.trim() || null } };
}
export interface ServiceForm { serviceId: string; name: string; internal_name: string; description: string; price: string; time: string; source: string }
export const EMPTY_SERVICE: ServiceForm = { serviceId: "", name: "", internal_name: "", description: "", price: "", time: "", source: "" };
export function serviceBody(f: ServiceForm): { error: string } | { body: Record<string, unknown> } {
  const serviceId = f.serviceId.trim(), name = f.name.trim(), priceRaw = f.price.trim(), timeRaw = f.time.trim();
  if (!serviceId || !name || !priceRaw || !timeRaw) return { error: "Bitte mindestens Service-ID, Name, Preis und Zeit (Minuten) ausfüllen." };
  const price = parseMoney(priceRaw);
  if (!(price >= 0)) return { error: "Preis ist ungültig." };
  const time = Number(timeRaw);
  if (!(time >= 0)) return { error: "Zeit ist ungültig." };
  return { body: {
    serviceId, name, price, time,
    ...(f.internal_name.trim() ? { internal_name: f.internal_name.trim() } : {}),
    ...(f.description.trim() ? { description: f.description.trim() } : {}),
    ...(f.source.trim() ? { source: f.source.trim() } : {}),
  } };
}
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
export const productForm = (p: Record<string, unknown>): ProductForm => ({
  productId: str(p.productId), name: str(p.name), price: typeof p.price === "number" ? String(p.price).replace(".", ",") : "",
  widthCm: str(p.widthCm), lengthCm: str(p.lengthCm), heightCm: str(p.heightCm), source: str(p.source), manufacturer: str(p.manufacturer),
});
export const serviceForm = (s: Record<string, unknown>): ServiceForm => ({
  serviceId: str(s.serviceId), name: str(s.name), internal_name: str(s.internal_name), description: str(s.description),
  price: typeof s.price === "number" ? String(s.price).replace(".", ",") : "", time: str(s.time ?? 0), source: str(s.source),
});
/** the list shows this many rows; the search narrows it (today: all rows of the database at once) */
export const LIST_LIMIT = 200;

// ---------- logs, statistics, signing ----------
/** "20.11.26, 10:15" as today; "–" when empty or not a date */
export function fmtTs(d: unknown): string {
  if (!d) return "–";
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) return "–";
  return dt.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export const fmtMs = (ms: unknown): string => (ms == null ? "–" : Number(ms) >= 1000 ? (Number(ms) / 1000).toFixed(1) + " s" : `${Number(ms)} ms`);
export const fmtDur = (ms: number): string => {
  if (ms < 60000) return Math.round(ms / 1000) + " s";
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
};

export const SIGN_STATUS: Record<string, string> = {
  sent: "Gesendet", opened: "Geöffnet", partially_signed: "Teilw. unterschrieben", completed: "Vollständig", expired: "Abgelaufen",
};
export const SIGN_STAT_ORDER = ["sent", "opened", "partially_signed", "completed", "expired"] as const;

export const PDF_KIND: Record<string, string> = { docx: "DOCX → PDF", html: "HTML → PDF" };
export const PDF_ENGINE: Record<string, string> = { gotenberg: "Gotenberg", fallback: "Fallback (lokal nach Gotenberg-Fehler)", local: "Lokal (ohne Gotenberg)" };
export const PDF_DAYS = [1, 7, 30, 90, 180] as const;
interface PdfRow { kind: string; engine: string; total: number; ok: number; failed: number; avgMs?: number | null; maxMs?: number | null; last?: unknown }
interface PdfStats { rows: PdfRow[]; saved?: Record<string, { baselineMs: number; measured: boolean; ms: number }> }
/** today's five counters: delivered PDFs, share via Gotenberg, fallbacks, final failures, time saved */
export function pdfSummary(d: PdfStats): { value: string; label: string }[] {
  const okOf = (f: (r: PdfRow) => boolean) => d.rows.filter(f).reduce((n, r) => n + r.ok, 0);
  const total = okOf(() => true);
  const got = okOf((r) => r.engine === "gotenberg");
  const fallbacks = d.rows.filter((r) => r.engine === "fallback").reduce((n, r) => n + r.total, 0);
  const failed = d.rows.filter((r) => r.engine !== "gotenberg").reduce((n, r) => n + r.failed, 0);
  const savedMs = (d.saved?.docx?.ms ?? 0) + (d.saved?.html?.ms ?? 0);
  return [
    { value: String(total), label: "PDFs erzeugt" },
    { value: total ? Math.round((got / total) * 100) + " %" : "–", label: "über Gotenberg" },
    { value: String(fallbacks), label: "Fallbacks" },
    { value: String(failed), label: "Endgültig fehlgeschlagen" },
    { value: fmtDur(savedMs), label: "Zeit gespart (geschätzt)" },
  ];
}
export const pdfBaseline = (d: PdfStats): string =>
  (["docx", "html"] as const).map((k) => `${PDF_KIND[k]} vorher Ø ${fmtMs(d.saved?.[k]?.baselineMs)} (${d.saved?.[k]?.measured ? "gemessen" : "Benchmark"})`).join(" · ");
/** today's order: by kind, then Gotenberg, Fallback, Lokal */
export const sortPdfRows = <T extends { kind: string; engine: string }>(rows: readonly T[]): T[] => {
  const order = ["gotenberg", "fallback", "local"];
  return [...rows].sort((a, b) => a.kind.localeCompare(b.kind) || order.indexOf(a.engine) - order.indexOf(b.engine));
};

export const USER_EVENTS = [
  { value: "", label: "Alle Ereignisse" },
  { value: "offer_sent", label: "Angebot gesendet" },
  { value: "move_dialog_shown", label: "Verschieben-Dialog gezeigt" },
  { value: "move_dialog_dismissed", label: "Verschieben-Dialog geschlossen (ohne Aktion)" },
  { value: "move_succeeded", label: "Deal verschoben" },
  { value: "move_failed", label: "Deal-Verschieben fehlgeschlagen" },
  { value: "termin_opened", label: "Termin geöffnet" },
  { value: "configurator_opened", label: "Konfigurator geöffnet" },
  { value: "duschabtrennung_leaf_selected", label: "Duschabtrennung: Blatt gewählt" },
] as const;

/** a query string from filled filters only, in the given order ("event=a&dealId=b") */
export const queryOf = (pairs: readonly (readonly [string, string])[]): string => {
  const p = new URLSearchParams();
  for (const [k, v] of pairs) if (v) p.set(k, v);
  return p.toString();
};
